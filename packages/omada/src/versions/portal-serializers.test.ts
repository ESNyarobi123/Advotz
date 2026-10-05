import { describe, expect, it } from "vitest";
import { selectPortalProfile, serializePortalAuth } from "./portal-serializers.js";
import type { ClientAuthorizationInput } from "../controller-adapter.js";
import { normalizeMac } from "../controller-adapter.js";
import { canEnforce } from "../capabilities.js";

const base: ClientAuthorizationInput = {
  remoteSiteId: "site",
  target: { kind: "eap", clientMac: "11:22:33:44:55:66", apMac: "aa:bb:cc:00:00:01", ssidName: "Cafe", radioId: "1", clientIp: "10.0.0.5" },
  expiresAtMs: 1_790_000_000_000,
  remainingMs: 3_600_000,
};

describe("Omada portal serializer selection", () => {
  it("chooses profiles by version and refuses unknown/old versions", () => {
    expect(selectPortalProfile("6.2.10")).toBe("v6.2.10+");
    expect(selectPortalProfile("5.15.24.18")).toBe("v5.0.15-v6.2.0");
    expect(selectPortalProfile("6.2.0")).toBe("v5.0.15-v6.2.0");
    expect(() => selectPortalProfile("4.4.6")).toThrow();
    expect(() => selectPortalProfile(null)).toThrow();
  });
});

describe("Omada extPortal/auth body", () => {
  it("v6.2.10+ sends milliseconds and documented limit fields", () => {
    const body = serializePortalAuth("v6.2.10+", "duration", {
      ...base,
      downloadRateLimitKbps: 2048,
      uploadRateLimitKbps: 512,
      totalTrafficLimitBytes: 1_000_000n,
    });
    expect(body).toMatchObject({
      clientMac: "11:22:33:44:55:66",
      apMac: "aa:bb:cc:00:00:01",
      ssidName: "Cafe",
      radioId: "1",
      clientIp: "10.0.0.5",
      time: 3_600_000,
      authType: 4,
      downloadRateLimitKbps: 2048,
      uploadRateLimitKbps: 512,
      totalTrafficLimitBytes: 1_000_000,
    });
  });

  it("uses the fixed absolute expiry when the Controller interprets time as epoch", () => {
    expect(serializePortalAuth("v6.2.10+", "absolute_epoch", base).time).toBe(base.expiresAtMs);
  });

  it("legacy profile sends microseconds and refuses capped packages", () => {
    expect(serializePortalAuth("v5.0.15-v6.2.0", "duration", base).time).toBe(3_600_000_000);
    expect(() => serializePortalAuth("v5.0.15-v6.2.0", "duration", { ...base, downloadRateLimitKbps: 1024 })).toThrow(/refusing/);
  });

  it("gateway targets carry gatewayMac and vid instead of AP fields", () => {
    const body = serializePortalAuth("v6.2.10+", "duration", {
      ...base,
      target: { kind: "gateway", clientMac: "11:22:33:44:55:66", gatewayMac: "aa:bb:cc:dd:ee:ff", vid: "10" },
    });
    expect(body).toMatchObject({ gatewayMac: "aa:bb:cc:dd:ee:ff", vid: "10" });
    expect(body).not.toHaveProperty("apMac");
  });

  it("rejects non-positive or unsafe times", () => {
    expect(() => serializePortalAuth("v6.2.10+", "duration", { ...base, remainingMs: 0 })).toThrow();
  });
});

describe("capability gating", () => {
  it("never enforces unsupported capabilities and needs verification unless simulation is allowed", () => {
    expect(canEnforce({ supported: false, verified: true }, true)).toBe(false);
    expect(canEnforce({ supported: true, verified: false }, false)).toBe(false);
    expect(canEnforce({ supported: true, verified: false }, true)).toBe(true);
    expect(canEnforce({ supported: true, verified: true }, false)).toBe(true);
  });

  it("normalizes MAC formats", () => {
    expect(normalizeMac("AA-BB-CC-00-00-01")).toBe("aa:bb:cc:00:00:01");
    expect(normalizeMac("aabb.cc00.0001")).toBe("aa:bb:cc:00:00:01");
    expect(normalizeMac("zz")).toBeNull();
  });
});
