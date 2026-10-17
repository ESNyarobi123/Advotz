"use client";

import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";
import { LOCALES, LOCALE_META, type Locale } from "@advo/i18n";
import { useI18n } from "@/lib/i18n";

/**
 * Language switch, rendered as a two-option segmented control.
 *
 * A segmented control beats a dropdown here: there are exactly two languages,
 * both names fit, and the active one stays visible instead of being hidden
 * behind a click. `role="group"` + `aria-pressed` gives assistive tech the same
 * "which one is on" answer the highlight gives the eye.
 */
export function LocaleSwitcher({
  variant = "light",
  showIcon = true,
  compact = false,
  /** No outer border/box — sits flush inside a parent row (sidebar footer). */
  flush = false,
  className = "",
}: {
  /** `dark` sits on the charcoal sidebar, `light` on white marketing surfaces. */
  variant?: "light" | "dark";
  showIcon?: boolean;
  /** Short codes (`EN` / `SW`) for the narrow icon rail instead of full names. */
  compact?: boolean;
  flush?: boolean;
  className?: string;
}) {
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
  const inactive = variant === "dark" ? "text-slate-400 hover:text-white" : "text-[var(--advo-muted)] hover:text-[var(--advo-text)]";
  const active = variant === "dark"
    ? flush
      ? "bg-white/12 font-bold text-white"
      : "bg-white/15 font-bold text-white"
    : "bg-white font-bold text-advo-blue shadow-sm";

  return (
    <div
      aria-label={t("common.languageSwitch")}
      className={`inline-flex items-center gap-1 rounded-xl ${shell} ${className}`}
      role="group"
      title={t("common.languageCurrent", { language: LOCALE_META[locale].nativeName })}
    >
      {showIcon ? (
        <Globe
          aria-hidden="true"
          className={`ml-1.5 h-3.5 w-3.5 shrink-0 ${variant === "dark" ? "text-slate-400" : "text-[var(--advo-muted)]"}`}
        />
      ) : null}
      {LOCALES.map((code: Locale) => {
        const isActive = code === locale;
        const meta = LOCALE_META[code];
        return (
          <button
            aria-pressed={isActive}
            className={`rounded-lg py-1 text-[11px] font-semibold transition-colors ${
              compact ? "min-w-7 px-1.5 text-center" : "px-2"
            } ${isActive ? active : inactive}`}
            key={code}
            lang={meta.htmlLang}
            onClick={() => changeLocale(code)}
            type="button"
            /* The native name is what a reader recognises; the English name is
               the accessible fallback so an English speaker can still navigate. */
            title={meta.englishName}
          >
            {compact ? meta.code.toUpperCase() : meta.nativeName}
          </button>
        );
      })}
    </div>
  );
}
