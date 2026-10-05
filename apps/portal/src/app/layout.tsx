import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Inter } from "next/font/google";
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_META, resolveLocale } from "@advo/i18n";
import "./globals.css";
import { Providers } from "./providers";

// Same typeface as the main app so the guest portal matches the product.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--advo-font-inter",
});

export const metadata: Metadata = {
  title: "Advo TZ Portal",
  description: "Guest WiFi captive portal",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // English is the product default; a guest who switched to Swahili keeps it
  // through the cookie, so their first paint is already in their language.
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
