import { describe, expect, it } from "vitest";
import { LOCALES, MESSAGE_KEYS, hasTranslation, t, type Locale } from "./index.js";

/**
 * Translation coverage.
 *
 * The type system already proves every locale declares every key, so what is left
 * is the part types cannot see: a value that is present but empty, and a value
 * whose `{placeholders}` were dropped in translation. Both are invisible in
 * English and obvious to a Swahili guest — and the guest portal now offers a
 * one-tap language switch, so a gap is one tap away from a real customer.
 */

/** The `{name}` placeholders a message expects, as a sorted set. */
function placeholders(message: string): string[] {
  return [...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort();
}

describe("translation coverage", () => {
  it("has a non-empty translation for every key in every locale", () => {
    const missing: string[] = [];
    for (const locale of LOCALES) {
      for (const key of MESSAGE_KEYS) {
        const message = t(locale, key);
        if (message.trim().length === 0) missing.push(`${locale}:${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("reports a real translation for every key, never an English fallback", () => {
    for (const locale of LOCALES as readonly Locale[]) {
      for (const key of MESSAGE_KEYS) {
        expect(hasTranslation(locale, key), `${locale}:${key}`).toBe(true);
      }
    }
  });

  it("keeps the same placeholders in every locale", () => {
    // A translation that drops `{count}` renders a sentence with a hole in it,
    // which is worse than no translation at all.
    const mismatched: Array<{ key: string; locale: string; expected: string[]; actual: string[] }> = [];
    for (const key of MESSAGE_KEYS) {
      const english = placeholders(t("en", key));
      if (english.length === 0) continue;
      for (const locale of LOCALES) {
        if (locale === "en") continue;
        const translated = placeholders(t(locale, key));
        if (english.join(",") !== translated.join(",")) {
          mismatched.push({ key, locale, expected: english, actual: translated });
        }
      }
    }
    expect(mismatched).toEqual([]);
  });

  it("substitutes a placeholder rather than leaving the brace text on screen", () => {
    // `portal.advertPosition` is exercised because it is the slide counter a guest
    // reads on every rotation of the sponsored carousel, and it takes two
    // variables — the shape most likely to be translated wrongly.
    expect(t("sw", "portal.advertPosition", { current: 1, total: 3 })).toContain("1");
    expect(t("sw", "portal.advertPosition", { current: 1, total: 3 })).not.toContain("{current}");
    expect(t("sw", "portal.advertPosition", { current: 1, total: 3 })).not.toContain("{total}");
  });
});
