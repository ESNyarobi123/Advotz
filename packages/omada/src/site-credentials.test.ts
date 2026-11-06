import { describe, expect, it } from "vitest";
import { deviceAccountPassword, siteDeviceCredentials } from "./live.adapter.js";

/** Omada's two stated rules, plus the duplicate-character rule measured on the live Controller. */
const HAS_ALL_CLASSES = [/[A-Z]/, /[a-z]/, /\d/, /[^A-Za-z0-9]/];

describe("site device account password", () => {
  it("satisfies length, printable ASCII and all four character classes", () => {
    for (let i = 0; i < 500; i++) {
      const password = deviceAccountPassword();
      expect(password.length).toBeGreaterThanOrEqual(10);
      expect(password.length).toBeLessThanOrEqual(64);
      expect(password).toMatch(/^[\x20-\x7e]+$/);
      for (const rule of HAS_ALL_CLASSES) expect(password).toMatch(rule);
    }
  });

  it("never repeats a character twice in a row", () => {
    // Regression: hex/base64 bodies hit a double about half the time, and the
    // Controller answers -30105 for "…888…", "…ss…" and even "…22…". This made
    // site creation (and so device adoption) fail intermittently.
    for (let i = 0; i < 500; i++) {
      const { password } = siteDeviceCredentials(`advo-site-${i}`);
      for (let at = 1; at < password.length; at++) {
        expect(password[at]).not.toBe(password[at - 1]);
      }
    }
  });

  it("keeps the username unique per site and stable across retries", () => {
    const a = siteDeviceCredentials("advo-sky-net-6ec4c7");
    const b = siteDeviceCredentials("advo-sky-net-6ec4c7");
    const c = siteDeviceCredentials("advo-hom-hotspot-cc29f9");

    expect(a.username).toBe(b.username);
    expect(a.username).not.toBe(c.username);
    expect(a.username).toMatch(/^advo[0-9a-f]{12}$/);
  });
});
