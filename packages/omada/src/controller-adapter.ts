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

export type RemoteDevice = {
  mac: string;
  model?: string;
  firmware?: string;
  name?: string;
  status?: string;
};

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
