import { CAPABILITY_OPERATIONS, unsupported, type CapabilityResult, type ControllerCapabilities } from "./capabilities.js";
import {
  normalizeMac,
  omadaMac,
  type AuthorizationObservation,
  type AuthorizationResult,
  type ClientAuthorizationInput,
  type ClientLocator,
  type CreateWifiInput,
  type DesiredPortalInput,
  type ControllerInspection,
  type CreateSiteInput,
  type ForgetDeviceInput,
  type OmadaControllerAdapter,
  type RemoteClient,
  type RemoteDevice,
  type RemoteOperationResult,
  type RemoteWifi,
  type RenameDeviceInput,
  type RemoteSiteLocator,
  type RemoteSiteResult,
  type UsageObservation,
  type VerifiedAdoptionInput,
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
  portals: Map<string, string>;
  devices: Map<string, RemoteDevice & { remoteSiteId: string }>;
  wifi: Map<string, RemoteWifi[]>;
};

const sharedState: FakeState = { sites: new Map(), auth: new Map(), portals: new Map(), devices: new Map(), wifi: new Map() };

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
    sharedState.portals.clear();
    sharedState.devices.clear();
    sharedState.wifi.clear();
  }

  async inspectController(): Promise<ControllerInspection> {
    return { type: "fake", version: "simulated", controllerId: "fake-controller", reachable: true };
  }

  async getCapabilities(): Promise<ControllerCapabilities> {
    const caps = Object.fromEntries(CAPABILITY_OPERATIONS.map((op) => [op, simulated()])) as ControllerCapabilities;
    caps.adoptDevice = simulated();
    caps.provisionSsid = unsupported("SSID provisioning requires the Controller's verified API");
    caps.configureExternalPortal = simulated();
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

  async listDevices(input: RemoteSiteLocator): Promise<RemoteDevice[]> {
    return [...this.state.devices.values()]
      .filter((device) => device.remoteSiteId === input.remoteSiteId)
      .map(({ remoteSiteId: _remoteSiteId, ...device }) => device);
  }

  async adoptDevice(input: VerifiedAdoptionInput): Promise<RemoteOperationResult> {
    const username = input.deviceUsername?.trim();
    const password = input.devicePassword ?? "";
    if (!username || !password) {
      return { ok: false, reason: "Failed to adopt the device because the username or password is incorrect" };
    }
    if (password === "wrong-password") {
      return { ok: false, reason: "Failed to adopt the device because the username or password is incorrect" };
    }
    const mac = normalizeMac(input.mac);
    if (!mac) return { ok: false, reason: "Invalid MAC address" };
    this.state.devices.set(`${input.remoteSiteId}|${mac}`, {
      remoteSiteId: input.remoteSiteId,
      mac: omadaMac(mac),
      presence: "active",
      status: "active",
      model: "EAP225",
      kind: "ap",
    });
    return { ok: true };
  }

  async renameDevice(input: RenameDeviceInput): Promise<RemoteOperationResult> {
    const mac = normalizeMac(input.mac);
    if (!mac) return { ok: false, reason: "Invalid MAC address" };
    const key = `${input.remoteSiteId}|${mac}`;
    const device = this.state.devices.get(key);
    if (device) this.state.devices.set(key, { ...device, name: input.name });
    return { ok: true };
  }

  async forgetDevice(input: ForgetDeviceInput): Promise<RemoteOperationResult> {
    const mac = normalizeMac(input.mac);
    if (!mac) return { ok: false, reason: "Invalid MAC address" };
    this.state.devices.delete(`${input.remoteSiteId}|${mac}`);
    return { ok: true };
  }

  async listSsids(input: RemoteSiteLocator): Promise<RemoteWifi[]> {
    return [...(this.state.wifi.get(input.remoteSiteId) ?? [])];
  }

  async createWifi(input: CreateWifiInput): Promise<RemoteWifi> {
    const password = input.password?.trim() ?? "";
    if (password && (password.length < 8 || password.length > 63)) {
      throw new ControllerError("WiFi password must be 8 to 63 characters", "rejected", false);
    }
    const network: RemoteWifi = {
      id: `fake-ssid-${this.state.wifi.get(input.remoteSiteId)?.length ?? 0}`,
      name: input.name,
      band: input.band,
      hidden: input.hidden,
      secured: password.length > 0,
    };
    const current = this.state.wifi.get(input.remoteSiteId) ?? [];
    this.state.wifi.set(input.remoteSiteId, [...current, network]);
    return network;
  }

  async listClients(): Promise<RemoteClient[]> {
    return [];
  }

  async provisionSsid(): Promise<RemoteOperationResult> {
    return { ok: false, unsupported: true, reason: "SSID provisioning unverified" };
  }

  async configureExternalPortal(input: DesiredPortalInput): Promise<RemoteOperationResult> {
    this.state.portals.set(input.remoteSiteId, input.portalUrl);
    return { ok: true, rawSanitized: { serverUrl: input.portalUrl } };
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
