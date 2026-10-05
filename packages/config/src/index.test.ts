import { describe, expect, it } from "vitest";
import { loadServerEnv } from "./index.js";

const base = {
  WEB_PUBLIC_URL: "https://app.advo.example",
  PORTAL_PUBLIC_URL: "https://wifi.advo.example",
  API_PUBLIC_URL: "https://api.advo.example",
  API_INTERNAL_URL: "http://api:4000",
  DATABASE_URL: "postgresql://advo:s3cr3t-db-pass@postgres:5432/advo",
  REDIS_URL: "redis://redis:6379",
  CSRF_TRUSTED_ORIGINS: "https://app.advo.example,https://wifi.advo.example",
  SECRETS_ENCRYPTION_KEY: "k".repeat(44),
  VOUCHER_LOOKUP_HMAC_KEY: "h".repeat(44),
};

const production = {
  ...base,
  NODE_ENV: "production",
  AUTH_COOKIE_SECURE: "true",
  PAYMENT_PROVIDER: "snippe",
  SNIPPE_API_KEY: "live-key",
  SNIPPE_WEBHOOK_SECRET: "whsec",
  OMADA_MODE: "live",
};

function issues(env: Record<string, string>) {
  try {
    loadServerEnv(env as NodeJS.ProcessEnv);
    return "";
  } catch (err) {
    return (err as Error).message;
  }
}

describe("server environment validation", () => {
  it("accepts a development environment with fake providers", () => {
    const env = loadServerEnv(base as NodeJS.ProcessEnv);
    expect(env.PAYMENT_PROVIDER).toBe("fake");
    expect(env.OMADA_MODE).toBe("fake");
  });

  it("accepts a complete production environment", () => {
    expect(issues(production)).toBe("");
  });

  it.each([
    ["PAYMENT_PROVIDER", { PAYMENT_PROVIDER: "fake" }],
    ["OMADA_MODE", { OMADA_MODE: "fake" }],
    ["AUTH_COOKIE_SECURE", { AUTH_COOKIE_SECURE: "false" }],
    ["SNIPPE_API_KEY", { SNIPPE_WEBHOOK_SECRET: "" }],
    ["OUTBOX_INLINE", { OUTBOX_INLINE: "true" }],
    ["RATE_LIMIT_BACKEND", { RATE_LIMIT_BACKEND: "memory" }],
    ["METRICS_TOKEN", { METRICS_TOKEN: "short" }],
    ["SECRETS_ENCRYPTION_KEY", { SECRETS_ENCRYPTION_KEY: "replace_with_generated_key_32chars_min" }],
    ["DATABASE_URL", { DATABASE_URL: "postgresql://advo:replace_for_your_environment@postgres:5432/advo" }],
  ])("rejects unsafe production %s", (path, override) => {
    expect(issues({ ...production, ...override })).toContain(path);
  });

  it("checks placeholders against the validated NODE_ENV, not the process's", () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      expect(issues({ ...production, VOUCHER_LOOKUP_HMAC_KEY: "replace_with_generated_key_32chars_min" })).toContain("VOUCHER_LOOKUP_HMAC_KEY");
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
