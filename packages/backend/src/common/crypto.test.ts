import { afterEach, describe, expect, it } from "vitest";
import {
  compactIdempotencyKey,
  hashToken,
  isDevFixedOtp,
  readHandoff,
  signHandoff,
  slugifyBusinessName,
} from "./crypto.js";

function restoreEnv(key: "NODE_ENV" | "DEV_FIXED_OTP", value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

describe("crypto helpers", () => {
  it("hashes tokens stably", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });

  it("creates compact idempotency keys within Snippe 30-char limit", () => {
    const key = compactIdempotencyKey("a");
    expect(key.length).toBeLessThanOrEqual(30);
  });

  it("slugifies business names with unique suffix", () => {
    const a = slugifyBusinessName("Dar Cafe!");
    const b = slugifyBusinessName("Dar Cafe!");
    expect(a).toMatch(/^dar-cafe-/);
    expect(a).not.toBe(b);
  });
});

describe("isDevFixedOtp", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFixedOtp = process.env.DEV_FIXED_OTP;

  afterEach(() => {
    restoreEnv("NODE_ENV", originalNodeEnv);
    restoreEnv("DEV_FIXED_OTP", originalFixedOtp);
  });

  it("accepts the configured code outside production", () => {
    process.env.NODE_ENV = "development";
    process.env.DEV_FIXED_OTP = "123456";
    expect(isDevFixedOtp("123456")).toBe(true);
    expect(isDevFixedOtp("123 456")).toBe(true);
    expect(isDevFixedOtp("654321")).toBe(false);
  });

  it("never accepts a fixed code in production, even when configured", () => {
    process.env.NODE_ENV = "production";
    process.env.DEV_FIXED_OTP = "123456";
    expect(isDevFixedOtp("123456")).toBe(false);
  });

  it("stays off when unset or malformed", () => {
    process.env.NODE_ENV = "development";
    delete process.env.DEV_FIXED_OTP;
    expect(isDevFixedOtp("123456")).toBe(false);

    process.env.DEV_FIXED_OTP = "not-a-code";
    expect(isDevFixedOtp("123456")).toBe(false);

    process.env.DEV_FIXED_OTP = "12345";
    expect(isDevFixedOtp("12345")).toBe(false);
  });
});

describe("signHandoff / readHandoff", () => {
  const originalSecret = process.env.SECRETS_ENCRYPTION_KEY;

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
    else process.env.SECRETS_ENCRYPTION_KEY = originalSecret;
  });

  it("round-trips a payload without its expiry", () => {
    process.env.SECRETS_ENCRYPTION_KEY = "test-secret-value-1234567890";
    const token = signHandoff("purpose-a", { email: "a@b.c", count: 2 }, 60);
    expect(readHandoff("purpose-a", token)).toEqual({ email: "a@b.c", count: 2 });
  });

  it("refuses a token minted for another purpose", () => {
    process.env.SECRETS_ENCRYPTION_KEY = "test-secret-value-1234567890";
    const token = signHandoff("purpose-a", { email: "a@b.c" }, 60);
    expect(readHandoff("purpose-b", token)).toBeNull();
  });

  it("refuses a tampered payload and an expired token", () => {
    process.env.SECRETS_ENCRYPTION_KEY = "test-secret-value-1234567890";
    const token = signHandoff("purpose-a", { email: "a@b.c" }, 60);
    expect(readHandoff("purpose-a", `${token.slice(0, -3)}abc`)).toBeNull();
    expect(readHandoff("purpose-a", signHandoff("purpose-a", { email: "a@b.c" }, -1))).toBeNull();
  });

  it("refuses a token signed with a different secret", () => {
    process.env.SECRETS_ENCRYPTION_KEY = "test-secret-value-1234567890";
    const token = signHandoff("purpose-a", { email: "a@b.c" }, 60);
    process.env.SECRETS_ENCRYPTION_KEY = "another-secret-value-0987654321";
    expect(readHandoff("purpose-a", token)).toBeNull();
  });
});
