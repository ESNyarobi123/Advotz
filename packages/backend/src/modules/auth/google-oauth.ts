/**
 * Google OAuth 2.0 — Authorization Code flow.
 *
 * The browser never sees the client secret and never receives an access token:
 * it is sent to Google, comes back to the API with a one-time `code`, and the
 * API exchanges that code over TLS. The profile always comes from Google's
 * userinfo endpoint rather than from the `id_token` in the token response, so
 * the values used to create an account are the ones Google just served over an
 * authenticated channel.
 *
 * Why the code flow and not the JavaScript (implicit) flow: the code flow needs
 * exactly one redirect URI, keeps the secret server-side, and lets the session
 * cookie be set on the web origin instead of exposing a token to client script.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";
const REQUEST_TIMEOUT_MS = 10_000;

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

/** What Google proved about the person. `sub` is stable, `email` may change. */
export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
};

/**
 * Reads the Google client configuration.
 *
 * Returns `null` when either half of the credential is missing, which is how
 * every environment without Google set up behaves: the buttons stay visible but
 * the API answers 503 instead of sending anyone to a broken Google page.
 */
export function googleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) return null;

  // Registered verbatim in the Google console. In production this is the web
  // origin's proxy path (`https://advowifi.com/api/v1/auth/google/callback`)
  // rather than the API hostname, so the session cookie is first-party for the
  // dashboard exactly like a password login.
  const redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URL?.trim() ||
    `${(process.env.API_PUBLIC_URL ?? "http://localhost:4000").replace(/\/$/, "")}/api/v1/auth/google/callback`;

  return { clientId, clientSecret, redirectUri };
}

export function googleOAuthEnabled(): boolean {
  return googleOAuthConfig() !== null;
}

/** Google's consent screen, already carrying the CSRF `state`. */
export function buildGoogleAuthUrl(config: GoogleOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    // Always let the person pick the mailbox; silently reusing a previous
    // Google session on a shared phone is how the wrong account gets created.
    prompt: "select_account",
    access_type: "online",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/** Exchanges the one-time code and fetches the profile it belongs to. */
export async function exchangeGoogleCode(
  config: GoogleOAuthConfig,
  code: string,
): Promise<GoogleProfile> {
  const tokenResponse = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!tokenResponse.ok) {
    throw new GoogleOAuthError("token_exchange_failed", await safeText(tokenResponse));
  }

  const tokens = (await tokenResponse.json()) as { access_token?: string };
  if (!tokens.access_token) {
    throw new GoogleOAuthError("token_exchange_failed", "Google returned no access token");
  }

  const profileResponse = await fetch(USERINFO_ENDPOINT, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!profileResponse.ok) {
    throw new GoogleOAuthError("userinfo_failed", await safeText(profileResponse));
  }

  const info = (await profileResponse.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    given_name?: string;
    picture?: string;
  };

  if (!info.sub || !info.email) {
    throw new GoogleOAuthError("userinfo_failed", "Google profile did not include an email address");
  }

  return {
    sub: info.sub,
    email: info.email.trim().toLowerCase(),
    // Google accounts always report `email_verified`; a Workspace domain can
    // still return `false` for an alias, and that must not bypass verification.
    emailVerified: info.email_verified === true,
    name: (info.name ?? info.given_name ?? info.email.split("@")[0] ?? "").trim().slice(0, 120),
    picture: info.picture ?? null,
  };
}

export class GoogleOAuthError extends Error {
  constructor(
    readonly reason: "token_exchange_failed" | "userinfo_failed",
    readonly detail: string,
  ) {
    super(`Google OAuth failed (${reason}): ${detail}`);
    this.name = "GoogleOAuthError";
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return `HTTP ${response.status}`;
  }
}

/**
 * Where a successful sign-in should land.
 *
 * Only a same-origin path is honoured. `//evil.example` and `https://evil.example`
 * both look like paths to a naive check, so the value is parsed and the caller
 * gets `null` unless it is a relative path on this site.
 */
export function safeNextPath(value: string | undefined | null): string | null {
  if (!value || value.length > 200) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}
