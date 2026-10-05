"use client";

import { Button } from "@heroui/react";
import type { PortalTheme } from "@advo/contracts";
import type { CSSProperties, ReactNode } from "react";

/**
 * Guest-portal shell: mobile-first container, header with the business name
 * and the language toggle. The controls used by the portal pages themselves
 * come from HeroUI (`@heroui/react`), and the one-line status messages come
 * from `@advo/ui`'s `Notice`.
 *
 * The Reseller's Captive Portal theme (colors, radius) is applied here as CSS
 * variables so both our classes and HeroUI components pick it up.
 */
export function portalThemeVars(theme?: PortalTheme): CSSProperties {
  if (!theme) return {};
  const gradient =
    theme.buttonStyle === "gradient"
      ? `linear-gradient(135deg, ${theme.primary} 0%, ${theme.accent} 100%)`
      : theme.primary;
  return {
    // Advo tokens used directly by portal classes.
    ["--advo-blue" as string]: theme.primary,
    ["--advo-blue-hover" as string]: theme.primary,
    ["--advo-page" as string]: theme.background,
    ["--advo-card" as string]: theme.surface,
    ["--advo-text" as string]: theme.text,
    ["--advo-brand-gradient" as string]: gradient,
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
    background: theme.background,
    color: theme.text,
  };
}

export function PortalFrame({
  title,
  business,
  theme,
  onToggleLanguage,
  languageLabel,
  children,
}: {
  title: string;
  business?: string;
  theme?: PortalTheme;
  onToggleLanguage: () => void;
  languageLabel: string;
  children: ReactNode;
}) {
  return (
    <main
      className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-6"
      style={portalThemeVars(theme)}
    >
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ color: "var(--advo-text)" }}>
            {title}
          </h1>
          {business ? <p className="text-sm text-muted">{business}</p> : null}
        </div>
        <Button size="sm" variant="outline" onPress={onToggleLanguage}>
          {languageLabel}
        </Button>
      </header>
      {children}
      <footer className="mt-auto pt-8 text-center text-xs text-muted">Advo TZ</footer>
    </main>
  );
}
