import { randomBytes } from "node:crypto";
import { unsupported, type ControllerCapabilities, type CapabilityResult } from "./capabilities.js";
import {
  adoptFailureMessage,
  bandFromOmada,
  bandToOmada,
  devicePresence,
  omadaMac,
  type AuthorizationObservation,
  type CreateWifiInput,
  type ForgetDeviceInput,
  type RemoteWifi,
  type RenameDeviceInput,
  type AuthorizationResult,
  type ClientAuthorizationInput,
  type ClientLocator,
  type ControllerInspection,
  type CreateSiteInput,
  type DesiredPortalInput,
  type DesiredSsidInput,
  type OmadaControllerAdapter,
  type RemoteClient,
  type RemoteDevice,
  type RemoteOperationResult,
  type RemoteSiteLocator,
  type RemoteSiteResult,
  type UsageObservation,
  type UsageReadInput,
  type VerifiedAdoptionInput,
} from "./controller-adapter.js";
import { ControllerError, UnsupportedCapabilityError } from "./errors.js";
import { OmadaOpenApiClient, type OpenApiContract } from "./openapi-client.js";
import { OmadaPortalClient } from "./portal-client.js";
import { ControllerTransport } from "./transport.js";
import { PORTAL_PROFILES, selectPortalProfile, type PortalTimeSemantics } from "./versions/portal-serializers.js";

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
    const profileId = this.portal ? selectPortalProfile(this.config.version) : null;
    const supportsLimits = profileId ? PORTAL_PROFILES[profileId].supportsLimits : false;
    const portalCap: CapabilityResult = this.portal
      ? { supported: true, verified: true, reason: "Hotspot operator API is configured and sends the external portal authorization" }
      : unsupported(this.portalReason ?? "Portal client unavailable");

    const caps: ControllerCapabilities = {
      createSite: fromContract("createSite"),
      readSite: fromContract("getSite"),
      listDevices: fromContract("listDevices"),
      adoptDevice: fromContract("adoptDevice"),
      readDeviceHealth: fromContract("listDevices"),
      provisionSsid: fromContract("provisionSsid"),
      configureExternalPortal: fromContract("createPortal"),
      authorizeClient: portalCap,
      getClientAuthorization: fromContract("getClientAuthorization"),
      disconnectClient: fromContract("disconnectClient"),
      revokeAuthorization: fromContract("revokeAuthorization"),
      blockClient: fromContract("blockClient"),
      unblockClient: fromContract("unblockClient"),
      perClientRateLimit: !this.portal
        ? unsupported(this.portalReason ?? "Portal client unavailable")
        : supportsLimits
          ? { supported: true, verified: true, reason: "Omada v6.2.10+ authorization includes download and upload rate limits" }
          : unsupported("This Controller version does not accept per-client rate limits"),
      totalTrafficQuota: !this.portal
        ? unsupported(this.portalReason ?? "Portal client unavailable")
        : supportsLimits
          ? { supported: true, verified: true, reason: "Omada v6.2.10+ authorization includes a total traffic limit" }
          : unsupported("This Controller version does not accept a total traffic limit"),
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
      // Omada rejects Africa/Dar_es_Salaam. Nairobi is the same offset and is what this Controller accepts.
      timezone: !input.timezone || input.timezone === "Africa/Dar_es_Salaam" ? "Africa/Nairobi" : input.timezone,
      deviceUsername: "advo",
      // Omada requires a site device account. It stays on the Controller; it is not a user password.
      devicePassword: `Aa1!${randomBytes(12).toString("base64url")}`,
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
    return rows.map((r) => {
      const presence = devicePresence(r);
      return {
        mac: String(r.mac ?? ""),
        model: r.model ? String(r.model) : undefined,
        firmware: r.firmwareVersion ? String(r.firmwareVersion) : r.firmware ? String(r.firmware) : undefined,
        name: r.name ? String(r.name) : undefined,
        kind: r.type ? String(r.type) : undefined,
        status: presence,
        presence,
      };
    });
  }

  async renameDevice(input: RenameDeviceInput): Promise<RemoteOperationResult> {
    const kind = (input.kind ?? "").toLowerCase();
    const operation = kind.includes("gateway") || kind === "osg" ? "renameGateway" : kind.includes("switch") || kind === "osw" ? "renameSwitch" : "renameAp";
    await this.requireOpenApi(operation).call(operation, {
      siteId: input.remoteSiteId,
      deviceMac: omadaMac(input.mac),
      name: input.name,
    });
    return { ok: true };
  }

  async forgetDevice(input: ForgetDeviceInput): Promise<RemoteOperationResult> {
    await this.requireOpenApi("forgetDevice").call("forgetDevice", {
      siteId: input.remoteSiteId,
      deviceMac: omadaMac(input.mac),
    });
    return { ok: true };
  }

  async listSsids(input: RemoteSiteLocator): Promise<RemoteWifi[]> {
    const api = this.requireOpenApi("listWlans");
    if (!api.has("listSsids")) return [];
    const listed = await api.call("listWlans", { siteId: input.remoteSiteId });
    const wlans = Array.isArray(listed) ? (listed as Array<{ id?: string; wlanId?: string }>) : [];
    const networks: RemoteWifi[] = [];
    for (const wlan of wlans) {
      const wlanId = wlan.id || wlan.wlanId;
      if (!wlanId) continue;
      const rows = await api.call("listSsids", { siteId: input.remoteSiteId, wlanId });
      const list = Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
      for (const row of list) {
        const name = String(row.name ?? "");
        if (!name) continue;
        networks.push({
          id: String(row.id ?? row.ssidId ?? name),
          name,
          band: bandFromOmada(row.band),
          hidden: row.broadcast === false,
          secured: Number(row.security ?? 0) !== 0,
        });
      }
    }
    return networks;
  }

  async createWifi(input: CreateWifiInput): Promise<RemoteWifi> {
    const api = this.requireOpenApi("createSsid");
    const wlanId = await this.primaryWlanId(api, input.remoteSiteId);
    const password = input.password?.trim() ?? "";
    const secured = password.length > 0;
    const payload: Record<string, unknown> = {
      name: input.name,
      deviceType: 1,
      ssidEnable: true,
      chooseDevices: 0,
      band: bandToOmada(input.band),
      guestNetEnable: false,
      security: secured ? 3 : 0,
      broadcast: !input.hidden,
      vlanEnable: false,
      mloEnable: false,
      pmfMode: 3,
      enable11r: false,
      hidePwd: false,
    };
    if (secured) {
      payload.pskSetting = {
        securityKey: password,
        versionPsk: 3,
        encryptionPsk: 1,
        gikRekeyPskEnable: false,
      };
    }
    await api.call("createSsid", { siteId: input.remoteSiteId, wlanId, payload });
    return { id: input.name, name: input.name, band: input.band, hidden: input.hidden, secured };
  }

  /** Uses the site's default WLAN group, creating one when the controller has none. */
  private async primaryWlanId(api: OmadaOpenApiClient, remoteSiteId: string): Promise<string> {
    const read = async () => {
      if (!api.has("listWlans")) return [];
      const listed = await api.call("listWlans", { siteId: remoteSiteId });
      return Array.isArray(listed) ? (listed as Array<{ id?: string; wlanId?: string; primary?: boolean }>) : [];
    };
    let wlans = await read();
    if (wlans.length === 0 && api.has("createWlan")) {
      await api.call("createWlan", { siteId: remoteSiteId, name: "Default" });
      wlans = await read();
    }
    const chosen = wlans.find((wlan) => wlan.primary) ?? wlans[0];
    const wlanId = chosen?.id || chosen?.wlanId;
    if (!wlanId) throw new ControllerError("This site has no WiFi group on the controller", "rejected", false);
    return wlanId;
  }

  async adoptDevice(input: VerifiedAdoptionInput): Promise<RemoteOperationResult> {
    const api = this.requireOpenApi("adoptDevice");
    const deviceMac = omadaMac(input.mac);
    await api.call("adoptDevice", {
      siteId: input.remoteSiteId,
      deviceMac,
      deviceUsername: input.deviceUsername ?? "",
      devicePassword: input.devicePassword ?? "",
    });
    if (!api.has("getAdoptResult")) return { ok: true };
    const failure = await this.adoptOutcome(api, input.remoteSiteId, deviceMac);
    if (failure) throw new ControllerError(failure, "rejected", false, undefined, failure);
    return { ok: true };
  }

  /**
   * start-adopt only queues the command. The previous result can still be sitting
   * on the controller, so read it twice before trusting a failure.
   */
  private async adoptOutcome(api: OmadaOpenApiClient, remoteSiteId: string, deviceMac: string): Promise<string | null> {
    let failure: string | null = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      await delay(attempt === 0 ? 1500 : 1000);
      const result = (await api.call("getAdoptResult", { siteId: remoteSiteId, deviceMac })) as { adoptErrorCode?: unknown };
      const code = typeof result?.adoptErrorCode === "number" ? result.adoptErrorCode : Number(result?.adoptErrorCode);
      if (code === 0) return null;
      const message = adoptFailureMessage(code);
      if (!message) continue;
      if (failure === message && attempt >= 3) return message;
      failure = message;
    }
    return failure ?? "The controller is still adopting this device. Try again in a moment.";
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
    const api = this.requireOpenApi("createPortal");
    const target = externalPortalTarget(input.portalUrl);
    const listed = api.has("listPortals") ? await api.call("listPortals", { siteId: input.remoteSiteId }) : [];
    const portals = Array.isArray(listed) ? (listed as Array<{ name?: string }>) : [];
    if (!portals.some((portal) => portal.name === target.name)) {
      const lans = api.has("listLanNetworks") ? await api.call("listLanNetworks", { siteId: input.remoteSiteId }) : [];
      const networkId = Array.isArray(lans) ? (lans as Array<{ id?: string }>)[0]?.id : undefined;
      if (!networkId) throw new ControllerError("Site has no LAN to bind the portal to", "rejected", true);
      await api.call("createPortal", {
        siteId: input.remoteSiteId,
        name: target.name,
        scheme: target.scheme,
        serverUrl: target.serverUrl,
        networkId,
      });
    }
    if (api.has("getPreAuth") && api.has("setPreAuth")) {
      await this.ensurePreAuth(api, input.remoteSiteId, preAuthHosts(input.portalUrl, this.config.baseUrl));
    }
    return { ok: true, rawSanitized: { serverUrl: target.serverUrl } };
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

  /** Adds missing pre-authentication hosts without dropping policies already on the site. */
  private async ensurePreAuth(api: OmadaOpenApiClient, remoteSiteId: string, hosts: string[]) {
    const current = (await api.call("getPreAuth", { siteId: remoteSiteId })) as {
      preAuthAccessEnable?: boolean;
      preAuthAccessPolicies?: Array<{ type?: number; url?: string; idInt?: number; ip?: string; subnetMask?: number; description?: string }>;
      freeAuthClientEnable?: boolean;
      freeAuthClientPolicies?: unknown[];
    } | null;
    const existing = Array.isArray(current?.preAuthAccessPolicies) ? current.preAuthAccessPolicies : [];
    const known = new Set(existing.filter((policy) => policy.type === 2 && policy.url).map((policy) => policy.url));
    const added = hosts
      .filter((host) => !known.has(host))
      .map((url) => ({ type: 2, url, description: "Advo portal" }));
    if (added.length === 0 && current?.preAuthAccessEnable === true) return;
    await api.call("setPreAuth", {
      siteId: remoteSiteId,
      payload: {
        preAuthAccessEnable: true,
        preAuthAccessPolicies: [...existing, ...added],
        freeAuthClientEnable: current?.freeAuthClientEnable ?? false,
        ...(current?.freeAuthClientEnable ? { freeAuthClientPolicies: current.freeAuthClientPolicies ?? [] } : {}),
      },
    });
  }
}

/** External Portal Server wants the scheme separate from `host/path`. */
function externalPortalTarget(portalUrl: string): { name: string; scheme: string; serverUrl: string } {
  const url = new URL(portalUrl);
  const path = url.pathname.replace(/\/$/, "");
  const slug = path.replace(/^\//, "") || url.host;
  return {
    name: `Advo ${slug}`.slice(0, 128),
    scheme: url.protocol.replace(":", ""),
    serverUrl: `${url.host}${path}`,
  };
}

function preAuthHosts(portalUrl: string, controllerBaseUrl: string): string[] {
  const hosts = new Set<string>();
  const add = (raw: string | undefined) => {
    if (!raw) return;
    try {
      hosts.add(new URL(raw.includes("://") ? raw : `https://${raw}`).host);
    } catch {
      return;
    }
  };
  add(portalUrl);
  add(process.env.PORTAL_PUBLIC_URL);
  add(process.env.API_PUBLIC_URL);
  add(process.env.WEB_PUBLIC_URL);
  add(controllerBaseUrl);
  add("https://api.snippe.sh");
  return [...hosts];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
