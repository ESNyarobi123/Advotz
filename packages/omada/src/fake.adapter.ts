import { CAPABILITY_OPERATIONS, unsupported, type CapabilityResult, type ControllerCapabilities } from "./capabilities.js";
import {
  normalizeMac,
  type AuthorizationObservation,
  type AuthorizationResult,
  type ClientAuthorizationInput,
  type ClientLocator,
  type ControllerInspection,
  type CreateSiteInput,
  type OmadaControllerAdapter,
  type RemoteClient,
  type RemoteDevice,
  type RemoteOperationResult,
  type RemoteSiteLocator,
  type RemoteSiteResult,
  type UsageObservation,
} from "./controller-adapter.js";
import { ControllerError, UnsupportedCapabilityError } from "./errors.js";

/** Client MACs that trigger deterministic failure scenarios in the simulator. */
export const FAKE_CLIENT_SCENARIOS = {
  rejected: "02:00:00:00:00:01",
  timeoutAfterAccept: "02:00:00:00:00:02",
  unreachable: "02:00:00:00:00:03",
} as const;

function simulated(): CapabilityResult {
  return { supported: true, verified: false, reason: "Development simulator — not lab evidence" };
}

type FakeState = {
  sites: Map<string, RemoteSiteResult>;
  auth: Map<string, AuthorizationObservation>;
};

const sharedState: FakeState = { sites: new Map(), auth: new Map() };

/**
 * Development simulation. It never touches hardware and cannot prove Controller behaviour.
 * Production startup rejects FAKE controllers.
 */
export class FakeOmadaAdapter implements OmadaControllerAdapter {
  readonly simulated = true;

  constructor(private readonly state: FakeState = sharedState) {}

  static resetSharedState() {
    sharedState.sites.clear();
    sharedState.auth.clear();
  }

  async inspectController(): Promise<ControllerInspection> {
    return { type: "fake", version: "simulated", controllerId: "fake-controller", reachable: true };
  }

  async getCapabilities(): Promise<ControllerCapabilities> {
    const caps = Object.fromEntries(CAPABILITY_OPERATIONS.map((op) => [op, simulated()])) as ControllerCapabilities;
    caps.adoptDevice = unsupported("Adoption requires a real Controller and EAP");
    caps.provisionSsid = unsupported("SSID provisioning requires the Controller's verified API");
    caps.configureExternalPortal = unsupported("Portal assignment requires the Controller's verified API");
    caps.readUsage = unsupported("Usage counters require lab evidence");
    caps.totalTrafficQuota = unsupported("Quota enforcement requires lab evidence");
    caps.dailyMonthlyQuotaWindows = unsupported("No verified reset mechanism");
    caps.afterLimitReduceSpeed = unsupported("Not validated");
    caps.afterLimitRedirect = unsupported("Not validated");
    caps.reboot = unsupported("Not implemented");
    return caps;
  }

  async createSite(input: CreateSiteInput): Promise<RemoteSiteResult> {
    const existing = await this.findSiteByName(input.name);
    if (existing) return existing;
    const remote = { remoteSiteId: `fake-site-${input.externalId}`, name: input.name };
    this.state.sites.set(remote.remoteSiteId, remote);
    return remote;
  }

  async findSiteByName(name: string): Promise<RemoteSiteResult | null> {
    return [...this.state.sites.values()].find((s) => s.name === name) ?? null;
  }

  async getSite(input: RemoteSiteLocator): Promise<RemoteSiteResult> {
    const site = this.state.sites.get(input.remoteSiteId);
    if (!site) throw new ControllerError("Site not found", "rejected", false);
    return site;
  }

  async listDevices(): Promise<RemoteDevice[]> {
    return [];
  }

  async adoptDevice(): Promise<RemoteOperationResult> {
    return { ok: false, unsupported: true, reason: "Adoption requires a real Controller and EAP" };
  }

  async listClients(): Promise<RemoteClient[]> {
    return [];
  }

  async provisionSsid(): Promise<RemoteOperationResult> {
    return { ok: false, unsupported: true, reason: "SSID provisioning unverified" };
  }

  async configureExternalPortal(): Promise<RemoteOperationResult> {
    return { ok: false, unsupported: true, reason: "External portal assignment unverified" };
  }

  async authorizeClient(input: ClientAuthorizationInput): Promise<AuthorizationResult> {
    const mac = normalizeMac(input.target.clientMac) ?? input.target.clientMac;
    if (mac === FAKE_CLIENT_SCENARIOS.unreachable) {
      throw new ControllerError("Simulated Controller unreachable", "network", false);
    }
    if (mac === FAKE_CLIENT_SCENARIOS.rejected) {
      return { accepted: false, submittedExpiresAtMs: input.expiresAtMs, vendorErrorCode: -1, rawSanitized: { simulated: true } };
    }
    this.state.auth.set(`${input.remoteSiteId}|${mac}`, {
      known: true,
      authorized: true,
      expiresAt: new Date(input.expiresAtMs).toISOString(),
    });
    if (mac === FAKE_CLIENT_SCENARIOS.timeoutAfterAccept) {
      throw new ControllerError("Simulated timeout after Controller accepted", "timeout", true);
    }
    return { accepted: true, submittedExpiresAtMs: input.expiresAtMs, vendorErrorCode: 0, rawSanitized: { simulated: true } };
  }

  async getClientAuthorization(input: ClientLocator): Promise<AuthorizationObservation> {
    const mac = normalizeMac(input.clientMac) ?? input.clientMac;
    const found = this.state.auth.get(`${input.remoteSiteId}|${mac}`);
    if (!found) return { known: true, authorized: false };
    if (found.expiresAt && new Date(found.expiresAt).getTime() < Date.now()) {
      return { known: true, authorized: false, expiresAt: found.expiresAt };
    }
    return found;
  }

  async disconnectClient(): Promise<RemoteOperationResult> {
    // Disconnect is not revoke: authorization remains and the client may reconnect.
    return { ok: true, rawSanitized: { simulated: true } };
  }

  async revokeAuthorization(input: ClientLocator): Promise<RemoteOperationResult> {
    const mac = normalizeMac(input.clientMac) ?? input.clientMac;
    this.state.auth.set(`${input.remoteSiteId}|${mac}`, { known: true, authorized: false });
    return { ok: true, rawSanitized: { simulated: true } };
  }

  async blockClient(input: ClientLocator): Promise<RemoteOperationResult> {
    return this.revokeAuthorization(input);
  }

  async unblockClient(): Promise<RemoteOperationResult> {
    return { ok: true, rawSanitized: { simulated: true } };
  }

  async readUsage(): Promise<UsageObservation> {
    throw new UnsupportedCapabilityError("readUsage", "Usage counters require lab evidence");
  }
}
