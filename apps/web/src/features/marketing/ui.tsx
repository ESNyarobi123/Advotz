import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

/**
 * Marketing UI primitives.
 *
 * The public site used to repeat a long tail of hand-written button, badge and
 * card recipes with hardcoded hex values and five different font sizes. These
 * helpers pin the marketing pages to the same design language as the rest of
 * the product (`@advo/ui` tokens): one container width, one vertical rhythm,
 * one type scale and one button vocabulary.
 *
 * They stay free of hooks and `"use client"` so both the async server pages
 * (`page.tsx`) and the client widgets can import them.
 */

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ── Layout ────────────────────────────────────────────────────────────── */

export function Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)}>
      {children}
    </div>
  );
}

type SectionTone = "light" | "soft" | "dark" | "raised";

const SECTION_TONES: Record<SectionTone, string> = {
  light: "bg-white text-advo-text",
  soft: "bg-advo-page text-advo-text",
  dark: "bg-advo-charcoal text-white",
  raised: "bg-[#1a1c1f] text-white",
};

/**
 * A full-width page band with the standard vertical rhythm.
 *
 * `scroll-mt-24` is not decoration: the marketing header is sticky and ~80px
 * tall, so without a scroll margin every in-page anchor (`/#solutions`,
 * `/#how-it-works`, …) parks its heading underneath the header.
 */
export function Section({
  id,
  tone = "light",
  className,
  containerClassName,
  children,
  "aria-labelledby": ariaLabelledBy,
}: {
  id?: string;
  tone?: SectionTone;
  className?: string;
  containerClassName?: string;
  children: ReactNode;
  "aria-labelledby"?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={ariaLabelledBy}
      className={cx("relative w-full scroll-mt-24 py-20 sm:py-24 lg:py-28", SECTION_TONES[tone], className)}
    >
      <Container className={containerClassName}>{children}</Container>
    </section>
  );
}

/* ── Typography ────────────────────────────────────────────────────────── */

type Tone = "light" | "dark";

export function Eyebrow({
  children,
  tone = "blue",
  className,
}: {
  children: ReactNode;
  tone?: "blue" | "gold" | "dark";
  className?: string;
}) {
  const tones = {
    blue: "border-advo-gold/30 bg-advo-gold-soft text-[#b15f00]",
    gold: "border-advo-gold/30 bg-advo-gold-soft text-[#b15f00]",
    dark: "border-[#FBA102]/45 bg-[#FBA102]/10 text-[#FBA102]",
  } as const;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold tracking-[0.14em] uppercase",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Standard section heading. Every marketing band uses the same scale so the
 * page reads as one document instead of ten unrelated blocks.
 */
export function SectionHeading({
  eyebrow,
  eyebrowTone,
  title,
  lead,
  align = "center",
  tone = "light",
  titleId,
  className,
}: {
  eyebrow?: ReactNode;
  eyebrowTone?: "blue" | "gold" | "dark";
  title: ReactNode;
  lead?: ReactNode;
  align?: "center" | "left";
  tone?: Tone;
  titleId?: string;
  className?: string;
}) {
  const isDark = tone === "dark";
  return (
    <div
      className={cx(
        "space-y-4",
        align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl",
        className,
      )}
    >
      {eyebrow ? <Eyebrow tone={eyebrowTone ?? (isDark ? "dark" : "blue")}>{eyebrow}</Eyebrow> : null}
      <h2
        id={titleId}
        className={cx(
          "text-3xl font-black tracking-tight text-balance sm:text-4xl lg:text-[2.75rem]",
          isDark ? "text-white" : "text-advo-text",
        )}
      >
        {title}
      </h2>
      {lead ? (
        <p className={cx("text-base leading-relaxed sm:text-lg", isDark ? "text-white/70" : "text-advo-muted")}>
          {lead}
        </p>
      ) : null}
    </div>
  );
}

export const GOLD_GRADIENT = "bg-[linear-gradient(135deg,#fba102_0%,#f16304_100%)]";
export const GOLD_TEXT =
  "bg-[linear-gradient(135deg,#fba102_0%,#f16304_100%)] bg-clip-text text-transparent";

/* ── Buttons ───────────────────────────────────────────────────────────── */

type ButtonVariant = "primary" | "gold" | "outline" | "onDark";
type ButtonSize = "md" | "lg";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-field font-bold transition duration-200 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-advo-gold/70 disabled:pointer-events-none disabled:opacity-60";

const BUTTON_SIZES: Record<ButtonSize, string> = {
  md: "px-5 py-2.5 text-sm",
  lg: "px-7 py-3.5 text-base",
};

const BRAND_BUTTON = `${GOLD_GRADIENT} text-advo-charcoal shadow-[0_16px_36px_-14px_rgba(251,161,2,0.75)] hover:-translate-y-0.5 hover:brightness-105`;

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: BRAND_BUTTON,
  gold: BRAND_BUTTON,
  outline:
    "border border-advo-border bg-white text-advo-text hover:border-advo-gold/50 hover:bg-advo-gold-soft",
  onDark: "border border-white/15 bg-white/[0.06] text-white hover:border-white/30 hover:bg-white/10",
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cx(BUTTON_BASE, BUTTON_SIZES[size], BUTTON_VARIANTS[variant], className);
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  arrow = false,
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  arrow?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClasses({ variant, size, className })}>
      <span>{children}</span>
      {arrow ? <ArrowRight aria-hidden="true" className="size-4 shrink-0" /> : null}
    </Link>
  );
}

/* ── Surfaces ──────────────────────────────────────────────────────────── */

const CARD_TONES: Record<Tone, string> = {
  light: "border-advo-border bg-white shadow-advo-card",
  dark: "border-white/10 bg-white/[0.04]",
};

export function Card({
  children,
  tone = "light",
  interactive = false,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  interactive?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-card border",
        CARD_TONES[tone],
        interactive && "transition duration-300 hover:-translate-y-1",
        interactive && tone === "light" && "hover:border-advo-gold/40 hover:shadow-advo-lift",
        interactive && tone === "dark" && "hover:border-white/25 hover:bg-white/[0.07]",
        className,
      )}
    >
      {children}
    </div>
  );
}
