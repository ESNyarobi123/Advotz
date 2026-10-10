import { describe, expect, it } from "vitest";
import { adoptFailureMessage, devicePresence, normalizeMac, omadaMac } from "./controller-adapter.js";

describe("devicePresence", () => {
  it("treats a connected controller device as active", () => {
    expect(devicePresence({ statusCategory: 1, status: 14 })).toBe("active");
    expect(devicePresence({ status: "connected" })).toBe("active");
  });

  it("treats a disconnected controller device as offline", () => {
    expect(devicePresence({ statusCategory: 0, detailStatus: 0 })).toBe("offline");
    expect(devicePresence({ status: 0, detailStatus: 0 })).toBe("offline");
    expect(devicePresence({ status: "disconnected" })).toBe("offline");
  });

  it("keeps a discovered device pending until it is adopted", () => {
    expect(devicePresence({ status: 2, detailStatus: 20 })).toBe("pending");
    expect(devicePresence({ statusCategory: 2, detailStatus: 20 })).toBe("pending");
    expect(devicePresence({ status: 22 })).toBe("pending");
  });
});

describe("adoptFailureMessage", () => {
  it("turns Omada adopt-result codes into the reason a reseller can act on", () => {
    expect(adoptFailureMessage(0)).toBeNull();
    expect(adoptFailureMessage(-39003)).toMatch(/username or password/i);
    expect(adoptFailureMessage(-39005)).toMatch(/not connected/i);
  });
});

describe("omadaMac", () => {
  it("sends the MAC in the form the controller adopt API expects", () => {
    expect(normalizeMac("ac:84:c6:00:00:01")).toBe("ac:84:c6:00:00:01");
    expect(omadaMac("ac:84:c6:00:00:01")).toBe("AC-84-C6-00-00-01");
  });
});
