import type { CSSProperties } from "react";
import type { PortalTheme } from "@advo/contracts";

/** Props HeroUI's `Button` needs to look the way the Reseller chose. */
export type PrimaryButtonStyle = {
  variant: "primary" | "outline";
  style: CSSProperties;
  className?: string;
};

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
