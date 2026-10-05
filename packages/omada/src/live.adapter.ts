import { unsupported, type ControllerCapabilities, type CapabilityResult } from "./capabilities.js";
import type {
  AuthorizationObservation,
  AuthorizationResult,
  ClientAuthorizationInput,
  ClientLocator,
  ControllerInspection,
  CreateSiteInput,
  DesiredPortalInput,
  DesiredSsidInput,
  OmadaControllerAdapter,
  RemoteClient,
  RemoteDevice,
  RemoteOperationResult,
  RemoteSiteLocator,
  RemoteSiteResult,
  UsageObservation,
  UsageReadInput,
  VerifiedAdoptionInput,
} from "./controller-adapter.js";
import { ControllerError, UnsupportedCapabilityError } from "./errors.js";
import { OmadaOpenApiClient, type OpenApiContract } from "./openapi-client.js";
import { OmadaPortalClient } from "./portal-client.js";
import { ControllerTransport } from "./transport.js";
import { selectPortalProfile, type PortalTimeSemantics } from "./versions/portal-serializers.js";

export type LiveControllerConfig = {
  baseUrl: string;
  omadacId: string;
  version: string;
  caCertPath?: string;
  openApi?: { clientId: string; clientSecret: string; contract: OpenApiContract | null };
  portal?: { operatorUsername: string; operatorPassword: string; timeSemantics: PortalTimeSemantics | null };
  /** Capability rows recorded from lab evidence (ControllerCapability table). */
  verifiedCapabilities: Partial<Record<keyof ControllerCapabilities, CapabilityResult>>;
};

export class LiveOmadaAdapter implements OmadaControllerAdapter {
  readonly simulated = false;
  private readonly transport: ControllerTransport;
  private readonly openApi: OmadaOpenApiClient | null;
  private readonly portal: OmadaPortalClient | null;
  private readonly portalReason: string | null = null;

  constructor(private readonly config: LiveControllerConfig) {
    this.transport = new ControllerTransport({ baseUrl: config.baseUrl, caCertPath: config.caCertPath });
    this.openApi = config.openApi
      ? new OmadaOpenApiClient(this.transport, config.openApi.contract, {
          omadacId: config.omadacId,
          clientId: config.openApi.clientId,
          clientSecret: config.openApi.clientSecret,
        })
      : null;

    let portal: OmadaPortalClient | null = null;
    if (!config.portal) {
      this.portalReason = "Hotspot operator credentials not configured";
    } else if (!config.portal.timeSemantics) {
      this.portalReason = "Portal `time` semantics not recorded from lab evidence (absolute vs duration)";
    } else {
      try {
        portal = new OmadaPortalClient({
          transport: this.transport,
          omadacId: config.omadacId,
          operatorUsername: config.portal.operatorUsername,
          operatorPassword: config.portal.operatorPassword,
          profile: selectPortalProfile(config.version),
          timeSemantics: config.portal.timeSemantics,
        });
      } catch (err) {
        this.portalReason = err instanceof Error ? err.message : String(err);
      }
    }
    this.portal = portal;
  }

  async inspectController(): Promise<ControllerInspection> {
    try {
      if (this.openApi?.has("controllerInfo")) {
        const info = (await this.openApi.call("controllerInfo", {})) as { controllerVer?: string; omadacId?: string } | null;
        return {
          type: "omada",
          version: info?.controllerVer ?? this.config.version,
          controllerId: info?.omadacId ?? this.config.omadacId,
          reachable: true,
          detail: "controllerInfo operation from the verified contract",
        };
      }
      const res = await this.transport.request("GET", "/");
      return {
        type: "omada",
        version: this.config.version,
        controllerId: this.config.omadacId,
        reachable: res.status > 0 && res.status < 500,
        detail: `TLS reachability only (HTTP ${res.status}); version is the configured value`,
      };
    } catch (err) {
      return {
        type: "omada",
        version: this.config.version,
        controllerId: this.config.omadacId,
        reachable: false,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async getCapabilities(): Promise<ControllerCapabilities> {
    const fromContract = (op: string): CapabilityResult =>
      this.openApi?.has(op)
        ? { supported: true, verified: this.openApi.isVerified(op), reason: "Declared in Open API contract" }
        : unsupported("Not present in the verified Open API contract");
    const portalCap: CapabilityResult = this.portal
      ? { supported: true, verified: false, reason: "Documented portal API; lab evidence required" }
      : unsupported(this.portalReason ?? "Portal client unavailable");

    const caps: ControllerCapabilities = {
      createSite: fromContract("createSite"),
      readSite: fromContract("getSite"),
      listDevices: fromContract("listDevices"),
      adoptDevice: fromContract("adoptDevice"),
      readDeviceHealth: fromContract("listDevices"),
      provisionSsid: fromContract("provisionSsid"),
      configureExternalPortal: fromContract("configureExternalPortal"),
      authorizeClient: portalCap,
      getClientAuthorization: fromContract("getClientAuthorization"),
      disconnectClient: fromContract("disconnectClient"),
      revokeAuthorization: fromContract("revokeAuthorization"),
      blockClient: fromContract("blockClient"),
      unblockClient: fromContract("unblockClient"),
      perClientRateLimit: this.portal
        ? { supported: true, verified: false, reason: "v6.2.10+ fields documented; throughput must be measured" }
        : unsupported(this.portalReason ?? "Portal client unavailable"),
      totalTrafficQuota: this.portal
        ? { supported: true, verified: false, reason: "v6.2.10+ field documented; enforcement must be measured" }
        : unsupported(this.portalReason ?? "Portal client unavailable"),
      readUsage: fromContract("readUsage"),
      dailyMonthlyQuotaWindows: unsupported("No verified reset/re-authorization mechanism"),
      afterLimitReduceSpeed: unsupported("Not validated"),
      afterLimitRedirect: unsupported("Not validated"),
      reboot: fromContract("rebootDevice"),
    };
    // Lab evidence recorded by an Admin overrides the static view.
    for (const [op, cap] of Object.entries(this.config.verifiedCapabilities)) {
      if (cap) caps[op as keyof ControllerCapabilities] = cap;
    }
    return caps;
  }

  private requireOpenApi(op: string): OmadaOpenApiClient {
    if (!this.openApi || !this.openApi.has(op)) throw new UnsupportedCapabilityError(op);
    return this.openApi;
  }

  async createSite(input: CreateSiteInput): Promise<RemoteSiteResult> {
    const id = await this.requireOpenApi("createSite").call("createSite", {
      name: input.name,
      timezone: input.timezone,
    });
    if (typeof id !== "string" || !id) throw new ControllerError("createSite returned no site ID", "protocol", true);
    return { remoteSiteId: id, name: input.name };
  }

  async findSiteByName(name: string): Promise<RemoteSiteResult | null> {
    if (!this.openApi?.has("listSites")) return null;
    const list = await this.openApi.call("listSites", {});
    const rows = Array.isArray(list) ? (list as Array<{ siteId?: string; id?: string; name?: string }>) : [];
    const found = rows.find((r) => r.name === name);
    const id = found?.siteId ?? found?.id;
    return id ? { remoteSiteId: id, name } : null;
  }

  async getSite(input: RemoteSiteLocator): Promise<RemoteSiteResult> {
    const res = (await this.requireOpenApi("getSite").call("getSite", { siteId: input.remoteSiteId })) as { name?: string } | null;
    return { remoteSiteId: input.remoteSiteId, name: res?.name ?? "" };
  }

  async listDevices(input: RemoteSiteLocator): Promise<RemoteDevice[]> {
    const list = await this.requireOpenApi("listDevices").call("listDevices", { siteId: input.remoteSiteId });
    const rows = Array.isArray(list) ? (list as Array<Record<string, unknown>>) : [];
    return rows.map((r) => ({
      mac: String(r.mac ?? ""),
      model: r.model ? String(r.model) : undefined,
      firmware: r.firmwareVersion ? String(r.firmwareVersion) : undefined,
      name: r.name ? String(r.name) : undefined,
      status: r.status !== undefined ? String(r.status) : undefined,
    }));
  }

  async adoptDevice(input: VerifiedAdoptionInput): Promise<RemoteOperationResult> {
    await this.requireOpenApi("adoptDevice").call("adoptDevice", {
      siteId: input.remoteSiteId,
      deviceMac: input.mac,
      // Empty strings keep the contract from failing when the template omits the
      // placeholders; a Reseller-provided device login is passed through as-is.
      deviceUsername: input.deviceUsername ?? "",
      devicePassword: input.devicePassword ?? "",
    });
    return { ok: true };
  }

  async listClients(input: RemoteSiteLocator): Promise<RemoteClient[]> {
    const list = await this.requireOpenApi("listClients").call("listClients", { siteId: input.remoteSiteId });
    const rows = Array.isArray(list) ? (list as Array<Record<string, unknown>>) : [];
    return rows.map((r) => ({
      mac: String(r.mac ?? ""),
      apMac: r.apMac ? String(r.apMac) : undefined,
      ssidName: r.ssid ? String(r.ssid) : undefined,
      connected: true,
    }));
  }

  async provisionSsid(input: DesiredSsidInput): Promise<RemoteOperationResult> {
    await this.requireOpenApi("provisionSsid").call("provisionSsid", { siteId: input.remoteSiteId, name: input.name });
    return { ok: true };
  }

  async configureExternalPortal(input: DesiredPortalInput): Promise<RemoteOperationResult> {
    await this.requireOpenApi("configureExternalPortal").call("configureExternalPortal", {
      siteId: input.remoteSiteId,
      portalUrl: input.portalUrl,
    });
    return { ok: true };
  }

  async authorizeClient(input: ClientAuthorizationInput): Promise<AuthorizationResult> {
    if (!this.portal) throw new UnsupportedCapabilityError("authorizeClient", this.portalReason ?? undefined);
    return this.portal.authorize(input);
  }

  async getClientAuthorization(input: ClientLocator): Promise<AuthorizationObservation> {
    if (!this.openApi?.has("getClientAuthorization")) return { known: false, authorized: false };
    const res = (await this.openApi.call("getClientAuthorization", {
      siteId: input.remoteSiteId,
      clientMac: input.clientMac,
    })) as { authorized?: boolean; authStatus?: number } | null;
    const authorized = res?.authorized ?? (res?.authStatus !== undefined ? res.authStatus !== 0 : undefined);
    return authorized === undefined ? { known: false, authorized: false } : { known: true, authorized };
  }

  private async clientOp(op: string, input: ClientLocator): Promise<RemoteOperationResult> {
    if (!this.openApi?.has(op)) return { ok: false, unsupported: true, reason: `${op} not in verified contract` };
    await this.openApi.call(op, { siteId: input.remoteSiteId, clientMac: input.clientMac });
    return { ok: true };
  }

  disconnectClient(input: ClientLocator) {
    return this.clientOp("disconnectClient", input);
  }
  revokeAuthorization(input: ClientLocator) {
    return this.clientOp("revokeAuthorization", input);
  }
  blockClient(input: ClientLocator) {
    return this.clientOp("blockClient", input);
  }
  unblockClient(input: ClientLocator) {
    return this.clientOp("unblockClient", input);
  }

  async readUsage(_input: UsageReadInput): Promise<UsageObservation> {
    throw new UnsupportedCapabilityError("readUsage", "Usage counter semantics require lab evidence");
  }
}
