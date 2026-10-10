import type { ControllerCapabilities } from "./capabilities.js";

export type ControllerInspection = {
  type: string;
  version: string | null;
  controllerId: string | null;
  reachable: boolean;
  detail?: string;
};

export type CreateSiteInput = { name: string; externalId: string; timezone: string };
export type RemoteSiteLocator = { remoteSiteId: string };
export type RemoteSiteResult = { remoteSiteId: string; name: string };

/**
 * What a reseller is allowed to see.
 * `pending` means the Controller has discovered the device but has not adopted it yet.
 * After a successful adopt, the device is only shown as `active` or `offline`.
 */
export type DevicePresence = "active" | "offline" | "pending";

export type RemoteDevice = {
  mac: string;
  model?: string;
  firmware?: string;
  name?: string;
  /** Controller device type, such as `ap`, `gateway` or `switch`. */
  kind?: string;
  status?: string;
  presence?: DevicePresence;
};

/** 2.4 GHz, 5 GHz, or both. Omada stores this as a bit mask on the SSID. */
export type WifiBand = "2.4" | "5" | "both";

export type RemoteWifi = {
  id: string;
  name: string;
  band: WifiBand;
  /** True when the controller is not broadcasting the network name. */
  hidden: boolean;
  secured: boolean;
};

export type CreateWifiInput = {
  remoteSiteId: string;
  name: string;
  password?: string;
  hidden: boolean;
  band: WifiBand;
};

export type RenameDeviceInput = {
  remoteSiteId: string;
  mac: string;
  name: string;
  kind?: string;
};

export type ForgetDeviceInput = { remoteSiteId: string; mac: string };

/** Omada band mask: bit 0 is 2.4 GHz, bit 1 is 5 GHz. */
export function bandToOmada(band: WifiBand): number {
  if (band === "2.4") return 1;
  if (band === "5") return 2;
  return 3;
}

export function bandFromOmada(value: unknown): WifiBand {
  const bits = Number(value);
  const has24 = (bits & 1) === 1;
  const has5 = (bits & 2) === 2;
  if (has24 && has5) return "both";
  if (has5 && !has24) return "5";
  if (has24) return "2.4";
  return "both";
}

export type RemoteClient = { mac: string; apMac?: string; ssidName?: string; connected: boolean };

/** Values exactly as supplied by the Controller redirect, re-validated server-side. */
export type PortalClientTarget =
  | {
      kind: "eap";
      clientMac: string;
      clientIp?: string;
      apMac: string;
      ssidName: string;
      radioId: string;
    }
  | {
      kind: "gateway";
      clientMac: string;
      clientIp?: string;
      gatewayMac: string;
      vid: string;
    };

export type ClientAuthorizationInput = {
  remoteSiteId: string;
  target: PortalClientTarget;
  /** Fixed entitlement expiry (epoch ms). Never recomputed on retry. */
  expiresAtMs: number;
  /** Remaining entitlement at dispatch time (ms). */
  remainingMs: number;
  downloadRateLimitKbps?: number;
  uploadRateLimitKbps?: number;
  totalTrafficLimitBytes?: bigint;
};

export type AuthorizationResult = {
  accepted: boolean;
  submittedExpiresAtMs: number;
  vendorErrorCode?: number;
  rawSanitized?: Record<string, unknown>;
};

export type ClientLocator = { remoteSiteId: string; clientMac: string };
export type AuthorizationObservation = {
  known: boolean;
  authorized: boolean;
  expiresAt?: string;
};

export type RemoteOperationResult = {
  ok: boolean;
  unsupported?: boolean;
  reason?: string;
  rawSanitized?: Record<string, unknown>;
};

export type UsageReadInput = ClientLocator;
export type UsageObservation = {
  bytesTotal?: bigint;
  counterEpoch?: string;
  confidence: "high" | "low" | "unknown";
};

export type DesiredSsidInput = { remoteSiteId: string; name: string };
export type DesiredPortalInput = { remoteSiteId: string; portalUrl: string };
/**
 * Adoption input. `deviceUsername`/`devicePassword` are the device's own login
 * that the Controller uses to reach and adopt it (omitted to use the
 * Controller's default device account). They are substituted into the Open API
 * contract's `adoptDevice` body template as `{{deviceUsername}}`/`{{devicePassword}}`.
 */
export type VerifiedAdoptionInput = {
  remoteSiteId: string;
  mac: string;
  deviceUsername?: string;
  devicePassword?: string;
};

/**
 * Internal adapter contract — not an assertion that Omada supports every operation.
 * Unsupported methods throw UnsupportedCapabilityError.
 */
export interface OmadaControllerAdapter {
  readonly simulated: boolean;
  inspectController(): Promise<ControllerInspection>;
  getCapabilities(): Promise<ControllerCapabilities>;
  createSite(input: CreateSiteInput): Promise<RemoteSiteResult>;
  findSiteByName(name: string): Promise<RemoteSiteResult | null>;
  getSite(input: RemoteSiteLocator): Promise<RemoteSiteResult>;
  listDevices(input: RemoteSiteLocator): Promise<RemoteDevice[]>;
  adoptDevice(input: VerifiedAdoptionInput): Promise<RemoteOperationResult>;
  renameDevice(input: RenameDeviceInput): Promise<RemoteOperationResult>;
  forgetDevice(input: ForgetDeviceInput): Promise<RemoteOperationResult>;
  listSsids(input: RemoteSiteLocator): Promise<RemoteWifi[]>;
  createWifi(input: CreateWifiInput): Promise<RemoteWifi>;
  listClients(input: RemoteSiteLocator): Promise<RemoteClient[]>;
  provisionSsid(input: DesiredSsidInput): Promise<RemoteOperationResult>;
  configureExternalPortal(input: DesiredPortalInput): Promise<RemoteOperationResult>;
  authorizeClient(input: ClientAuthorizationInput): Promise<AuthorizationResult>;
  getClientAuthorization(input: ClientLocator): Promise<AuthorizationObservation>;
  disconnectClient(input: ClientLocator): Promise<RemoteOperationResult>;
  revokeAuthorization(input: ClientLocator): Promise<RemoteOperationResult>;
  blockClient(input: ClientLocator): Promise<RemoteOperationResult>;
  unblockClient(input: ClientLocator): Promise<RemoteOperationResult>;
  readUsage(input: UsageReadInput): Promise<UsageObservation>;
}

export function normalizeMac(input: string): string | null {
  const hex = input.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
  if (hex.length !== 12) return null;
  return hex.match(/.{2}/g)!.join(":");
}

/** Omada OpenAPI device MACs use uppercase dashes, for example `AA-BB-CC-DD-EE-FF`. */
export function omadaMac(input: string): string {
  const normalized = normalizeMac(input);
  if (!normalized) return input.trim();
  return normalized.replaceAll(":", "-").toUpperCase();
}

function numericStatus(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

/**
 * Map an Omada device row to active, offline, or still pending.
 *
 * Omada 6.3 reports two layers. The category (`statusCategory`, or `status` on the
 * device list) is 0 disconnected, 1 connected, 2 pending, 3 heartbeat missed, 4 isolated.
 * `detailStatus` is the finer code: 0 disconnected, 14–17 connected, 20–24 pending or adopting.
 */
export function devicePresence(row: { status?: unknown; statusCategory?: unknown; detailStatus?: unknown }): DevicePresence {
  const text = typeof row.status === "string" ? row.status.trim().toLowerCase() : "";
  if (text === "connected" || text === "online" || text === "active") return "active";
  if (text === "pending" || text === "adopting" || text === "adopt_failed" || text === "managed_by_others") return "pending";
  if (text === "disconnected" || text === "offline" || text === "isolated" || text === "heartbeat_missed") return "offline";

  const explicitCategory = numericStatus(row.statusCategory);
  const detail = numericStatus(row.detailStatus);
  const status = numericStatus(row.status);
  const category = explicitCategory ?? (detail !== null ? status : null);
  if (category === 1) return "active";
  if (category === 2) return "pending";
  if (category === 0 || category === 3 || category === 4) return "offline";

  const detailValue = detail ?? status;
  if (detailValue === 14 || detailValue === 15 || detailValue === 16 || detailValue === 17) return "active";
  if (detailValue !== null && detailValue >= 20 && detailValue <= 24) return "pending";
  if (detail === null && explicitCategory === null && status !== null) {
    if (status === 1) return "active";
    if (status === 2) return "pending";
    if (status === 0 || status === 3 || status === 4) return "offline";
  }
  return "offline";
}

/** Human text for an Omada adopt-result code. `null` means the adopt succeeded. */
export function adoptFailureMessage(code: number): string | null {
  if (code === 0) return null;
  const known: Record<number, string> = {
    [-39002]: "The device did not respond to the adopt command.",
    [-39003]: "The username or password is incorrect.",
    [-39004]: "The controller could not adopt this device.",
    [-39005]: "The device is not connected to the controller. Power it on and connect it, then try again.",
    [-39329]: "The controller could not reach the uplink access point.",
  };
  if (known[code]) return known[code];
  return Number.isFinite(code) ? `The controller did not adopt this device (${code}).` : null;
}
