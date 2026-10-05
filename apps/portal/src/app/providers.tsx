"use client";

import { I18nProvider } from "@heroui/react";
import { LOCALE_META, type Locale } from "@advo/i18n";
import type { ReactNode } from "react";
import { PortalLocaleProvider, useLocale } from "@/lib/locale";

/**
 * React Aria's built-in strings (calendar labels, number inputs) follow our
 * locale, so the portal's own copy and the components' copy never disagree.
 * HeroUI v3 itself needs no provider.
 */
function ReactAriaLocale({ children }: { children: ReactNode }) {
  const { locale } = useLocale();
  return <I18nProvider locale={LOCALE_META[locale].intlLocale}>{children}</I18nProvider>;
}

export function Providers({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  return (
    <PortalLocaleProvider initialLocale={initialLocale}>
      <ReactAriaLocale>{children}</ReactAriaLocale>
    </PortalLocaleProvider>
  );
}
