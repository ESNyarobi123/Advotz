import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Inter } from "next/font/google";
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_META, resolveLocale } from "@advo/i18n";
import "./globals.css";
import { Providers } from "./providers";

// Inter is the single typeface for the whole product. `next/font` self-hosts it
// at build time (no runtime request to Google) and exposes it as
// `--advo-font-inter`, which `@advo/ui` tokens consume.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--advo-font-inter",
});

export const metadata: Metadata = {
  title: "Advo TZ",
  description: "Smart WiFi Billing & Network Management for Tanzania",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // The locale cookie is resolved on the server so `lang` and every translated
  // string are correct in the very first paint. English is the default, so a
  // first-time visitor renders English without a cookie at all.
  const store = await cookies();
  const locale = resolveLocale(store.get(LOCALE_COOKIE)?.value, DEFAULT_LOCALE);

  return (
    <html lang={LOCALE_META[locale].htmlLang} className={inter.variable}>
      <body>
        <Providers initialLocale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
