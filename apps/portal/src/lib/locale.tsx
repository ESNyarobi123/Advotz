"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_META,
  LOCALE_STORAGE_KEY,
  createTranslator,
  type Locale,
  type MessageKey,
  type TranslateVars,
} from "@advo/i18n";

export type PortalLocale = {
  locale: Locale;
  t: (key: MessageKey, vars?: TranslateVars) => string;
  /** Flips between English and Swahili. */
  toggle: () => void;
  setLocale: (next: Locale) => void;
};

const PortalLocaleContext = createContext<PortalLocale | null>(null);

/**
 * Locale for the guest portal.
 *
 * English is the default for the whole product, so a first-time guest sees
 * English. `initialLocale` is resolved from the cookie on the server, which
 * keeps the first paint in the right language for a returning guest instead of
 * flashing English before their choice is applied.
 */
export function PortalLocaleProvider({
  initialLocale = DEFAULT_LOCALE,
  children,
}: {
  initialLocale?: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    setLocaleState(initialLocale);
  }, [initialLocale]);

  useEffect(() => {
    document.documentElement.lang = LOCALE_META[locale].htmlLang;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Storage can be blocked in private browsing; the cookie still applies.
    }
    document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=${LOCALE_COOKIE_MAX_AGE};samesite=lax`;
  }, []);

  const value = useMemo<PortalLocale>(
    () => ({
      locale,
      t: createTranslator(locale),
      setLocale,
      toggle: () => setLocale(locale === "en" ? "sw" : "en"),
    }),
    [locale, setLocale],
  );

  return <PortalLocaleContext.Provider value={value}>{children}</PortalLocaleContext.Provider>;
}

/** The active portal locale plus a bound translator. */
export function useLocale(): PortalLocale {
  const value = useContext(PortalLocaleContext);
  if (!value) throw new Error("useLocale must be used inside PortalLocaleProvider");
  return value;
}
