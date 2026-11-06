import { describe, expect, it } from "vitest";
import { externalPortalTarget } from "./live.adapter.js";

describe("externalPortalTarget", () => {
  it("splits the scheme from host/path and names the portal after the slug", () => {
    expect(externalPortalTarget("https://wifi.advowifi.com/yuni-net-61418e")).toEqual({
      name: "Advo yuni-net-61418e",
      scheme: "https",
      serverUrl: "wifi.advowifi.com/yuni-net-61418e",
    });
  });

  /**
   * Omada ignores an http:// external portal URL and falls back to its own
   * `:8088/portal/entry`, which guests cannot reach. Never store http for a real host.
   */
  it("upgrades a public http URL to https, because Omada ignores http", () => {
    expect(externalPortalTarget("http://wifi.advowifi.com/sky-net-6ec4c7")).toMatchObject({
      scheme: "https",
      serverUrl: "wifi.advowifi.com/sky-net-6ec4c7",
    });
  });

  it("keeps http for local development hosts", () => {
    expect(externalPortalTarget("http://localhost:3001/dev-site")).toMatchObject({ scheme: "http" });
    expect(externalPortalTarget("http://127.0.0.1:3001/dev-site")).toMatchObject({ scheme: "http" });
  });
});
