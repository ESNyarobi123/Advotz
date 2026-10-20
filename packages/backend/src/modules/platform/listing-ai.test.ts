import { describe, expect, it } from "vitest";
import { parseAnswer, parseDate } from "./listing-ai.service.js";

/**
 * The assistant answers with a JSON array produced by a streaming call, so the
 * parser has to survive the shapes a stream actually produces.
 */
describe("parseAnswer", () => {
  it("parses a plain array", () => {
    const parsed = parseAnswer('[{"title":"Mhudumu"}]');
    expect(parsed).toEqual([{ title: "Mhudumu" }]);
  });

  it("strips a markdown fence", () => {
    const parsed = parseAnswer('```json\n[{"title":"Mhudumu"}]\n```');
    expect(parsed).toEqual([{ title: "Mhudumu" }]);
  });

  it("keeps the array when the model wraps it in prose", () => {
    const parsed = parseAnswer('Here are the listings:\n[{"title":"A"},{"title":"B"}]\nHope this helps.');
    expect(parsed).toEqual([{ title: "A" }, { title: "B" }]);
  });

  it("salvages the complete items when the stream was cut mid-object", () => {
    const parsed = parseAnswer('[{"title":"A"},{"title":"B"},{"title":"C","su');
    expect(parsed).toEqual([{ title: "A" }, { title: "B" }]);
  });

  it("drops a trailing comma instead of losing every item", () => {
    const parsed = parseAnswer('[{"title":"A"},{"title":"B"},]');
    expect(parsed).toEqual([{ title: "A" }, { title: "B" }]);
  });

  it("keeps items when one of them is malformed", () => {
    const parsed = parseAnswer('[{"title":"A"},{oops},{"title":"C"}]');
    expect(parsed).toEqual([{ title: "A" }, { title: "C" }]);
  });

  it("rejects an answer that carries no JSON at all", () => {
    expect(() => parseAnswer("I could not find anything today.")).toThrow(/not valid JSON/);
  });
});

describe("parseDate", () => {
  it("treats a bare date as midnight East Africa Time", () => {
    const date = parseDate("2026-11-14");
    expect(date?.toISOString()).toBe("2026-11-13T21:00:00.000Z");
  });

  it("keeps the instant of a full ISO timestamp", () => {
    const date = parseDate("2026-11-14T16:00:00.000Z");
    expect(date?.toISOString()).toBe("2026-11-14T16:00:00.000Z");
  });

  it("returns null for blanks and nonsense", () => {
    expect(parseDate("")).toBeNull();
    expect(parseDate("   ")).toBeNull();
    expect(parseDate("sometime next week")).toBeNull();
  });
});
