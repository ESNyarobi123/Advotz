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

/**
 * Omada scopes an Open API client to a set of sites. Anything the client creates
 * outside that scope answers `-1505` ("The current user does not have permissions
 * to access this site"), and it is invisible to `listSites` as well.
 */
export const OMADA_SITE_ACCESS_DENIED = -1505;
/** A site with this name already exists on the Controller (visible or not). */
export const OMADA_SITE_NAME_EXISTS = -33101;

export function isSiteAccessDenied(err: unknown): boolean {
  return err instanceof ControllerError && err.vendorErrorCode === OMADA_SITE_ACCESS_DENIED;
}

export function isSiteNameConflict(err: unknown): boolean {
  return err instanceof ControllerError && err.vendorErrorCode === OMADA_SITE_NAME_EXISTS;
}

/** Operator-facing remedy for both codes: the client needs access to every site, not a few. */
export const SITE_ACCESS_REMEDY =
  "Grant the Open API client access to all sites in the Omada Controller (Settings → Open API → Clients), then retry provisioning.";

/**
 * Client-scoped Open API calls reject an absent client instead of doing nothing.
 *
 * `block`, `unblock` and `disconnect` all answer "This client does not exist." when the
 * MAC is not currently on the site (each handler has its own code). For the caller this
 * is a benign outcome, not a failure: a MAC that is not connected holds no session, so
 * "end this session" and "let this MAC back in" are both already true.
 */
const OMADA_CLIENT_GONE_CODES = new Set([-41002, -41004, -41011]);

export function isClientGone(err: unknown): boolean {
  return err instanceof ControllerError && err.vendorErrorCode !== undefined && OMADA_CLIENT_GONE_CODES.has(err.vendorErrorCode);
}

