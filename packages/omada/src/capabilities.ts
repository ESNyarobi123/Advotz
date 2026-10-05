export const CAPABILITY_OPERATIONS = [
  "createSite",
  "readSite",
  "listDevices",
  "adoptDevice",
  "readDeviceHealth",
  "provisionSsid",
  "configureExternalPortal",
  "authorizeClient",
  "getClientAuthorization",
  "disconnectClient",
  "revokeAuthorization",
  "blockClient",
  "unblockClient",
  "perClientRateLimit",
  "totalTrafficQuota",
  "readUsage",
  "dailyMonthlyQuotaWindows",
  "afterLimitReduceSpeed",
  "afterLimitRedirect",
  "reboot",
] as const;

export type CapabilityOperation = (typeof CAPABILITY_OPERATIONS)[number];

export type CapabilityResult = {
  supported: boolean;
  verified: boolean;
  reason?: string;
  limits?: Record<string, string | number>;
};

export type ControllerCapabilities = Record<CapabilityOperation, CapabilityResult>;

export function unsupported(reason: string): CapabilityResult {
  return { supported: false, verified: false, reason };
}

export function allUnsupported(reason: string): ControllerCapabilities {
  return Object.fromEntries(CAPABILITY_OPERATIONS.map((op) => [op, unsupported(reason)])) as ControllerCapabilities;
}

/**
 * A package feature may be sold only when its enforcing capability is both supported and
 * verified with lab evidence (or explicitly marked simulated in development).
 */
export function canEnforce(cap: CapabilityResult | undefined, allowSimulated: boolean): boolean {
  if (!cap || !cap.supported) return false;
  return cap.verified || allowSimulated;
}
