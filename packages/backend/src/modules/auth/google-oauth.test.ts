import { afterEach, describe, expect, it } from "vitest";
import {
  buildGoogleAuthUrl,
  googleOAuthConfig,
  googleOAuthEnabled,
  safeNextPath,
  type GoogleOAuthConfig,
} from "./google-oauth.js";

const CONFIG: GoogleOAuthConfig = {
  clientId: "client-123.apps.googleusercontent.com",
  clientSecret: "secret",
  redirectUri: "https://advowifi.com/api/v1/auth/google/callback",
};

describe("googleOAuthConfig", () => {
  const keys = [
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_SECRET",
    "GOOGLE_OAUTH_REDIRECT_URL",
  ] as const;
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of keys) {
      const value = original[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("is disabled unless both halves of the credential exist", () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = "client";
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    expect(googleOAuthEnabled()).toBe(false);

    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "secret";
    expect(googleOAuthEnabled()).toBe(true);
    expect(googleOAuthConfig()?.redirectUri).toBe(
      "http://localhost:4000/api/v1/auth/google/callback",
    );
  });

  it("prefers the explicit redirect URI, since it must match the console exactly", () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = "client";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URL = "https://advowifi.com/api/v1/auth/google/callback";
    expect(googleOAuthConfig()?.redirectUri).toBe(
      "https://advowifi.com/api/v1/auth/google/callback",
    );
  });
});

describe("buildGoogleAuthUrl", () => {
  it("asks for the code flow and forces the account chooser", () => {
    const url = new URL(buildGoogleAuthUrl(CONFIG, "state-1"));
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("prompt")).toBe("select_account");
    expect(url.searchParams.get("redirect_uri")).toBe(CONFIG.redirectUri);
    expect(url.searchParams.get("state")).toBe("state-1");
    // The secret must never travel through the browser.
    expect(url.searchParams.get("client_secret")).toBeNull();
  });
});

describe("safeNextPath", () => {
  it("accepts a same-site path", () => {
    expect(safeNextPath("/reseller")).toBe("/reseller");
    expect(safeNextPath("/admin/agents?x=1")).toBe("/admin/agents?x=1");
  });

  it("refuses anything that could leave the site", () => {
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath("reseller")).toBeNull();
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("/\\evil.example")).toBeNull();
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath(`/${"a".repeat(200)}`)).toBeNull();
  });
});
