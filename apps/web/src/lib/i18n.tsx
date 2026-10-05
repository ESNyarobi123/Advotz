"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_META,
  LOCALE_STORAGE_KEY,
  createTranslator,
  resolveLocale,
  type Locale,
  type MessageKey,
  type TranslateVars,
} from "@advo/i18n";

export type I18n = {
  locale: Locale;
  /** Persists to the cookie (for SSR) and `localStorage` (for the client). */
  setLocale: (next: Locale) => void;
  /** Flips between the two supported locales. */
  toggleLocale: () => void;
  /** Resolves a message key, substituting `{placeholder}` variables. */
  t: (key: MessageKey, vars?: TranslateVars) => string;
};

const LocaleContext = createContext<I18n | null>(null);

/**
 * Holds the active locale for the dashboard.
 *
 * `initialLocale` comes from the `advo.lang` cookie, read in the root layout on
 * the server, so the server HTML and the first client render agree — no
 * hydration mismatch and no flash of the wrong language.
 */
export function LocaleProvider({
  initialLocale = DEFAULT_LOCALE,
  children,
}: {
  initialLocale?: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // Follow the server-resolved locale if the cookie differs from what we were
  // given (e.g. after a client-side navigation that refreshed the layout).
  useEffect(() => {
    setLocaleState(initialLocale);
  }, [initialLocale]);

  // `<html lang>` drives hyphenation, font fallback and screen-reader voice.
  useEffect(() => {
    document.documentElement.lang = LOCALE_META[locale].htmlLang;
  }, [locale]);

  const applyLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Private browsing or a blocked storage partition — the cookie still applies.
    }
    document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=${LOCALE_COOKIE_MAX_AGE};samesite=lax`;
  }, []);

  const toggleLocale = useCallback(() => {
    applyLocale(locale === "en" ? "sw" : "en");
  }, [applyLocale, locale]);

  const value = useMemo<I18n>(
    () => ({ locale, setLocale: applyLocale, toggleLocale, t: createTranslator(locale) }),
    [applyLocale, locale, toggleLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/**
 * The active locale and a bound translator. Throws rather than silently
 * returning English, so a missing provider shows up in development instead of
 * shipping half-translated screens.
 */
export function useI18n(): I18n {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useI18n must be used inside LocaleProvider");
  return value;
}

/** Shorthand for screens that only need the translator. */
export function useT() {
  return useI18n().t;
}

/** Reads the persisted locale from `localStorage`, ignoring storage failures. */
export function readStoredLocale(): Locale {
  try {
    return resolveLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY), DEFAULT_LOCALE);
  } catch {
    return DEFAULT_LOCALE;
  }
}
