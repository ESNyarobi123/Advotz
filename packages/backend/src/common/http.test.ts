import { describe, expect, it } from "vitest";
import { enumQuery } from "./http.js";

const State = { OPEN: "OPEN", CLOSED: "CLOSED" } as const;

describe("enumQuery", () => {
  it("passes through missing or empty filters", () => {
    expect(enumQuery(undefined, State)).toBeUndefined();
    expect(enumQuery("", State)).toBeUndefined();
  });

  it("accepts enum members", () => {
    expect(enumQuery("OPEN", State)).toBe("OPEN");
  });

  it("rejects unknown values with a 400 validation error", () => {
    expect(() => enumQuery("open", State)).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => enumQuery("'; DROP", State)).toThrow(expect.objectContaining({ status: 400 }));
  });
});
