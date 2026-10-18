"use client";

import { useRouter } from "next/navigation";
import { LOCALES, LOCALE_META, type Locale } from "@advo/i18n";
import { useI18n } from "@/lib/i18n";

/**
 * Language switch as flag-only buttons: US flag for English, Tanzania for Swahili.
 *
 * Labels stay on `aria-label` / `title` so assistive tech and hover still name
 * the language; the visible control is just the flags.
 */
export function LocaleSwitcher({
  variant = "light",
  showIcon: _showIcon = true,
  compact = false,
  /** No outer border/box — sits flush inside a parent row (sidebar footer). */
  flush = false,
  className = "",
}: {
  /** `dark` sits on the charcoal sidebar, `light` on white marketing surfaces. */
  variant?: "light" | "dark";
  /** Kept for call-site compatibility; the globe icon is no longer shown. */
  showIcon?: boolean;
  /** Slightly smaller flag buttons for the narrow icon rail. */
  compact?: boolean;
  flush?: boolean;
  className?: string;
}) {
  void _showIcon;
  const { locale, setLocale, t } = useI18n();
  const router = useRouter();

  /**
   * Switching locale has to do two things, not one: update the client provider
   * (instant) and re-render the server components. Marketing screens are async
   * server components that resolve their strings from the `advo.lang` cookie, so
   * without a refresh they would keep the previous language until the next
   * navigation — a half-translated page. `applyLocale` writes the cookie
   * synchronously before this runs, so the refresh request carries the new value.
   */
  const changeLocale = (next: Locale) => {
    setLocale(next);
    router.refresh();
  };

  const shell = flush
    ? "border-0 bg-transparent p-0"
    : variant === "dark"
      ? "border border-white/10 bg-white/[0.06] p-0.5"
      : "border border-[var(--advo-border)] bg-[var(--advo-page)] p-0.5";
  const inactive = variant === "dark" ? "opacity-55 hover:opacity-90" : "opacity-55 hover:opacity-90";
  const active = variant === "dark"
    ? flush
      ? "bg-white/12 ring-1 ring-white/25"
      : "bg-white/15 ring-1 ring-white/30"
    : "bg-white shadow-sm ring-1 ring-advo-blue/25";

  const flagSize = compact ? "h-3.5 w-[1.15rem]" : "h-4 w-6";

  return (
    <div
      aria-label={t("common.languageSwitch")}
      className={`inline-flex items-center gap-0.5 rounded-xl ${shell} ${className}`}
      role="group"
      title={t("common.languageCurrent", { language: LOCALE_META[locale].nativeName })}
    >
      {LOCALES.map((code: Locale) => {
        const isActive = code === locale;
        const meta = LOCALE_META[code];
        return (
          <button
            aria-label={meta.englishName}
            aria-pressed={isActive}
            className={`rounded-lg p-1.5 transition ${isActive ? active : inactive}`}
            key={code}
            lang={meta.htmlLang}
            onClick={() => changeLocale(code)}
            type="button"
            title={meta.englishName}
          >
            <LocaleFlag code={code} className={flagSize} />
          </button>
        );
      })}
    </div>
  );
}

function LocaleFlag({ code, className }: { code: Locale; className?: string }) {
  if (code === "en") {
    return (
      <svg
        aria-hidden="true"
        className={`block rounded-[2px] ${className ?? ""}`}
        viewBox="0 0 60 40"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect fill="#B22234" height="40" width="60" />
        <path
          d="M0 4.6h60M0 9.2h60M0 13.8h60M0 18.5h60M0 23.1h60M0 27.7h60M0 32.3h60M0 36.9h60"
          stroke="#fff"
          strokeWidth="2.3"
        />
        <rect fill="#3C3B6E" height="21.5" width="24" />
        <g fill="#fff">
          {Array.from({ length: 9 }, (_, row) =>
            Array.from({ length: row % 2 === 0 ? 6 : 5 }, (_, col) => (
              <circle
                cx={row % 2 === 0 ? 2.2 + col * 4 : 4.2 + col * 4}
                cy={2.2 + row * 2.3}
                key={`${row}-${col}`}
                r="0.7"
              />
            )),
          )}
        </g>
      </svg>
    );
  }

  // Tanzania
  return (
    <svg
      aria-hidden="true"
      className={`block rounded-[2px] ${className ?? ""}`}
      viewBox="0 0 60 40"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="#1EB53A" height="40" width="60" />
      <polygon fill="#00A3DD" points="60,0 60,40 0,40" />
      <polygon fill="#000" points="0,8 0,0 12,0 60,32 60,40 48,40" />
      <polygon fill="#FCD116" points="0,12 0,8 14,0 18,0 60,28 60,32 46,40 42,40" />
    </svg>
  );
}
