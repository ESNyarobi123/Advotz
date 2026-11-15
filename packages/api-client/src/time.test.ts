import { describe, expect, it } from "vitest";
import { zonedInputToIso, zonedInputValue } from "./index.js";

describe("zonedInputToIso", () => {
  it("reads a datetime-local wall clock as Dar es Salaam time, not server time", () => {
    // The Admin typed 19:45 on 15 Nov meaning 19:45 EAT, which is 16:45Z.
    expect(zonedInputToIso("2026-11-15T19:45")).toBe("2026-11-15T16:45:00.000Z");
  });

  it("handles midnight without rolling the date backwards incorrectly", () => {
    expect(zonedInputToIso("2026-11-16T00:00")).toBe("2026-11-15T21:00:00.000Z");
  });

  it("treats an empty or blank value as no schedule at all", () => {
    expect(zonedInputToIso("")).toBeNull();
    expect(zonedInputToIso("   ")).toBeNull();
    expect(zonedInputToIso(null)).toBeNull();
  });

  it("passes a value that already carries an instant through untouched", () => {
    expect(zonedInputToIso("2026-11-15T16:45:00.000Z")).toBe("2026-11-15T16:45:00.000Z");
  });

  it("round-trips through the input value helper", () => {
    const iso = zonedInputToIso("2026-11-15T19:45")!;
    expect(zonedInputValue(iso)).toBe("2026-11-15T19:45");
  });

  it("uses the requested zone rather than a hard-coded one", () => {
    expect(zonedInputToIso("2026-11-15T19:45", "UTC")).toBe("2026-11-15T19:45:00.000Z");
  });
});

describe("zonedInputValue", () => {
  it("renders an instant as the Dar wall clock an Admin edits", () => {
    expect(zonedInputValue("2026-11-15T16:45:00.000Z")).toBe("2026-11-15T19:45");
  });

  it("returns an empty string for nothing and for garbage", () => {
    expect(zonedInputValue(null)).toBe("");
    expect(zonedInputValue("not a date")).toBe("");
  });
});
