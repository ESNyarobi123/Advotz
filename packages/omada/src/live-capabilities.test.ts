import { describe, expect, it } from "vitest";
import { LiveOmadaAdapter } from "./live.adapter.js";

const base = {
  baseUrl: "https://controller.example",
  omadacId: "controller",
  verifiedCapabilities: {},
  portal: { operatorUsername: "operator", operatorPassword: "secret", timeSemantics: "duration" as const },
};

describe("live controller package enforcement", () => {
  it("treats a configured v6.2.10+ portal as able to authorize clients and apply speed limits", async () => {
    const caps = await new LiveOmadaAdapter({ ...base, version: "6.3.0.45" }).getCapabilities();
    expect(caps.authorizeClient).toMatchObject({ supported: true, verified: true });
    expect(caps.perClientRateLimit).toMatchObject({ supported: true, verified: true });
    expect(caps.totalTrafficQuota).toMatchObject({ supported: true, verified: true });
  });

  it("does not advertise speed limits on an older portal profile", async () => {
    const caps = await new LiveOmadaAdapter({ ...base, version: "5.15.24" }).getCapabilities();
    expect(caps.authorizeClient.verified).toBe(true);
    expect(caps.perClientRateLimit.supported).toBe(false);
    expect(caps.totalTrafficQuota.supported).toBe(false);
  });
});
