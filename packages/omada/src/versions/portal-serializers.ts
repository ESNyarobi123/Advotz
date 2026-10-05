import type { ClientAuthorizationInput } from "../controller-adapter.js";
import { ControllerError } from "../errors.js";

/**
 * How the Controller interprets the `time` field. The v6.2.10+ guide says "Authentication
 * Expiration time. Unit here is millisecond" without stating absolute-vs-duration, and its
 * PHP sample passes a variable named $milliseconds. This must be set per Controller from lab
 * evidence; there is intentionally no default.
 */
export type PortalTimeSemantics = "absolute_epoch" | "duration";

export type PortalProfileId = "v6.2.10+" | "v5.0.15-v6.2.0";

export const PORTAL_PROFILES: Record<PortalProfileId, { timeUnit: "ms" | "us"; supportsLimits: boolean; source: string }> = {
  // S8 — support.omadanetworks.com/nordic/document/132060
  "v6.2.10+": { timeUnit: "ms", supportsLimits: true, source: "Omada doc 132060 (v6.2.10+)" },
  // Earlier guide (FAQ3231 family): microsecond `time`, no rate/quota fields.
  "v5.0.15-v6.2.0": { timeUnit: "us", supportsLimits: false, source: "Omada FAQ3231 (v5.0.15–v6.2.0)" },
};

export function selectPortalProfile(version: string | null | undefined): PortalProfileId {
  if (!version) {
    throw new ControllerError("Controller version is unknown; cannot choose a portal serializer", "config", false);
  }
  const parts = version.split(/[.\-]/).map((p) => Number.parseInt(p, 10));
  const [maj = 0, min = 0, patch = 0] = parts;
  const n = maj * 1_000_000 + min * 1_000 + patch;
  if (n >= 6_002_010) return "v6.2.10+";
  if (n >= 5_000_015) return "v5.0.15-v6.2.0";
  throw new ControllerError(`Omada Controller ${version} has no supported portal serializer`, "config", false);
}

export function serializePortalAuth(
  profileId: PortalProfileId,
  semantics: PortalTimeSemantics,
  input: ClientAuthorizationInput,
): Record<string, unknown> {
  const profile = PORTAL_PROFILES[profileId];
  const baseMs = semantics === "absolute_epoch" ? input.expiresAtMs : input.remainingMs;
  if (!Number.isSafeInteger(baseMs) || baseMs <= 0) {
    throw new ControllerError("Authorization time must be a positive safe integer", "config", false);
  }
  const time = profile.timeUnit === "ms" ? baseMs : baseMs * 1000;
  if (!Number.isSafeInteger(time)) {
    throw new ControllerError("Authorization time exceeds safe integer range", "config", false);
  }

  const t = input.target;
  const body: Record<string, unknown> =
    t.kind === "eap"
      ? {
          clientMac: t.clientMac,
          apMac: t.apMac,
          ssidName: t.ssidName,
          radioId: t.radioId,
          time,
          authType: 4,
        }
      : {
          clientMac: t.clientMac,
          gatewayMac: t.gatewayMac,
          vid: t.vid,
          time,
          authType: 4,
        };

  if (profileId === "v6.2.10+") {
    if (t.clientIp) body.clientIp = t.clientIp;
    if (t.kind === "eap") body.originUrl = "";
    if (input.downloadRateLimitKbps !== undefined) body.downloadRateLimitKbps = input.downloadRateLimitKbps;
    if (input.uploadRateLimitKbps !== undefined) body.uploadRateLimitKbps = input.uploadRateLimitKbps;
    if (input.totalTrafficLimitBytes !== undefined) {
      const bytes = input.totalTrafficLimitBytes;
      if (bytes > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new ControllerError("Traffic limit exceeds safe integer range", "config", false);
      }
      body.totalTrafficLimitBytes = Number(bytes);
    }
  } else if (
    input.downloadRateLimitKbps !== undefined ||
    input.uploadRateLimitKbps !== undefined ||
    input.totalTrafficLimitBytes !== undefined
  ) {
    throw new ControllerError(
      `Portal profile ${profileId} has no documented rate/quota fields; refusing to authorize a capped package without its cap`,
      "config",
      false,
    );
  }
  return body;
}
