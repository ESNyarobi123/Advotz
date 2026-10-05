import type { ClientAuthorizationInput, AuthorizationResult } from "./controller-adapter.js";
import { ControllerError } from "./errors.js";
import { ControllerTransport, extractCookies } from "./transport.js";
import {
  serializePortalAuth,
  type PortalProfileId,
  type PortalTimeSemantics,
} from "./versions/portal-serializers.js";

export type PortalClientConfig = {
  transport: ControllerTransport;
  omadacId: string;
  operatorUsername: string;
  operatorPassword: string;
  profile: PortalProfileId;
  timeSemantics: PortalTimeSemantics;
};

type PortalSession = { cookie: string; csrfToken: string; obtainedAt: number };

/**
 * External-portal (hotspot operator) client. Documented paths (S8):
 *   POST /{controllerId}/api/v2/hotspot/login           body {name, password}
 *   POST /{controllerId}/api/v2/hotspot/extPortal/auth  header Csrf-Token, session cookie
 * The session is isolated per Controller/operator, never forwarded to browsers, and refreshed
 * under a lock so concurrent workers do not invalidate each other's login.
 */
export class OmadaPortalClient {
  private session: PortalSession | null = null;
  private refreshing: Promise<PortalSession> | null = null;

  constructor(private readonly config: PortalClientConfig) {}

  private async login(): Promise<PortalSession> {
    const res = await this.config.transport.request("POST", `/${this.config.omadacId}/api/v2/hotspot/login`, {
      body: { name: this.config.operatorUsername, password: this.config.operatorPassword },
    });
    const body = res.body as { errorCode?: number; msg?: string; result?: { token?: string } } | null;
    if (res.status !== 200 || !body || body.errorCode !== 0 || !body.result?.token) {
      throw new ControllerError(
        `Hotspot operator login failed (HTTP ${res.status}, errorCode ${body?.errorCode ?? "n/a"})`,
        "auth",
        false,
        body?.errorCode,
        body?.msg,
      );
    }
    const cookie = extractCookies(res.headers["set-cookie"]);
    if (!cookie) {
      throw new ControllerError("Hotspot login returned no session cookie", "protocol", false);
    }
    return { cookie, csrfToken: body.result.token, obtainedAt: Date.now() };
  }

  private async ensureSession(forceRefresh = false): Promise<PortalSession> {
    if (this.session && !forceRefresh) return this.session;
    if (!this.refreshing) {
      this.refreshing = this.login()
        .then((s) => {
          this.session = s;
          return s;
        })
        .finally(() => {
          this.refreshing = null;
        });
    }
    return this.refreshing;
  }

  async authorize(input: ClientAuthorizationInput): Promise<AuthorizationResult> {
    const body = serializePortalAuth(this.config.profile, this.config.timeSemantics, input);
    const attempt = async (session: PortalSession) =>
      this.config.transport.request("POST", `/${this.config.omadacId}/api/v2/hotspot/extPortal/auth`, {
        body,
        headers: { Cookie: session.cookie, "Csrf-Token": session.csrfToken },
      });

    let res = await attempt(await this.ensureSession());
    if (res.status === 401 || res.status === 403 || res.status === 302) {
      res = await attempt(await this.ensureSession(true));
    }
    const parsed = res.body as { errorCode?: number; msg?: string } | null;
    const sanitized = { httpStatus: res.status, errorCode: parsed?.errorCode, msg: parsed?.msg };
    if (res.status !== 200 || typeof parsed?.errorCode !== "number") {
      throw new ControllerError(
        `Unexpected extPortal/auth response (HTTP ${res.status})`,
        "protocol",
        res.status >= 500,
        parsed?.errorCode,
        parsed?.msg,
      );
    }
    return {
      accepted: parsed.errorCode === 0,
      submittedExpiresAtMs: input.expiresAtMs,
      vendorErrorCode: parsed.errorCode,
      rawSanitized: sanitized,
    };
  }
}
