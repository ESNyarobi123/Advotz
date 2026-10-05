export class UnsupportedCapabilityError extends Error {
  readonly code = "CAPABILITY_UNSUPPORTED";
  constructor(readonly operation: string, reason?: string) {
    super(reason ?? `Omada capability unsupported: ${operation}. Marked unsupported until lab-verified.`);
    this.name = "UnsupportedCapabilityError";
  }
}

/**
 * `ambiguous` = the Controller may have applied the change (timeout, connection reset after
 * send). Callers must reconcile observed state before assuming failure.
 */
export class ControllerError extends Error {
  constructor(
    message: string,
    readonly kind: "timeout" | "network" | "auth" | "rejected" | "protocol" | "config",
    readonly ambiguous: boolean,
    readonly vendorErrorCode?: number,
    readonly vendorMessage?: string,
  ) {
    super(message);
    this.name = "ControllerError";
  }
}
