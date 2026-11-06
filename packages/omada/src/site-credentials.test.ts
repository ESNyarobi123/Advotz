import { describe, expect, it } from "vitest";
import { siteDeviceCredentials } from "./live.adapter.js";

/** The rule Omada enforces, quoted from its own -30105 message. */
const OMADA_DEVICE_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,64}$/;

describe("site device account credentials", () => {
  it("satisfies the Omada -30105 password rule", () => {
    // Regression: base64url emitted "-" and "_", and the Controller rejected the
    // password outright, so no new site could ever be created.
    for (let i = 0; i < 200; i++) {
      const { password } = siteDeviceCredentials(`advo-hom-hotspot-${i}`);
      expect(password).toMatch(OMADA_DEVICE_PASSWORD);
      expect(password).toMatch(/^[\x20-\x7e]+$/);
      expect(password.length).toBeGreaterThanOrEqual(10);
      expect(password.length).toBeLessThanOrEqual(64);
    }
  });

  it("keeps the username unique per site and stable across retries", () => {
    const a = siteDeviceCredentials("advo-sky-net-6ec4c7");
    const b = siteDeviceCredentials("advo-sky-net-6ec4c7");
    const c = siteDeviceCredentials("advo-hom-hotspot-cc29f9");

    // Stable, so a retried createSite keeps the same account name.
    expect(a.username).toBe(b.username);
    // Omada shares one account namespace, so two sites must not collide.
    expect(a.username).not.toBe(c.username);
    expect(a.username).toMatch(/^advo[0-9a-f]{12}$/);
  });
});
