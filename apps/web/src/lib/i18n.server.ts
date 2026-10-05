import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  createTranslator,
  resolveLocale,
  type Locale,
  type Translator,
} from "@advo/i18n";

export type ServerI18n = { locale: Locale; t: Translator };

/**
 * Translator for **server components**.
 *
 * Client components use `useI18n()` from `@/lib/i18n`; a server component
 * cannot, so it resolves the same `advo.lang` cookie the root layout reads and
 * returns a translator bound to it. Reading cookies opts the route into dynamic
 * rendering, which these marketing pages accept in exchange for correct
 * server-rendered copy in the visitor's language.
 */
export async function getServerI18n(): Promise<ServerI18n> {
  const store = await cookies();
  const locale = resolveLocale(store.get(LOCALE_COOKIE)?.value, DEFAULT_LOCALE);
  return { locale, t: createTranslator(locale) };
}
