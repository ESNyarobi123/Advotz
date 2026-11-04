import { describe, expect, it } from "vitest";
import { usageWindow } from "./usage/usage.service.js";

/**
 * The Reseller dashboard groups "today" by the Africa/Dar_es_Salaam calendar,
 * not UTC. These assertions pin the boundary so a future date/time change
 * cannot silently shift every GB by three hours.
 */
const now = new Date("2026-11-02T09:30:00.000Z"); // 12:30 in Dar es Salaam

describe("usageWindow", () => {
  it("starts today at Dar midnight (21:00Z the day before)", () => {
    const w = usageWindow("today", now);
    expect(w.from.toISOString()).toBe("2026-11-01T21:00:00.000Z");
    expect(w.to.toISOString()).toBe(now.toISOString());
    expect(w.bucket).toBe("hour");
  });

  it("compares today against an equally long window immediately before", () => {
    const w = usageWindow("today", now);
    expect(w.previousFrom.toISOString()).toBe("2026-11-01T08:30:00.000Z");
    expect(w.previousTo.toISOString()).toBe("2026-11-01T21:00:00.000Z");
  });

  it("returns yesterday without overlapping today", () => {
    const w = usageWindow("yesterday", now);
    expect(w.from.toISOString()).toBe("2026-10-31T21:00:00.000Z");
    expect(w.to.toISOString()).toBe("2026-11-01T21:00:00.000Z");
    expect(w.bucket).toBe("hour");
  });

  it("covers seven and thirty Dar days for the trend ranges", () => {
    const week = usageWindow("week", now);
    expect(week.from.toISOString()).toBe("2026-10-26T21:00:00.000Z");
    expect(week.bucket).toBe("day");

    const month = usageWindow("month", now);
    expect(month.from.toISOString()).toBe("2026-10-03T21:00:00.000Z");
    expect(month.bucket).toBe("day");
  });

  it("keeps each comparison window the same length as its current window", () => {
    for (const range of ["today", "yesterday", "week", "month"] as const) {
      const w = usageWindow(range, now);
      expect(w.previousTo.getTime() - w.previousFrom.getTime()).toBe(w.to.getTime() - w.from.getTime());
    }
  });
});
