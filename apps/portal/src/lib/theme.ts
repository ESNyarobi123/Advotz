import type { CSSProperties } from "react";
import type { PortalTheme } from "@advo/contracts";

/** Props HeroUI's `Button` needs to look the way the Reseller chose. */
export type PrimaryButtonStyle = {
  variant: "primary" | "outline";
  style: CSSProperties;
  className?: string;
};

/**
 * Platform colours for the guest journey.
 *
 * A reseller theme repaints `--advo-blue`, the portal ink and the HeroUI accent
 * on the frame. These aliases stay the system combo, so package selection, the
 * pay dialog and the waiting page do not follow that change.
 */
export const systemBrandStyle: CSSProperties = {
  ["--advo-blue" as string]: "var(--advo-blue-brand)",
  ["--advo-blue-hover" as string]: "var(--advo-blue-brand)",
  ["--advo-text" as string]: "var(--advo-text-brand)",
  ["--advo-page" as string]: "var(--advo-page-brand)",
  ["--advo-card" as string]: "var(--advo-card-brand)",
  ["--advo-portal-ink" as string]: "var(--advo-charcoal)",
  ["--advo-portal-orange" as string]: "var(--advo-orange)",
  ["--advo-portal-orange-deep" as string]: "var(--advo-orange)",
  ["--advo-portal-orange-soft" as string]: "var(--advo-gold-soft)",
  ["--advo-portal-paper" as string]: "var(--advo-page-brand)",
  ["--advo-brand-gradient" as string]: "var(--advo-gradient-gold)",
  ["--accent" as string]: "var(--advo-orange)",
  ["--accent-foreground" as string]: "var(--advo-charcoal)",
  ["--background" as string]: "var(--advo-page-brand)",
  ["--surface" as string]: "var(--advo-card-brand)",
  ["--surface-foreground" as string]: "var(--advo-text-brand)",
  ["--overlay" as string]: "var(--advo-card-brand)",
  ["--overlay-foreground" as string]: "var(--advo-text-brand)",
  ["--foreground" as string]: "var(--advo-text-brand)",
  ["--field-background" as string]: "var(--advo-card-brand)",
  ["--field-foreground" as string]: "var(--advo-text-brand)",
  backgroundColor: "var(--advo-charcoal)",
  color: "#ffffff",
};

/** The system action: gold gradient, charcoal label. */
export const systemActionStyle: CSSProperties = {
  background: "var(--advo-gradient-gold)",
  color: "var(--advo-charcoal)",
  borderColor: "transparent",
};

export const systemActionClass =
  "flex w-full items-center justify-center rounded-full py-3.5 text-sm font-bold text-advo-charcoal transition hover:brightness-105 active:scale-[0.98] disabled:opacity-60";

/** Fills the primary button the way the Reseller chose in the designer. */
export function primaryButton(theme?: PortalTheme): PrimaryButtonStyle {
  if (!theme || theme.buttonStyle === "solid") return { variant: "primary", style: {} };
  if (theme.buttonStyle === "gradient") {
    return {
      variant: "primary",
      style: {
        background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.accent} 100%)`,
        color: "#ffffff",
        borderColor: "transparent",
      },
    };
  }
  return { variant: "outline", style: { borderColor: theme.primary, color: theme.primary } };
}

/** Small rounding helper so price chips never look like oversized cards. */
export function radius(theme: PortalTheme | undefined, max: number): number {
  if (!theme) return max;
  return Math.min(theme.radius, max);
}

/** True when a hex colour is dark enough to need light text. */
export function isDark(hex: string): boolean {
  const value = hex.replace("#", "");
  if (value.length !== 6) return false;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 140;
}
