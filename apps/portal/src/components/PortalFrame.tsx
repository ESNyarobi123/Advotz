"use client";

import { Button } from "@heroui/react";
import { portalBackgroundStyle, portalThemeStyle } from "@advo/ui";
import { systemBrandStyle } from "@/lib/theme";
import { LOCALE_META, type Locale } from "@advo/i18n";
import { DEFAULT_PORTAL_THEME, type PortalPreviewAppearance, type PortalTheme } from "@advo/contracts";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  PortalPreviewProvider,
  usePortalPreviewAppearance,
} from "@/lib/portal-preview";

/**
 * Guest-portal shell: mobile-first container, header with the business name
 * and the language toggle. The controls used by the portal pages themselves
 * come from HeroUI (`@heroui/react`), and the one-line status messages come
 * from `@advo/ui`'s `Notice`.
 *
 * The guest journey is pinned to the platform colour combo. A reseller theme is
 * still read, then `systemBrandStyle` paints over it, so changing brand colours
 * does not recolour package selection, payment or the waiting page.
 */
export function portalThemeVars(theme?: PortalTheme): CSSProperties {
  if (!theme) return {};
  const gradient =
    theme.buttonStyle === "gradient"
      ? `linear-gradient(135deg, ${theme.primary} 0%, ${theme.accent} 100%)`
      : theme.primary;
  return {
    ...portalThemeStyle(theme),
    ["--advo-blue-hover" as string]: theme.primary,
    ["--advo-card" as string]: theme.surface,
    // HeroUI tokens so its inputs, cards and primary buttons follow the theme.
    ["--accent" as string]: theme.primary,
    ["--accent-foreground" as string]: "#ffffff",
    ["--background" as string]: theme.background,
    ["--surface" as string]: theme.surface,
    ["--surface-foreground" as string]: theme.text,
    ["--overlay" as string]: theme.surface,
    ["--overlay-foreground" as string]: theme.text,
    ["--foreground" as string]: theme.text,
    ["--field-background" as string]: theme.surface,
    ["--field-foreground" as string]: theme.text,
    ["--radius" as string]: `${theme.radius}px`,
    ["--field-radius" as string]: `${theme.radius}px`,
    ["--advo-brand-gradient" as string]: gradient,
    background: theme.background,
    color: theme.text,
  };
}

type PortalFrameProps = {
  title: string;
  business?: string;
  /**
   * Plan-resolved brand logo. Absent (the reseller has not uploaded one, or
   * their plan cannot) falls back to the platform Advowifi lockup.
   */
  logoUrl?: string | null;
  /** Plan-resolved background photo; the page colour is used when absent. */
  backgroundUrl?: string | null;
  theme?: PortalTheme;
  /** `false` on a plan whose badge may be removed and whose reseller removed it. */
  showPlatformBadge?: boolean;
  /** `true` to render the guest's language control. Defaults to false (reseller-managed). */
  showLanguageSwitcher?: boolean;
  /** The language in force. Provided, the header renders the two-way switcher. */
  locale?: Locale;
  onToggleLanguage: () => void;
  /** Preferred over `onToggleLanguage`: lets the guest pick either language. */
  onSelectLanguage?: (next: Locale) => void;
  languageLabel: string;
  banner?: ReactNode;
  children: ReactNode;
};

/**
 * The guest-portal shell, and the one place the designer's draft appearance is
 * applied.
 *
 * The frame hosts `PortalPreviewProvider`, so both its own colours and the
 * package cards below it read the same override — a reseller dragging a colour
 * and a reseller dragging a card style see them change together.
 */
export function PortalFrame(props: PortalFrameProps) {
  // `?preview=1` is the designer's own marker. Read after mount because the
  // search string does not exist while this renders on the server.
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    setPreview(new URLSearchParams(window.location.search).get("preview") === "1");
  }, []);

  return (
    <PortalPreviewProvider enabled={preview}>
      <PortalFrameShell {...props} />
    </PortalPreviewProvider>
  );
}

/** Layers the designer's draft colours, photo, logo and badge over the saved ones. */
function mergePreviewTheme(
  theme: PortalTheme | undefined,
  appearance: PortalPreviewAppearance | null,
): PortalTheme | undefined {
  const colors = appearance?.colors;
  if (!colors) return theme;
  const base = theme ?? DEFAULT_PORTAL_THEME;
  return {
    ...base,
    ...(colors.primary ? { primary: colors.primary } : {}),
    ...(colors.accent ? { accent: colors.accent } : {}),
    ...(colors.background ? { background: colors.background } : {}),
    ...(colors.preset ? { preset: colors.preset } : {}),
  };
}

function PortalFrameShell({
  title,
  business,
  logoUrl,
  backgroundUrl,
  theme,
  showPlatformBadge = true,
  showLanguageSwitcher = false,
  locale,
  onToggleLanguage,
  onSelectLanguage,
  languageLabel,
  banner,
  children,
}: PortalFrameProps) {
  const appearance = usePortalPreviewAppearance();
  const themed = useMemo(() => mergePreviewTheme(theme, appearance), [theme, appearance]);
  // `undefined` means the designer did not send this field, which is not the same
  // as sending `null`: absent leaves the saved value, `null` clears it.
  const photo = appearance?.backgroundUrl === undefined ? backgroundUrl : appearance.backgroundUrl;
  const mark = appearance?.logoUrl === undefined ? logoUrl : appearance.logoUrl;
  const badge = appearance?.showPlatformBadge ?? showPlatformBadge;
  // White wordmark on the charcoal page. A reseller logo replaces it as-is.
  const logoSrc = mark || "/brand/advo-logo.png";

  const bgStyle = portalBackgroundStyle(photo);
  const themeVars = portalThemeVars(themed);

  return (
    // `@container` lets the shared portal components (`PortalPackageCard`,
    // `PortalBanner`, `PortalDiscoverLinks`) respond to the portal's own width
    // instead of the viewport, exactly as they do inside the marketing mockup.
    <div
      className="relative min-h-screen w-full transition-all duration-300"
      style={{ ...themeVars, ...systemBrandStyle, ...bgStyle }}
    >
      <main
        className={`@container mx-auto flex min-h-screen max-w-md flex-col px-4 py-5 ${
          photo ? "backdrop-blur-[1px]" : ""
        }`}
      >
        {banner ? <div className="mb-4">{banner}</div> : null}

        <header className="mb-2 flex flex-col items-center justify-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            className={`mb-2 h-14 w-auto object-contain ${mark ? "max-w-[11rem]" : "max-w-[9.5rem]"}`}
            src={logoSrc}
          />
          <h1
            className="text-2xl font-black tracking-tight text-white"
          >
            {title}
          </h1>
          {showLanguageSwitcher ? (
            <div className="mt-2">
              {locale && onSelectLanguage ? (
                <LanguageSwitcher locale={locale} onSelect={onSelectLanguage} />
              ) : (
                <Button size="sm" variant="outline" onPress={onToggleLanguage}>
                  {languageLabel}
                </Button>
              )}
            </div>
          ) : null}
        </header>
        {children}
        {badge ? <footer className="mt-6 text-center text-xs font-semibold text-white/45">Advo TZ</footer> : null}
      </main>
    </div>
  );
}

/**
 * The guest's language control: two named options, never a single mystery toggle.
 *
 * A lone "Lugha" button asks a guest to guess what pressing it does and gives no
 * sign of what they will get. Naming both languages — and highlighting the one in
 * force — turns it into a choice they can read at a glance, which matters most on
 * the one screen a first-time visitor has never seen before.
 */
function LanguageSwitcher({ locale, onSelect }: { locale: Locale; onSelect: (next: Locale) => void }) {
  return (
    <div
      aria-label={LOCALE_META[locale].englishName}
      className="flex shrink-0 items-center gap-0.5 rounded-full border border-[var(--advo-portal-line)] bg-white/90 p-0.5"
      role="group"
    >
      {(Object.keys(LOCALE_META) as Locale[]).map((code) => {
        const active = code === locale;
        return (
          <button
            aria-pressed={active}
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
              active ? "bg-[var(--advo-blue)] text-white" : "text-[var(--advo-portal-muted)] hover:text-[var(--advo-blue)]"
            }`}
            key={code}
            onClick={() => onSelect(code)}
            type="button"
          >
            {code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
