import { afterEach, describe, expect, it } from "vitest";
import { bandFromOmada, bandToOmada, FakeOmadaAdapter } from "./index.js";

describe("Omada WiFi band", () => {
  it("maps 2.4, 5 and both onto the OpenAPI bitmask", () => {
    expect(bandToOmada("2.4")).toBe(1);
    expect(bandToOmada("5")).toBe(2);
    expect(bandToOmada("both")).toBe(3);
    expect(bandFromOmada(1)).toBe("2.4");
    expect(bandFromOmada(2)).toBe("5");
    expect(bandFromOmada(3)).toBe("both");
    expect(bandFromOmada(7)).toBe("both");
  });
});

describe("simulated site WiFi", () => {
  afterEach(() => FakeOmadaAdapter.resetSharedState());

  it("creates a hidden secured network, renames the device, then forgets it", async () => {
    FakeOmadaAdapter.resetSharedState();
    const adapter = new FakeOmadaAdapter();
    const site = await adapter.createSite({ name: "Cafe", externalId: "cafe", timezone: "Africa/Dar_es_Salaam" });
    await adapter.adoptDevice({ remoteSiteId: site.remoteSiteId, mac: "aa:bb:cc:00:00:09", deviceUsername: "admin", devicePassword: "admin" });
    const wifi = await adapter.createWifi({
      remoteSiteId: site.remoteSiteId,
      name: "Cafe Guest",
      password: "cafe-wifi",
      hidden: true,
      band: "5",
    });
    expect(wifi).toMatchObject({ name: "Cafe Guest", hidden: true, secured: true, band: "5" });
    expect(await adapter.listSsids({ remoteSiteId: site.remoteSiteId })).toEqual([expect.objectContaining({ name: "Cafe Guest" })]);
    await adapter.renameDevice({ remoteSiteId: site.remoteSiteId, mac: "aa:bb:cc:00:00:09", name: "Counter AP", kind: "ap" });
    const [device] = await adapter.listDevices({ remoteSiteId: site.remoteSiteId });
    expect(device?.name).toBe("Counter AP");
    await adapter.forgetDevice({ remoteSiteId: site.remoteSiteId, mac: "aa:bb:cc:00:00:09" });
    expect(await adapter.listDevices({ remoteSiteId: site.remoteSiteId })).toEqual([]);
  });
});
