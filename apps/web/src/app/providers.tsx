"use client";

import { I18nProvider } from "@heroui/react";
import { LOCALE_META, type Locale } from "@advo/i18n";
import type { ReactNode } from "react";
import { LocaleProvider, useI18n } from "@/lib/i18n";

/**
 * HeroUI v3 is built on React Aria and needs no provider for components to
 * work. `I18nProvider` is still worth wiring: it pins the locale React Aria uses
 * for date, number and currency formatting, plus its built-in component strings
 * (calendar labels, table selection announcements). Driving it from our own
 * locale keeps both halves of the UI in one language.
 */
function ReactAriaLocale({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  return <I18nProvider locale={LOCALE_META[locale].intlLocale}>{children}</I18nProvider>;
}

export function Providers({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  return (
    <LocaleProvider initialLocale={initialLocale}>
      <ReactAriaLocale>{children}</ReactAriaLocale>
    </LocaleProvider>
  );
}
