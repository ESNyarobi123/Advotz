"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * The guest captive-portal design system.
 *
 * Every customer-facing portal surface is built from these pieces: the marketing
 * hero's phone mockup, the reseller "Portal appearance" preview and the real
 * guest portal in `apps/portal`. Keeping them here means the three can never
 * drift apart, and the `@theme` tokens in `globals.css` are the only place a
 * colour, radius or shadow is defined.
 *
 * The vocabulary follows the approved portal redesign: a deep navy ink on
 * near-white paper, a single vivid orange for every action, and a sponsored
 * creative that picks one of three reviewed looks (`cafe` / `tech` / `style`)
 * so a campaign is legible before an admin supplies an image.
 *
 * Components are presentational only. They never fetch, never decide plan
 * entitlements and never hide themselves for policy reasons — the caller passes
 * only what the effective configuration allows to be shown.
 *
 * Layout is driven by **container queries**, not the viewport (`@md:` / `@lg:`),
 * because the same components render full width in `apps/portal` and inside a
 * ~290px phone mockup on the marketing page. The ancestor that should define
 * the breakpoint must opt in with `@container`.
 */

/* ─────────────────────────────────────────────────────────────────────────
 * Icons — the portal's own line set
 *
 * Ported from the approved design so the customer surface keeps one consistent
 * 1.7px line weight. The dashboard keeps using lucide; the portal does not mix.
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * The portal's line set, declared `as const` so `PortalIconName` is the literal
 * union of icon names — a typo at a call site is a compile error, and known-key
 * access never widens to `undefined`.
 */
const ICON_PATHS = {
  wifi: { paths: ["M3 8a15 15 0 0 1 18 0", "M6 12a10 10 0 0 1 12 0", "M9 16a5 5 0 0 1 6 0"], dots: [[12, 20, 1]] },
  arrow: { paths: ["M4 12h15m-6-6 6 6-6 6"] },
  diag: { paths: ["M6 18 18 6", "M6 6h12v12"] },
  check: { paths: ["m5 12 4 4L19 6"] },
  close: { paths: ["m6 6 12 12", "M6 18 18 6"] },
  clock: { paths: ["M12 7v5l3 2"], dots: [[12, 12, 9]] },
  bolt: { paths: ["m13 2-8 12h6l-1 8 9-13h-7l1-7Z"] },
  sun: { paths: ["M12 2v2m0 16v2", "M2 12h2m16 0h2", "M5 5l1 1m12 12 1 1", "M5 19l1-1M18 6l1-1"], dots: [[12, 12, 4]] },
  calendar: {
    paths: ["M8 3v4m8-4v4", "M4 11h16", "M8 15h1m4 0h1"],
    dots: [[12, 13, 0]],
  },
  speed: { paths: ["M4 18a9 9 0 1 1 16 0", "M12 15l4-6", "M5 13h1m12 0h1", "M12 5v1"], dots: [[12, 15, 1]] },
  infinity: { paths: ["M12 12C8 6 3 6 3 12s5 6 9 0 9-6 9 0-5 6-9 0Z"] },
  phone: { paths: ["M10 5h4m-3 14h2"], dots: [[12, 12, 0]] },
  pin: { paths: ["M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"], dots: [[12, 10, 2]] },
  help: { paths: ["M4 13v-1a8 8 0 0 1 16 0v1", "M19 18v2h-5", "M2 14.5h4v7H2z", "M18 14.5h4v7h-4z"] },
  shield: { paths: ["m12 3 8 3v5c0 6-8 10-8 10S4 17 4 11V6l8-3Z", "m8 12 3 3 5-6"] },
  ticket: { paths: ["M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4V6Z", "M15 6v2m0 3v2m0 3v2"] },
  globe: { paths: ["M3 12h18", "M12 3a9 9 0 0 1 0 18 9 9 0 0 1 0-18Z"], dots: [[12, 12, 9]] },
  wallet: { paths: ["M20 7V5a2 2 0 0 0-2-2L5 6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h15V7H5", "M20 11h-5v6h5", "M16 14h1"] },
  briefcase: { paths: ["M8 7V4h8v3", "M3 13h18", "M10 12v3h4v-3", "M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"] },
  megaphone: { paths: ["M4 10h4l12-5v14L8 14H4v-4Z", "m8 14 2 7h4l-3-6", "M20 9l2-1m-2 7 2 1"] },
  spark: { paths: ["m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"] },
  chevron: { paths: ["m9 5 7 7-7 7"] },
  pause: { paths: ["M9 5v14m6-14v14"] },
  play: { paths: ["m8 5 11 7-11 7V5Z"] },
  grid: {
    paths: [
      "M3 4a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z",
      "M14 4a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1Z",
      "M3 15a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z",
      "M14 15a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1Z",
    ],
  },
  banner: { paths: ["M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z", "M3 10h18", "M7 14h5m-5 2h8"] },
  plus: { paths: ["M12 5v14M5 12h14"] },
  search: { paths: ["m15 15 6 6"], dots: [[10, 10, 6]] },
  trash: { paths: ["M3 6h18M8 6V3h8v3M5 6l1 15h12l1-15M10 10v7m4-7v7"] },
  up: { paths: ["M12 20V4m-6 6 6-6 6 6"] },
  down: { paths: ["M12 4v16m-6-6 6 6 6-6"] },
} as const;

export type PortalIconName = keyof typeof ICON_PATHS;

/** One stroke icon on the portal's 1.7px / 24px grid. */
export function PortalIcon({ name, className }: { name: PortalIconName; className?: string }) {
  const spec = ICON_PATHS[name];
  return (
    <svg
      aria-hidden="true"
      className={className ?? "size-5"}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.7}
      viewBox="0 0 24 24"
    >
      {spec.paths.map((d) => (
        <path d={d} key={d} />
      ))}
      {"dots" in spec && spec.dots
        ? spec.dots.map(([cx, cy, r]) => <circle cx={cx} cy={cy} fill="currentColor" key={`${cx}-${cy}`} r={r} stroke="none" />)
        : null}
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Sponsored creative artwork
 *
 * Code-native illustrations so a banner is never an empty box: they stay sharp
 * at any size and load before authentication, which is the only moment the
 * guest sees them.
 * ───────────────────────────────────────────────────────────────────────── */

export type AdTheme = "cafe" | "tech" | "style";

export const AD_THEMES: AdTheme[] = ["cafe", "tech", "style"];

const AD_THEME_CLASS: Record<AdTheme, string> = {
  cafe: "bg-ad-cafe-bg text-ad-cafe-ink",
  tech: "bg-ad-tech-bg text-ad-tech-ink",
  style: "bg-ad-style-bg text-ad-style-ink",
};

/** Background + ink classes for one sponsored creative theme. */
export function adThemeClass(theme: AdTheme): string {
  return AD_THEME_CLASS[theme];
}

/** The illustrated stand-in used when a campaign has no uploaded image. */
export function AdArtwork({ theme, className }: { theme: AdTheme; className?: string }) {
  const shared = { "aria-hidden": true as const, className, viewBox: "0 0 330 245" };

  if (theme === "tech") {
    return (
      <svg {...shared}>
        <ellipse cx="180" cy="223" fill="#d4cce9" rx="85" ry="9" />
        <circle cx="185" cy="126" fill="#ddd6ed" r="104" />
        <path d="M130 144V103a57 57 0 0 1 114 0v41" fill="none" stroke="#76628e" strokeWidth="23" />
        <path d="M130 135V103a57 57 0 0 1 114 0v32" fill="none" stroke="#443455" strokeWidth="12" />
        <path d="M147 73a48 48 0 0 1 80 0" fill="none" stroke="#ae9abd" strokeLinecap="round" strokeWidth="9" />
        <g transform="rotate(13 130 155)">
          <rect fill="#302941" height="85" rx="22" width="48" x="105" y="119" />
          <rect fill="#655473" height="69" rx="8" width="16" x="105" y="126" />
          <rect fill="#493852" height="64" rx="7" width="15" x="135" y="129" />
        </g>
        <g transform="rotate(-13 245 155)">
          <rect fill="#302941" height="85" rx="22" width="48" x="219" y="119" />
          <rect fill="#655473" height="69" rx="8" width="17" x="248" y="126" />
          <rect fill="#493852" height="64" rx="7" width="15" x="220" y="129" />
        </g>
        <path d="m76 79 7-14 7 14 14 7-14 7-7 14-7-14-14-7Z" fill="#faf8ff" />
        <circle cx="281" cy="192" fill="#f8f5ff" r="5" />
      </svg>
    );
  }

  if (theme === "style") {
    return (
      <svg {...shared}>
        <circle cx="190" cy="127" fill="#edcfc1" r="105" />
        <ellipse cx="180" cy="223" fill="#d9b6a4" rx="79" ry="9" />
        <g transform="rotate(-9 187 139)">
          <path d="M147 104V71a36 36 0 0 1 72 0v33" fill="none" stroke="#a36d51" strokeWidth="11" />
          <path d="m123 96 115-1 17 112q-68 21-147 2Z" fill="#a57551" />
          <path d="m128 100 105-1 15 105q-59 19-133 1Z" fill="#cfab86" />
          <path d="M155 110v21m57-21v21" stroke="#8c6046" strokeLinecap="round" strokeWidth="6" />
          <rect fill="#e9d6bc" height="28" rx="4" width="57" x="155" y="150" />
          <path d="m171 164 7-8 7 8-7 8-7-8m12 0 7-8 7 8-7 8-7-8" fill="none" stroke="#9e7861" />
        </g>
        <path d="m80 74 7-15 7 15 15 7-15 7-7 15-7-15-15-7Z" fill="#fff9ed" />
        <path d="m273 153 4-9 4 9 9 4-9 4-4 9-4-9-9-4Z" fill="#fff9ed" />
      </svg>
    );
  }

  return (
    <svg {...shared}>
      <circle cx="187" cy="126" fill="#dce4d3" r="105" />
      <path d="M284 229V90m-1 54c-27-10-36-30-29-49 22 5 29 26 29 49m1 26c25-13 32-32 23-49-20 11-24 29-23 49" fill="#82976f" stroke="#718960" strokeWidth="2" />
      <ellipse cx="169" cy="218" fill="#bdcaaa" rx="86" ry="12" />
      <ellipse cx="169" cy="210" fill="#f8f5e8" rx="81" ry="14" />
      <ellipse cx="169" cy="208" fill="#dedcca" rx="57" ry="8" />
      <path d="M226 122h10c45 0 35 66-5 67h-14" fill="none" stroke="#a2ad8c" strokeWidth="19" />
      <path d="M226 119h10c45 0 35 66-5 67h-14" fill="none" stroke="#f3f1e0" strokeWidth="12" />
      <path d="M110 116h121l-6 59q-4 35-53 35t-57-35Z" fill="#eff0dc" />
      <path d="M110 116h22l3 62q3 25 24 29-40-3-44-32Z" fill="#d5dcc3" />
      <ellipse cx="171" cy="116" fill="#f8f7e8" rx="61" ry="18" />
      <ellipse cx="171" cy="118" fill="#5b3f29" rx="50" ry="12" />
      <ellipse cx="171" cy="120" fill="#8d6340" rx="45" ry="9" />
      <path d="M154 118q17-12 33 0-7 8-16 7-8 0-17-7Z" fill="#ede1c7" />
      <path d="M156 91c-17-22 13-26 1-47m27 44c-17-22 12-26 1-47" fill="none" opacity=".85" stroke="#fafbf6" strokeLinecap="round" strokeWidth="6" />
      <path d="m81 55 4-10 4 10 10 4-10 4-4 10-4-10-10-4Z" fill="#f8f8ef" />
    </svg>
  );
}

/** Short illustrated headline used inside an artwork-only business card. */
export function adArtLabel(theme: AdTheme): string {
  return { cafe: "Take a little break.", tech: "Tune in. Zone out.", style: "A little more you." }[theme];
}

/* ─────────────────────────────────────────────────────────────────────────
 * Small shared pieces
 * ───────────────────────────────────────────────────────────────────────── */

export type PortalPillTone = "green" | "orange" | "neutral";

const PILL_TONE_CLASS: Record<PortalPillTone, string> = {
  green: "text-portal-green bg-portal-green-soft",
  orange: "text-portal-orange-deep bg-portal-orange-soft",
  neutral: "text-portal-muted bg-[#edf1f5]",
};

/** The portal's rounded status pill, optionally led by a colour dot. */
export function PortalPill({ children, tone = "neutral", dot, className }: { children: ReactNode; tone?: PortalPillTone; dot?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[11px] font-semibold ${PILL_TONE_CLASS[tone]} ${className ?? ""}`}>
      {dot ? <span className="size-1.5 shrink-0 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

/** Uppercase micro-heading that opens a portal section. */
export function PortalEyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={`text-[11px] font-bold uppercase tracking-[0.14em] ${className ?? ""}`}>{children}</p>;
}

export type SegmentedOption<T extends string> = { id: T; label: string };

/** Two-to-three option switch used for package filters and job types. */
export function PortalSegmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: Array<SegmentedOption<T>>;
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div aria-label={ariaLabel} className={`inline-flex shrink-0 items-center gap-0.5 rounded-[10px] border border-portal-line bg-[#eef1f5] p-[3px] ${className ?? ""}`} role="group">
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            aria-pressed={active}
            className={`min-h-8 whitespace-nowrap rounded-[7px] px-3 py-1.5 text-[11px] font-semibold transition ${
              active ? "bg-white text-portal-ink shadow-[0_1px_5px_rgba(33,57,83,0.08)]" : "text-portal-muted hover:text-portal-ink"
            }`}
            key={option.id}
            onClick={() => onChange(option.id)}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** "1 Choose · 2 Pay · 3 Connect" progress rail. */
export function PortalJourney({ steps, current = 0, className }: { steps: string[]; current?: number; className?: string }) {
  return (
    <div aria-label={steps.join(", ")} className={`flex shrink-0 items-center gap-2 ${className ?? ""}`}>
      {steps.map((step, index) => (
        <span className="flex items-center gap-2" key={step}>
          {index > 0 ? <i className="mb-4 h-px w-5 bg-[#dbe2e8]" /> : null}
          <span className={`flex flex-col items-center gap-1.5 text-[10px] ${index === current ? "text-portal-orange-deep" : "text-[#748497]"}`}>
            <span
              className={`grid size-6 place-items-center rounded-full border text-[10px] font-bold ${
                index === current ? "border-portal-orange bg-portal-orange text-white" : "border-[#d7dee5] bg-white"
              }`}
            >
              {index + 1}
            </span>
            {step}
          </span>
        </span>
      ))}
    </div>
  );
}

/** Payment-method wordmarks shown wherever money is mentioned. */
export function PortalMoneyMethods({ className, prefix, ariaLabel }: { className?: string; prefix?: string; ariaLabel: string }) {
  return (
    <div aria-label={ariaLabel} className={`flex items-center gap-4 ${className ?? ""}`}>
      {prefix ? <span className="text-[10px] text-portal-muted">{prefix}</span> : null}
      <span className="text-[10px] font-bold text-money-mpesa">M-PESA</span>
      <span className="text-[10px] font-bold text-money-airtel">airtel money</span>
      <span className="text-[10px] font-bold text-money-mixx">
        Mixx <i className="text-[8px] font-normal not-italic text-portal-muted">by Yas</i>
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Package cards
 *
 * `package_cards.allowed_styles` on a plan decides which of the five looks a
 * reseller may choose, and `package_cards.allowed_layouts` decides how they are
 * arranged. The two are deliberately separate axes: a look is how one card is
 * drawn, a layout is how many sit on a row. Every style renders the exact same
 * package data — a reseller never changes billing logic by changing either.
 * ───────────────────────────────────────────────────────────────────────── */

export const PORTAL_CARD_STYLES = ["classic", "compact", "soft", "outlined", "bold"] as const;
export type PortalCardStyle = (typeof PORTAL_CARD_STYLES)[number];

/* ─────────────────────────────────────────────────────────────────────────
 * Brand theming
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * The brand values a portal is painted with.
 *
 * Declared structurally rather than imported from `@advo/contracts` because this
 * package is presentational and must not take a dependency on the domain model:
 * anything with these fields themes a portal, including the reseller designer's
 * unsaved, half-typed draft.
 */
export type PortalBrandTheme = {
  primary: string;
  accent: string;
  /** Page colour behind the cards. */
  background?: string;
  /** Card / surface colour. */
  surface?: string;
  /** Body text colour. */
  text?: string;
  /** Corner radius in pixels, applied to cards and the primary control. */
  radius?: number;
  buttonStyle?: "solid" | "gradient" | "outline";
};

/**
 * Maps brand values onto the CSS variables every portal component reads.
 *
 * One function, called by the guest app, the reseller designer and any future
 * mockup, so the same input paints the same colours everywhere — which is the
 * entire point of a shared design system. The portal's own tokens are overridden
 * too, not just `--advo-blue`, because a reseller who sets a green brand and still
 * gets an orange featured ribbon has not really changed their colours.
 */
export function portalThemeStyle(theme?: PortalBrandTheme): CSSProperties {
  if (!theme) return {};
  // The two derived shades are computed from the accent rather than stored, so a
  // single accent choice keeps the soft wash and the deep ink in step with it.
  const mix = (weight: number, other: string) => `color-mix(in srgb, ${theme.accent} ${weight}%, ${other})`;
  return {
    ["--advo-blue" as string]: theme.primary,
    ["--advo-portal-ink" as string]: theme.primary,
    ["--advo-portal-orange" as string]: theme.accent,
    ["--advo-portal-orange-deep" as string]: mix(78, "#000"),
    ["--advo-portal-orange-soft" as string]: mix(12, "#fff"),
    ["--advo-brand-gradient" as string]:
      theme.buttonStyle === "gradient" ? `linear-gradient(135deg, ${theme.primary} 0%, ${theme.accent} 100%)` : theme.primary,
    ...(theme.background ? { ["--advo-portal-paper" as string]: theme.background, ["--advo-page" as string]: theme.background } : {}),
    ...(theme.surface ? { ["--advo-portal-card" as string]: theme.surface } : {}),
    ...(theme.text ? { ["--advo-text" as string]: theme.text } : {}),
    ...(theme.radius !== undefined
      ? {
          ["--advo-portal-radius" as string]: `${theme.radius}px`,
          ["--advo-portal-radius-card" as string]: `${theme.radius}px`,
        }
      : {}),
  } as CSSProperties;
}

/**
 * The page behind everything: an optional photo, washed with the page colour.
 *
 * The wash is not optional and not configurable. A reseller uploads a photograph
 * they like, not one they have checked against the portal's dark ink, so the wash
 * is what guarantees the headline stays readable — and a fixed wash is the only
 * version of that promise a reseller cannot weaken by accident. It is drawn from
 * the page colour rather than black so the photo tints the portal instead of
 * fighting it.
 *
 * It has to stay light enough that the photo is recognisably the one the reseller
 * uploaded. At the original 80–90% the image contributed 10–20% of each pixel,
 * which is below the threshold where most photographs read as anything but a
 * slightly dirty white — resellers were uploading a photo, seeing a flat page and
 * concluding the upload had failed. The text that sits directly on the wash (the
 * site name, section headings, the muted lines) is the constraint, and it is dark
 * ink on a mostly-paper wash at these weights.
 *
 * `scroll` rather than `fixed`: a fixed background is sized against the viewport
 * and pinned to it, so on iOS — where it is also unreliable — the image stops
 * tracking the portal column it is supposed to fill. `scroll` sizes the photo to
 * the element being painted, which is what `cover` above is written to mean.
 */
export function portalBackgroundStyle(imageUrl?: string | null): CSSProperties {
  if (!imageUrl) return {};
  const wash = (weight: number) => `color-mix(in srgb, var(--advo-portal-paper, #f8f9fb) ${weight}%, transparent)`;
  return {
    backgroundImage: `linear-gradient(180deg, ${wash(20)} 0%, ${wash(35)} 100%), url("${imageUrl}")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundAttachment: "scroll",
  };
}

/** How many cards sit on a row. `list` is the full-width single column. */
export const PORTAL_CARD_LAYOUTS = ["list", "grid-2", "grid-3", "featured", "compact", "carousel"] as const;
export type PortalCardLayout = (typeof PORTAL_CARD_LAYOUTS)[number];

export type PortalPackageView = {
  id: string;
  name: string;
  /** Human duration shown in the card's top row, e.g. "3 hours". */
  duration: string;
  /** Pre-formatted amount, without the currency symbol, e.g. "2,000". */
  price: string;
  currency?: string;
  /**
   * Speed text without the "up to" prefix, e.g. "5 Mbps". An empty string drops
   * the line, which is what a caller with no measured speed should pass — "Up to
   * —" is worse than no line at all.
   */
  speed: string;
  /**
   * The complete, already-translated allowance line, e.g. "2 GB data" or "Data
   * bila kikomo". It is complete rather than a bare number because the unit
   * belongs to the language, not to the card. An empty string drops the line.
   */
  data: string;
  /** Device allowance. `0` drops the line. */
  devices: number;
  icon?: PortalIconName;
  featured?: boolean;
  /** Ribbon text; only rendered on a featured card. */
  ribbon?: string;
};

/**
 * The wording a card puts around a package's numbers.
 *
 * This package cannot know the guest's language, so the scaffolding that is not
 * a number — "Up to", "1 device" — is passed in. Everything else on the card
 * already arrives translated in `PortalPackageView`.
 */
export type PortalPackageCardLabels = {
  /** Speed line; `{speed}` is replaced with the package's speed text. */
  upTo: string;
  /** Device line for exactly one device; `{count}` is replaced with the count. */
  deviceOne: string;
  /** Device line for two or more devices; `{count}` is replaced with the count. */
  deviceMany: string;
};

/**
 * Every colour a card style needs, named once.
 *
 * A style is a token set rather than a chain of ternaries inside the markup: the
 * `bold` card flips five separate classes to white-on-brand, and spelling that
 * out inline is how a new style silently keeps the old text colour and ships an
 * unreadable card.
 */
type CardStyleTokens = {
  shell: string;
  padding: string;
  text: string;
  muted: string;
  line: string;
  icon: string;
  cta: string;
};

/**
 * Card padding at the portal's real size.
 *
 * The portal is a phone column (`max-w-md`), so the design's own phone scale is
 * the base: 17/15/13px on a 14px radius, exactly the `max-width: 700px` rules in
 * the portal redesign. The roomier 22/20/16px desktop scale is deliberately not
 * the base — at that size a two-up card stood 273px tall inside a 390px screen,
 * which read as a card built for a different device.
 *
 * `@max-xs` (under 20rem) steps down once more to the design's `max-width: 420px`
 * rules. That is the width the marketing phone mockup and the reseller's own
 * card preview render at, so the smallest frames get the smallest card.
 */
const CARD_PADDING = "rounded-xl px-3 pt-3 pb-2.5 @max-xs:px-2.5 @max-xs:pt-2.5 @max-xs:pb-2";
const CARD_PADDING_COMPACT = "rounded-xl px-2.5 pt-2 pb-2 @max-xs:px-2 @max-xs:pt-1.5 @max-xs:pb-1.5";

const CARD_STYLE_TOKENS: Record<PortalCardStyle, CardStyleTokens> = {
  classic: {
    shell: "bg-white border-portal-line shadow-[0_2px_8px_rgba(15,23,42,0.04)]",
    padding: CARD_PADDING,
    text: "text-portal-ink",
    muted: "text-portal-muted",
    line: "border-portal-line",
    icon: "bg-[#f1f4f7] text-[#657a8e]",
    cta: "text-portal-ink",
  },
  compact: {
    shell: "bg-white border-portal-line shadow-[0_2px_8px_rgba(15,23,42,0.04)]",
    padding: CARD_PADDING_COMPACT,
    text: "text-portal-ink",
    muted: "text-portal-muted",
    line: "border-portal-line",
    icon: "bg-[#f1f4f7] text-[#657a8e]",
    cta: "text-portal-ink",
  },
  soft: {
    shell: "bg-portal-orange-soft/80 border-transparent shadow-[0_2px_8px_rgba(239,104,55,0.04)]",
    padding: CARD_PADDING,
    text: "text-portal-ink",
    muted: "text-portal-muted",
    line: "border-portal-line",
    icon: "bg-white text-portal-orange-deep",
    cta: "text-portal-orange-deep",
  },
  outlined: {
    shell: "bg-transparent border-portal-ink",
    padding: CARD_PADDING,
    text: "text-portal-ink",
    muted: "text-portal-muted",
    line: "border-portal-ink",
    icon: "bg-transparent text-portal-ink ring-1 ring-portal-ink",
    cta: "text-portal-ink",
  },
  // The filled look: the card takes the brand colour, so the reseller's own
  // palette decides it rather than a hard-coded navy.
  bold: {
    shell: "border-[var(--advo-blue)] bg-[var(--advo-blue)] shadow-[0_4px_14px_rgba(27,94,164,0.15)]",
    padding: CARD_PADDING,
    text: "text-white",
    muted: "text-white/75",
    line: "border-white/20",
    icon: "bg-white/20 text-white",
    cta: "text-white",
  },
};

/**
 * One WiFi package as a selectable card.
 *
 * `style` comes from the site's effective configuration; `locked` marks a card
 * the guest cannot buy yet without changing its layout.
 */
export function PortalPackageCard({
  package: pkg,
  style = "classic",
  layout = "grid-2",
  isFirst = false,
  labels,
  onSelect,
  selectLabel,
  selected,
}: {
  package: PortalPackageView;
  style?: PortalCardStyle;
  layout?: PortalCardLayout;
  isFirst?: boolean;
  /** The wording around the numbers; see `PortalPackageCardLabels`. */
  labels: PortalPackageCardLabels;
  onSelect?: (id: string) => void;
  selectLabel: string;
  selected?: boolean;
}) {
  const tokens = CARD_STYLE_TOKENS[style];
  const compact = style === "compact";
  const bold = style === "bold";
  const featuredFill = pkg.featured && !bold;

  const priceText = `${pkg.currency ?? "TSh"} ${pkg.price}`;
  const speedText = pkg.speed ? labels.upTo.replace("{speed}", pkg.speed) : "";
  const deviceText = pkg.devices
    ? (pkg.devices === 1 ? labels.deviceOne : labels.deviceMany).replace("{count}", String(pkg.devices))
    : "";
  const detailLines = [speedText, pkg.data, deviceText].filter(Boolean);

  // 1. COMPACT: Ultra-slim, space-saving row for high density
  if (layout === "compact") {
    return (
      <button
        aria-label={`${pkg.name}, ${pkg.duration}, ${priceText}${detailLines.length ? `, ${detailLines.join(", ")}` : ""}`}
        className={`group relative flex w-full items-center justify-between gap-2.5 text-left transition-all duration-200 hover:-translate-y-0.5 rounded-xl px-3 py-2 ${tokens.shell} ${tokens.text} ${
          selected ? "ring-2 ring-portal-orange shadow-md" : ""
        } ${
          featuredFill ? "border-[1.5px] border-portal-orange bg-[#fffcfa] shadow-[0_2px_10px_rgba(239,104,55,0.06)]" : "border"
        }`}
        onClick={() => onSelect?.(pkg.id)}
        type="button"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`grid place-items-center rounded-lg size-7 shrink-0 ${pkg.featured && !bold ? "bg-portal-orange-soft text-portal-orange-deep" : tokens.icon}`}>
            <PortalIcon className="size-3.5" name={pkg.icon ?? "clock"} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11.5px] font-bold truncate">{pkg.name}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[8.5px] font-semibold ${bold ? "bg-white/20 text-white" : "bg-black/5 text-portal-muted"}`}>
                {pkg.duration}
              </span>
            </div>
            <div className={`flex items-center gap-1.5 text-[9px] ${tokens.muted} truncate`}>
              {pkg.data ? <span className="font-semibold">{pkg.data}</span> : null}
              {speedText ? <span>• {speedText}</span> : null}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <span className={`text-[8px] font-medium block leading-none ${tokens.muted}`}>{pkg.currency ?? "TSh"}</span>
            <span className="text-xs font-black tracking-tight">{pkg.price}</span>
          </div>
          <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[9px] font-bold transition group-hover:opacity-90 ${bold ? "bg-white text-[var(--advo-blue)]" : "bg-portal-ink text-white shadow-sm"}`}>
            <span>{selectLabel}</span>
            <PortalIcon className="size-2.5 transition group-hover:translate-x-0.5" name="arrow" />
          </span>
        </div>
      </button>
    );
  }

  // 2. FEATURED HERO (when first package): Grand spotlight card
  if (layout === "featured" && isFirst) {
    return (
      <button
        aria-label={`${pkg.name}, ${pkg.duration}, ${priceText}${detailLines.length ? `, ${detailLines.join(", ")}` : ""}`}
        className={`group relative flex w-full flex-col text-left transition-all duration-200 hover:-translate-y-0.5 rounded-2xl p-4 sm:p-5 ${tokens.shell} ${tokens.text} ${
          selected ? "ring-2 ring-portal-orange shadow-lg" : ""
        } ${
          featuredFill || true
            ? "border-2 border-portal-orange bg-gradient-to-b from-[#fffbf8] to-[#ffffff] shadow-[0_6px_24px_rgba(239,104,55,0.12)]"
            : "border"
        }`}
        onClick={() => onSelect?.(pkg.id)}
        type="button"
      >
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-portal-orange px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white shadow-sm">
            <PortalIcon className="size-3" name="bolt" />
            {pkg.ribbon || "FEATURED CHOICE"}
          </span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${bold ? "bg-white/20 text-white" : "bg-black/5"}`}>
            {pkg.duration}
          </span>
        </div>

        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold tracking-tight">{pkg.name}</h3>
            <p className={`mt-0.5 text-[11px] ${tokens.muted}`}>
              {pkg.data || "High-speed internet access"}
            </p>
          </div>
          <div className="text-right shrink-0">
            <span className={`text-[9.5px] font-medium block ${tokens.muted}`}>{pkg.currency ?? "TSh"}</span>
            <span className="text-2xl font-black tracking-tight text-portal-ink">{pkg.price}</span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
          {pkg.speed ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-black/5 px-2 py-1 font-semibold text-portal-ink">
              <PortalIcon className="size-3" name="speed" />
              {speedText}
            </span>
          ) : null}
          {pkg.devices ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-black/5 px-2 py-1 font-semibold text-portal-ink">
              <PortalIcon className="size-3" name="phone" />
              {deviceText}
            </span>
          ) : null}
        </div>

        <div className={`mt-3.5 flex items-center justify-between rounded-xl px-3.5 py-2 font-bold text-xs shadow-sm transition group-hover:opacity-95 ${
          bold ? "bg-white text-[var(--advo-blue)]" : "bg-portal-ink text-white"
        }`}>
          <span>{selectLabel}</span>
          <PortalIcon className="size-3.5 transition group-hover:translate-x-1" name="arrow" />
        </div>
      </button>
    );
  }

  // 3. CAROUSEL: Swipeable horizontal card
  if (layout === "carousel") {
    return (
      <button
        aria-label={`${pkg.name}, ${pkg.duration}, ${priceText}${detailLines.length ? `, ${detailLines.join(", ")}` : ""}`}
        className={`group relative flex min-w-[210px] max-w-[230px] shrink-0 snap-center flex-col text-left transition-all duration-200 hover:-translate-y-0.5 ${tokens.shell} p-3.5 rounded-2xl ${
          selected ? "ring-2 ring-portal-orange shadow-md" : ""
        } ${
          featuredFill ? "border-[1.5px] border-portal-orange bg-[#fffcfa] shadow-[0_4px_16px_rgba(239,104,55,0.08)]" : "border"
        } ${tokens.text}`}
        onClick={() => onSelect?.(pkg.id)}
        type="button"
      >
        {pkg.featured && pkg.ribbon ? (
          <span className="absolute -top-2 right-3 rounded-md bg-portal-orange px-1.5 py-[2px] text-[7.5px] font-bold tracking-wide text-white uppercase shadow-sm">
            {pkg.ribbon}
          </span>
        ) : null}

        <span className="flex items-center justify-between mb-2">
          <span className={`grid place-items-center rounded-lg size-7 shrink-0 ${pkg.featured && !bold ? "bg-portal-orange-soft text-portal-orange-deep" : tokens.icon}`}>
            <PortalIcon className="size-4" name={pkg.icon ?? "clock"} />
          </span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${bold ? "bg-white/20 text-white" : "bg-black/5"}`}>{pkg.duration}</span>
        </span>

        <span className={`text-xs font-bold truncate ${tokens.muted}`}>{pkg.name}</span>
        <span className="flex items-baseline gap-1 whitespace-nowrap font-black tracking-tight my-1.5 text-[20px]">
          <small className={`text-[9.5px] font-normal tracking-normal ${tokens.muted}`}>{pkg.currency ?? "TSh"}</small>
          {pkg.price}
        </span>

        <span className={`flex flex-col text-[10px] ${tokens.muted} gap-0.5 mb-2`}>
          {pkg.data ? (
            <span className="flex items-center gap-1 font-semibold truncate">
              <PortalIcon className="size-3" name="infinity" />
              <span>{pkg.data}</span>
            </span>
          ) : null}
          {speedText ? (
            <span className="flex items-center gap-1 truncate">
              <PortalIcon className="size-3" name="speed" />
              <span>{speedText}</span>
            </span>
          ) : null}
        </span>

        <span className={`mt-auto flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[9.5px] font-bold shadow-sm transition group-hover:opacity-90 ${bold ? "bg-white text-[var(--advo-blue)]" : "bg-portal-ink text-white"}`}>
          <span>{selectLabel}</span>
          <PortalIcon className="size-3 transition group-hover:translate-x-0.5" name="arrow" />
        </span>
      </button>
    );
  }

  // 4. GRID-3: Compact 3-column card (optimized against text overflow)
  if (layout === "grid-3") {
    return (
      <button
        aria-label={`${pkg.name}, ${pkg.duration}, ${priceText}${detailLines.length ? `, ${detailLines.join(", ")}` : ""}`}
        className={`group relative flex min-w-0 flex-col text-left transition-all duration-200 hover:-translate-y-0.5 ${tokens.shell} p-2 sm:p-2.5 rounded-xl ${
          selected ? "ring-2 ring-portal-orange shadow-md" : ""
        } ${
          featuredFill ? "border-[1.5px] border-portal-orange bg-[#fffcfa] shadow-sm" : "border"
        } ${tokens.text}`}
        onClick={() => onSelect?.(pkg.id)}
        type="button"
      >
        {pkg.featured && pkg.ribbon ? (
          <span className="absolute -top-1.5 right-1 rounded bg-portal-orange px-1 py-[1px] text-[6.5px] font-bold tracking-wide text-white uppercase shadow-sm">
            {pkg.ribbon}
          </span>
        ) : null}

        <span className="flex items-center justify-between mb-1">
          <span className={`grid place-items-center rounded-md size-5 shrink-0 ${pkg.featured && !bold ? "bg-portal-orange-soft text-portal-orange-deep" : tokens.icon}`}>
            <PortalIcon className="size-3" name={pkg.icon ?? "clock"} />
          </span>
          <span className={`text-[8.5px] font-bold px-1 py-0.5 rounded-full ${bold ? "bg-white/20 text-white" : "bg-black/5"}`}>{pkg.duration}</span>
        </span>

        <span className={`text-[9.5px] font-bold truncate leading-tight ${tokens.muted}`}>{pkg.name}</span>
        <span className="flex items-baseline gap-0.5 whitespace-nowrap font-black tracking-tight my-1 text-[15px]">
          <small className={`text-[8.5px] font-normal tracking-normal ${tokens.muted}`}>{pkg.currency ?? "TSh"}</small>
          {pkg.price}
        </span>

        <span className={`flex flex-col text-[8.5px] ${tokens.muted} gap-0.5 truncate`}>
          {pkg.data ? (
            <span className="truncate font-semibold">{pkg.data}</span>
          ) : speedText ? (
            <span className="truncate">{speedText}</span>
          ) : null}
        </span>

        <span className={`mt-1.5 flex items-center justify-between border-t pt-1 text-[8.5px] font-bold ${tokens.line} ${tokens.cta}`}>
          <span className="truncate">{selectLabel}</span>
          <PortalIcon className="size-2.5 shrink-0 transition group-hover:translate-x-0.5" name="arrow" />
        </span>
      </button>
    );
  }

  // 5. LIST: Full-width horizontal row
  if (layout === "list") {
    return (
      <button
        aria-label={`${pkg.name}, ${pkg.duration}, ${priceText}${detailLines.length ? `, ${detailLines.join(", ")}` : ""}`}
        className={`group relative flex w-full items-center justify-between gap-3 text-left transition-all duration-200 hover:-translate-y-0.5 rounded-xl px-3.5 py-2.5 ${tokens.shell} ${tokens.text} ${
          selected ? "ring-2 ring-portal-orange shadow-md" : ""
        } ${
          featuredFill ? "border-[1.5px] border-portal-orange bg-[#fffcfa] shadow-[0_4px_16px_rgba(239,104,55,0.08)]" : "border"
        }`}
        onClick={() => onSelect?.(pkg.id)}
        type="button"
      >
        {pkg.featured && pkg.ribbon ? (
          <span className="absolute -top-2 right-3 rounded-md bg-portal-orange px-1.5 py-[2px] text-[7.5px] font-bold tracking-wide text-white uppercase shadow-sm">
            {pkg.ribbon}
          </span>
        ) : null}

        <div className="flex items-center gap-3 min-w-0">
          <span className={`grid place-items-center rounded-lg size-8 shrink-0 ${pkg.featured && !bold ? "bg-portal-orange-soft text-portal-orange-deep" : tokens.icon}`}>
            <PortalIcon className="size-4" name={pkg.icon ?? "clock"} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold truncate">{pkg.name}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold ${bold ? "bg-white/20 text-white" : "bg-black/5 text-portal-muted"}`}>
                {pkg.duration}
              </span>
            </div>
            <div className={`mt-0.5 flex items-center gap-2 text-[9.5px] ${tokens.muted} truncate`}>
              {pkg.data ? <span className="font-medium">{pkg.data}</span> : null}
              {speedText ? <span>• {speedText}</span> : null}
              {deviceText ? <span>• {deviceText}</span> : null}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 pl-1">
          <div className="text-right">
            <span className={`text-[9px] font-medium block leading-none ${tokens.muted}`}>{pkg.currency ?? "TSh"}</span>
            <span className="text-sm font-extrabold tracking-tight">{pkg.price}</span>
          </div>
          <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[9.5px] font-bold transition group-hover:opacity-90 ${bold ? "bg-white text-[var(--advo-blue)]" : "bg-portal-ink text-white shadow-sm"}`}>
            {selectLabel}
            <PortalIcon className="size-3 transition group-hover:translate-x-0.5" name="arrow" />
          </span>
        </div>
      </button>
    );
  }

  // 6. GRID-2 (Default): Balanced 2-column card
  return (
    <button
      aria-label={`${pkg.name}, ${pkg.duration}, ${priceText}${detailLines.length ? `, ${detailLines.join(", ")}` : ""}`}
      className={`group relative flex min-w-0 flex-col text-left transition-all duration-200 hover:-translate-y-0.5 ${tokens.shell} ${tokens.padding} ${
        selected ? "ring-2 ring-portal-orange shadow-md" : ""
      } ${
        featuredFill ? "border-[1.5px] border-portal-orange bg-[#fffcfa] shadow-[0_4px_16px_rgba(239,104,55,0.08)]" : "border"
      } ${tokens.text}`}
      onClick={() => onSelect?.(pkg.id)}
      type="button"
    >
      {pkg.featured && pkg.ribbon ? (
        <span className="absolute -top-2 right-2 rounded-md bg-portal-orange px-1.5 py-[2px] text-[7.5px] font-bold tracking-wide text-white uppercase shadow-sm">
          {pkg.ribbon}
        </span>
      ) : null}

      <span className="flex items-center justify-between mb-1.5">
        <span className={`grid place-items-center rounded-lg size-6 shrink-0 ${pkg.featured && !bold ? "bg-portal-orange-soft text-portal-orange-deep" : tokens.icon}`}>
          <PortalIcon className="size-3.5" name={pkg.icon ?? "clock"} />
        </span>
        <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded-full ${bold ? "bg-white/20 text-white" : "bg-black/5"}`}>{pkg.duration}</span>
      </span>

      <span className={`text-[10px] font-medium truncate ${tokens.muted}`}>{pkg.name}</span>
      <span className={`flex items-baseline gap-1 whitespace-nowrap font-extrabold tracking-tight ${compact ? "mb-1 mt-0.5 text-[18px]" : "mb-1.5 mt-0.5 text-[20px] @max-xs:text-[18px]"}`}>
        <small className={`text-[9.5px] font-normal tracking-normal ${tokens.muted}`}>{pkg.currency ?? "TSh"}</small>
        {pkg.price}
      </span>

      <span className={`flex flex-col text-[9.5px] @max-xs:text-[9px] ${tokens.muted} gap-0.5`}>
        {speedText ? (
          <span className="flex items-center gap-1">
            <PortalIcon className="size-3 shrink-0" name="speed" />
            <span className="truncate">{speedText}</span>
          </span>
        ) : null}
        {pkg.data ? (
          <span className="flex items-center gap-1 font-medium">
            <PortalIcon className="size-3 shrink-0" name="infinity" />
            <span className="truncate">{pkg.data}</span>
          </span>
        ) : null}
        {deviceText ? (
          <span className="flex items-center gap-1">
            <PortalIcon className="size-3 shrink-0" name="phone" />
            <span className="truncate">{deviceText}</span>
          </span>
        ) : null}
      </span>

      <span className={`mt-2 flex items-center justify-between border-t pt-1.5 text-[9.5px] font-bold @max-xs:text-[9px] ${tokens.line} ${tokens.cta}`}>
        <span>{selectLabel}</span>
        <PortalIcon className="size-3.5 transition group-hover:translate-x-0.5" name="arrow" />
      </span>
    </button>
  );
}

/** Column count and gap per layout; styled for high mobile responsiveness. */
const LAYOUT_TOKENS: Record<PortalCardLayout, string> = {
  list: "grid-cols-1 gap-2.5",
  "grid-2": "grid-cols-2 gap-[13px] @max-xs:gap-2",
  "grid-3": "grid-cols-3 gap-1.5 sm:gap-2",
  featured: "grid-cols-2 gap-[13px] @max-xs:gap-2 [&>*:first-child]:col-span-2",
  compact: "grid-cols-1 gap-1.5",
  carousel: "flex overflow-x-auto pb-3 pt-1 gap-3 snap-x snap-mandatory scrollbar-none -mx-2 px-2",
};

/**
 * The row the package cards live in.
 *
 * `layout` is plan-resolved on the server, so the guest sees the arrangement the
 * reseller's plan allows and nothing else.
 */
export function PortalPackageList({
  children,
  layout = "grid-2",
  className,
}: {
  children: ReactNode;
  layout?: PortalCardLayout;
  className?: string;
}) {
  if (layout === "carousel") {
    return (
      <div className="relative">
        <div className={`flex overflow-x-auto pb-3 pt-1 gap-3 snap-x snap-mandatory scrollbar-none -mx-2 px-2 ${className ?? ""}`}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className={`grid items-stretch ${LAYOUT_TOKENS[layout] ?? LAYOUT_TOKENS["grid-2"]} ${className ?? ""}`}>
      {children}
    </div>
  );
}

/** Back-compat alias: the two-up grid, kept for callers that predate layouts. */
export function PortalPackageGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <PortalPackageList className={className}>{children}</PortalPackageList>;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Sponsored banner
 * ───────────────────────────────────────────────────────────────────────── */

export type PortalBannerAd = {
  id: string;
  business: string;
  title: string;
  description: string;
  cta: string;
  theme: AdTheme;
  imageUrl?: string;
};

/**
 * Transport and slide labels for a carousel.
 *
 * These are props rather than literals because this package cannot know the
 * guest's language, and a sponsored slot that says "Sponsored" on a Swahili page
 * is the one word on the screen that proves the page was not really translated.
 */
export type PortalCarouselLabels = {
  /** Accessible name for a slide dot; `{n}` is replaced with the slide number. */
  slideAria: string;
  previous: string;
  next: string;
  play: string;
  pause: string;
};

/**
 * One slide of the sponsored banner carousel.
 *
 * The caller owns rotation, eligibility and the fact that a `REQUIRED`
 * placement must render when an eligible campaign exists, but must collapse
 * (not render empty) when none does. `sponsoredLabel` is the creator-credit
 * badge; it is passed in so the guest reads it in their own language.
 */
export function PortalBanner({ ad, onCta, sponsoredLabel }: { ad: PortalBannerAd; onCta?: (id: string) => void; sponsoredLabel: string }) {
  return (
    <article className={`relative isolate min-h-[163px] overflow-hidden rounded-portal @md:min-h-[222px] @md:rounded-[22px] ${adThemeClass(ad.theme)}`}>
      <div className="relative z-[2] flex h-full w-[77%] flex-col justify-center px-4 py-4 @md:w-[67%] @md:px-8 @md:py-6">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[9px] font-bold uppercase tracking-[0.08em] @md:text-[10px]">
          <span className="truncate">{ad.business}</span>
          <span className="rounded border border-current px-1.5 py-0.5 text-[8px] tracking-[0.06em] opacity-75">{sponsoredLabel}</span>
        </div>
        <h2 className="max-w-[260px] text-[22px] leading-[1.04] tracking-[-0.04em] @md:max-w-[610px] @md:text-[34px]">{ad.title}</h2>
        <p className="mt-1.5 max-w-[235px] text-[10px] opacity-80 @md:mt-2 @md:max-w-[480px] @md:text-xs">{ad.description}</p>
        {onCta ? (
          <button className="mt-2 inline-flex items-center gap-2 self-start text-[10px] font-bold @md:mt-3 @md:text-[11px]" onClick={() => onCta(ad.id)} type="button">
            {ad.cta}
            <PortalIcon className="size-3.5" name="arrow" />
          </button>
        ) : null}
      </div>
      {ad.imageUrl ? (
        <div className="absolute inset-y-0 right-0 z-[1] w-[45%] opacity-85 [mask-image:linear-gradient(to_right,transparent,#000_35%)]">
          {/* Callers pass a reviewed, resized asset; the portal never renders arbitrary markup. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" className="size-full object-cover" src={ad.imageUrl} />
        </div>
      ) : (
        <div className="pointer-events-none absolute right-[-19px] top-3 z-[1] h-full w-[43%] opacity-90">
          <AdArtwork className="size-full overflow-visible" theme={ad.theme} />
        </div>
      )}
    </article>
  );
}

/** Carousel footer: credit line, slide dots and transport controls. */
export function PortalBannerControls({
  credit,
  count,
  index,
  labels,
  paused,
  onSelect,
  onMove,
  onTogglePause,
}: {
  credit: string;
  count: number;
  index: number;
  labels: PortalCarouselLabels;
  paused?: boolean;
  onSelect: (index: number) => void;
  onMove: (delta: number) => void;
  onTogglePause?: () => void;
}) {
  return (
    <div className="mt-1.5 flex min-h-6 items-center justify-between px-1">
      <span className="flex items-center gap-1.5 text-[10px] text-[#6c796b]">
        <PortalIcon className="size-3" name="spark" />
        {credit}
      </span>
      <span className="flex items-center gap-0.5">
        <span className="mr-2 flex">
          {Array.from({ length: count }).map((_, i) => (
            <button
              aria-current={i === index}
              aria-label={labels.slideAria.replace("{n}", String(i + 1))}
              className="grid h-6 w-4 place-items-center"
              key={i}
              onClick={() => onSelect(i)}
              type="button"
            >
              <span className={`block h-1.5 rounded-full transition-all ${i === index ? "w-4 bg-portal-ink" : "w-1.5 bg-[#c1cbd2]"}`} />
            </button>
          ))}
        </span>
        {count > 1 ? (
          <>
            <button aria-label={labels.previous} className="grid size-6 place-items-center rounded text-portal-ink/70 hover:text-portal-ink" onClick={() => onMove(-1)} type="button">
              <PortalIcon className="size-3.5 rotate-180" name="chevron" />
            </button>
            <button aria-label={labels.next} className="grid size-6 place-items-center rounded text-portal-ink/70 hover:text-portal-ink" onClick={() => onMove(1)} type="button">
              <PortalIcon className="size-3.5" name="chevron" />
            </button>
            {onTogglePause ? (
              <button
                aria-label={paused ? labels.play : labels.pause}
                className="grid size-6 place-items-center rounded text-portal-ink/70 hover:text-portal-ink"
                onClick={onTogglePause}
                type="button"
              >
                <PortalIcon className="size-3.5" name={paused ? "play" : "pause"} />
              </button>
            ) : null}
          </>
        ) : null}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Reseller advert banners
 * ───────────────────────────────────────────────────────────────────────── */

/** One reseller-authored slide or platform campaign. */
export type PortalAdvertSlide = {
  title: string;
  copy?: string;
  color: string;
  imageUrl?: string;
  business?: string;
  phone?: string;
  url?: string;
  cta?: string;
};

export type PortalAdvertCarouselLabels = {
  badge: string;
  previous: string;
  next: string;
  play: string;
  pause: string;
  /** Slide counter, e.g. `"{current} / {total}"`. Kept as text so the caller owns the words. */
  position: string;
  tapToView?: string;
  share?: string;
  shareWhatsApp?: string;
  copyInfo?: string;
  copied?: string;
  call?: string;
  whatsapp?: string;
  close?: string;
  wifiNotice?: string;
};

/**
 * The Reseller's rotating banners and platform campaigns.
 *
 * Tapping any slide opens the full interactive promotional sheet with smart
 * sharing (Web Share API + WhatsApp), contact actions, and pre-auth guidance.
 */
export function PortalAdvertCarousel({
  adverts,
  intervalMs = 4500,
  labels,
  className,
}: {
  adverts: PortalAdvertSlide[];
  intervalMs?: number;
  labels: PortalAdvertCarouselLabels;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [selectedAdvert, setSelectedAdvert] = useState<PortalAdvertSlide | null>(null);
  const touchStart = useRef<number | null>(null);

  // Headlines are what makes a slide readable; a slide without one is dropped
  // rather than rendered as an empty colour block.
  const slides = adverts.filter((advert) => advert.title.trim().length > 0);
  const count = slides.length;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // The list can shrink between renders; keep the index inside it.
  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  const move = useCallback(
    (delta: number) => {
      setIndex((prev) => (count < 2 ? prev : (prev + delta + count) % count));
    },
    [count],
  );

  useEffect(() => {
    // Auto-rotation pauses for reduced motion, when manually paused, or when the modal is open.
    if (selectedAdvert || paused || reduced || count < 2) return;
    const id = setInterval(() => move(1), Math.max(2000, intervalMs));
    return () => clearInterval(id);
  }, [selectedAdvert, paused, reduced, count, intervalMs, move]);

  if (count === 0) return null;

  const active = Math.min(index, count - 1);
  const playing = !selectedAdvert && !paused && !reduced && count > 1;

  return (
    <>
      <div
        aria-label={labels.badge}
        aria-roledescription="carousel"
        className={`relative overflow-hidden rounded-[22px] shadow-inner ${className ?? ""}`}
        onTouchEnd={(event) => {
          if (touchStart.current === null) return;
          const end = event.changedTouches[0]?.clientX ?? touchStart.current;
          const difference = end - touchStart.current;
          touchStart.current = null;
          if (Math.abs(difference) > 40) {
            setPaused(false);
            move(difference < 0 ? 1 : -1);
          }
        }}
        onTouchStart={(event) => {
          touchStart.current = event.touches[0]?.clientX ?? null;
        }}
        style={{ height: 190, touchAction: "pan-y", background: "var(--advo-blue)" }}
      >
        <div className="flex h-full transition-transform duration-500 ease-out" style={{ transform: `translateX(-${active * 100}%)` }}>
          {slides.map((advert, i) => (
            <div
              aria-hidden={i !== active}
              className="group relative h-full min-w-0 flex-[0_0_100%] cursor-pointer select-none overflow-hidden px-5 pb-12 pt-7 text-white transition focus:outline-none"
              key={`${advert.title}-${i}`}
              onClick={() => setSelectedAdvert(advert)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedAdvert(advert);
                }
              }}
              role="button"
              style={{
                backgroundImage: advert.imageUrl
                  ? `linear-gradient(120deg, ${advert.color}dd, #061d48cc), url(${advert.imageUrl})`
                  : `linear-gradient(120deg, ${advert.color}, #061d48)`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
              tabIndex={0}
            >
              <span className="absolute -right-16 -top-16 h-44 w-44 rounded-full border-[25px] border-white/10" aria-hidden />

              <div className="relative flex h-full flex-col justify-between">
                <div>
                  {advert.business ? (
                    <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
                      <PortalIcon className="size-3 text-white" name="spark" />
                      {advert.business}
                    </span>
                  ) : null}
                  <strong className="block text-lg font-black leading-tight drop-shadow-sm">{advert.title}</strong>
                  {advert.copy ? <p className="mt-1 line-clamp-2 max-w-[85%] text-xs text-white/85">{advert.copy}</p> : null}
                </div>

                <div className="inline-flex items-center gap-1.5 self-start rounded-full bg-white/25 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm backdrop-blur-sm transition group-hover:bg-white/35">
                  <PortalIcon className="size-3 text-white" name="spark" />
                  <span>{labels.tapToView ?? "Bofya kupata ofa & maelezo"}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/35 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          {labels.badge}
        </span>

        <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-2 px-3 pb-2">
          <div className="flex items-center gap-1">
            <PortalCarouselButton
              label={labels.previous}
              onClick={() => {
                setPaused(false);
                move(-1);
              }}
            >
              ‹
            </PortalCarouselButton>
            <span className="min-w-8 text-center text-[11px] font-bold text-white/90">
              {labels.position.replace("{current}", String(active + 1)).replace("{total}", String(count))}
            </span>
            <PortalCarouselButton
              label={labels.next}
              onClick={() => {
                setPaused(false);
                move(1);
              }}
            >
              ›
            </PortalCarouselButton>
          </div>
          {count > 1 ? (
            <PortalCarouselButton label={playing ? labels.pause : labels.play} onClick={() => setPaused((prev) => !prev)}>
              {playing ? "❚❚" : "▶"}
            </PortalCarouselButton>
          ) : null}
        </div>
      </div>

      {selectedAdvert ? (
        <PortalAdvertModal
          advert={selectedAdvert}
          labels={labels}
          onClose={() => setSelectedAdvert(null)}
        />
      ) : null}
    </>
  );
}

function PortalAdvertModal({
  advert,
  labels,
  onClose,
}: {
  advert: PortalAdvertSlide;
  labels: PortalAdvertCarouselLabels;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const cleanPhone = advert.phone ? advert.phone.replace(/[^0-9+]/g, "") : null;
  const whatsappNumber = cleanPhone ? cleanPhone.replace(/^\+/, "").replace(/^0/, "255") : null;

  const shareText = [
    advert.business ? `[${advert.business}]` : "",
    advert.title,
    advert.copy ? advert.copy : "",
    cleanPhone ? `Mawasiliano: ${cleanPhone}` : "",
    advert.url ? `Kiungo: ${advert.url}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function handleNativeShare() {
    if (canNativeShare) {
      try {
        await navigator.share({
          title: advert.title,
          text: advert.copy ? `${advert.title} - ${advert.copy}` : advert.title,
          url: advert.url || undefined,
        });
      } catch {
        // User cancelled share
      }
    } else {
      handleWhatsAppShare();
    }
  }

  function handleWhatsAppShare() {
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
  }

  async function handleCopy() {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      // Fallback
    }
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] bg-white text-slate-900 shadow-2xl sm:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banner image or themed gradient header */}
        <div
          className="relative flex h-44 w-full shrink-0 flex-col justify-end p-5 text-white sm:h-48"
          style={{
            backgroundImage: advert.imageUrl
              ? `linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0.6) 100%), url(${advert.imageUrl})`
              : `linear-gradient(135deg, ${advert.color}, #07193b)`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          {/* Close button */}
          <button
            aria-label={labels.close ?? "Close"}
            className="absolute right-4 top-4 grid size-8 place-items-center rounded-full bg-black/40 text-white backdrop-blur-md transition hover:bg-black/60 active:scale-95"
            onClick={onClose}
            type="button"
          >
            <PortalIcon className="size-4" name="close" />
          </button>

          {/* Business badge */}
          {advert.business ? (
            <span className="mb-1.5 inline-flex items-center gap-1.5 self-start rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white backdrop-blur-md">
              <PortalIcon className="size-3 text-white" name="spark" />
              {advert.business}
            </span>
          ) : (
            <span className="mb-1.5 inline-flex items-center gap-1 self-start rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-md">
              {labels.badge}
            </span>
          )}

          <h3 className="text-xl font-black leading-tight text-white drop-shadow-sm sm:text-2xl">
            {advert.title}
          </h3>
        </div>

        {/* Content body */}
        <div className="space-y-4 overflow-y-auto p-5 sm:p-6">
          {advert.copy ? (
            <p className="whitespace-pre-line text-sm font-medium leading-relaxed text-slate-700 sm:text-base">
              {advert.copy}
            </p>
          ) : null}

          {/* Pre-auth WiFi explanation notice */}
          <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200/90 bg-amber-50/90 p-3.5 text-xs text-amber-950 shadow-sm">
            <span className="mt-0.5 shrink-0 text-sm">💡</span>
            <p className="leading-snug">
              {labels.wifiNotice ?? "Ukurasa wa wavuti na intaneti vitafunguka kikamilifu mara tu utakapounganishwa na WiFi."}
            </p>
          </div>

          {/* URL / Web link display if available */}
          {advert.url ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs">
              <div className="flex min-w-0 items-center gap-2">
                <PortalIcon className="size-4 shrink-0 text-slate-400" name="globe" />
                <span className="truncate font-semibold text-slate-700 select-all">{advert.url}</span>
              </div>
              <button
                className="shrink-0 text-xs font-bold text-portal-orange hover:underline"
                onClick={() => {
                  if (navigator.clipboard) {
                    void navigator.clipboard.writeText(advert.url!);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }
                }}
                type="button"
              >
                {copied ? (labels.copied ?? "Imenakiliwa!") : (labels.copyInfo ?? "Nakili")}
              </button>
            </div>
          ) : null}

          {/* Action buttons */}
          <div className="space-y-2 border-t border-slate-100 pt-3">
            {/* Phone/WhatsApp Contact row */}
            {cleanPhone ? (
              <div className="grid grid-cols-2 gap-2">
                <a
                  className="flex items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-xs font-bold text-slate-800 transition hover:bg-slate-200 active:scale-[0.98] sm:text-sm"
                  href={`tel:${cleanPhone}`}
                >
                  <PortalIcon className="size-4 text-slate-600" name="phone" />
                  <span>{labels.call ?? "Piga simu"}</span>
                </a>
                {whatsappNumber ? (
                  <a
                    className="flex items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#20ba59] active:scale-[0.98] sm:text-sm"
                    href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Habari, nimeona tangazo lenu la "${advert.title}" kwenye WiFi portal.`)}`}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <span>💬</span>
                    <span>{labels.whatsapp ?? "WhatsApp"}</span>
                  </a>
                ) : null}
              </div>
            ) : null}

            {/* Smart Share buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100 active:scale-[0.98] sm:text-sm"
                onClick={handleWhatsAppShare}
                type="button"
              >
                <span>📲</span>
                <span>{labels.shareWhatsApp ?? "Tuma WhatsApp"}</span>
              </button>

              {canNativeShare ? (
                <button
                  className="flex items-center justify-center gap-2 rounded-2xl bg-portal-blue px-4 py-3 text-xs font-bold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98] sm:text-sm"
                  onClick={handleNativeShare}
                  type="button"
                >
                  <PortalIcon className="size-4 text-white" name="arrow" />
                  <span>{labels.share ?? "Sambaza ofa"}</span>
                </button>
              ) : (
                <button
                  className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-xs font-bold transition active:scale-[0.98] sm:text-sm ${
                    copied
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-slate-200 bg-slate-100 text-slate-800 hover:bg-slate-200"
                  }`}
                  onClick={handleCopy}
                  type="button"
                >
                  <span>{copied ? "✓" : "📋"}</span>
                  <span>{copied ? (labels.copied ?? "Imenakiliwa!") : (labels.copyInfo ?? "Nakili maelezo")}</span>
                </button>
              )}
            </div>

            {canNativeShare ? (
              <button
                className={`flex w-full items-center justify-center gap-2 rounded-2xl border py-2.5 text-xs font-bold transition ${
                  copied
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
                onClick={handleCopy}
                type="button"
              >
                <span>{copied ? "✓" : "📋"}</span>
                <span>{copied ? (labels.copied ?? "Imenakiliwa!") : (labels.copyInfo ?? "Nakili maelezo yote")}</span>
              </button>
            ) : null}
          </div>

          {/* Dismiss button */}
          <button
            className="w-full rounded-2xl py-2 text-center text-xs font-bold text-slate-400 transition hover:text-slate-700"
            onClick={onClose}
            type="button"
          >
            {labels.close ?? "Funga"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PortalCarouselButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      aria-label={label}
      className="grid size-7 place-items-center rounded-full bg-black/30 text-sm font-bold text-white transition hover:bg-black/45"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Reseller identity + connected session
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * The reseller's own identity bar. Always shown, on every plan.
 *
 * `logoUrl` is the plan-resolved logo: when a plan has no logo upload, or the
 * reseller has none set, the platform's wifi mark is drawn instead. The logo is a
 * `<img>` rather than a background so a slow or failed load degrades to nothing
 * rather than leaving a hole — and `object-contain` keeps a wordmark legible
 * instead of cropping it.
 */
export function PortalResellerHeader({
  name,
  location,
  status,
  active,
  onSupport,
  supportLabel,
  logoUrl,
}: {
  name: string;
  location: string;
  status: string;
  active?: boolean;
  onSupport?: () => void;
  supportLabel: string;
  logoUrl?: string | null;
}) {
  return (
    <header className="border-b border-portal-line bg-white">
      <div className="flex min-h-[72px] items-center justify-between gap-4 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              className="size-10 shrink-0 rounded-xl bg-portal-paper object-contain p-1"
              decoding="async"
              height={40}
              src={logoUrl}
              width={40}
            />
          ) : (
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-portal-orange-soft text-portal-orange">
              <PortalIcon className="size-6" name="wifi" />
            </span>
          )}
          <span className="min-w-0">
            <strong className="block truncate text-[17px] font-bold tracking-[-0.045em]">{name}</strong>
            <small className="mt-px flex items-center gap-1 truncate text-[11px] text-portal-muted">
              <PortalIcon className="size-3" name="pin" />
              {location}
            </small>
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className={`hidden items-center gap-1.5 text-xs @md:flex ${active ? "text-portal-green" : "text-portal-muted"}`}>
            <span className="size-1.5 rounded-full bg-current" />
            {status}
          </span>
          {onSupport ? (
            <button className="flex items-center gap-1.5 text-[11px] font-semibold text-portal-muted hover:text-portal-orange-deep" onClick={onSupport} type="button">
              <PortalIcon className="size-4" name="help" />
              {supportLabel}
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export type PortalSessionView = {
  packageName: string;
  duration: string;
  speed: string;
  data: string;
  devices: number;
  /** Singular unit for the device count, supplied by the caller so it can be localised. */
  deviceUnit: string;
  resellerName: string;
  location: string;
  validUntil: string;
  paidLabel: string;
  remaining: string;
  method: "voucher" | "mobile-money";
  expired?: boolean;
};

/**
 * The navy session ticket: what the guest bought, until when, and what is left.
 *
 * It always renders the purchased service first — sponsored discovery sits
 * below it, never above, on every plan.
 */
export function PortalSessionTicket({
  session,
  passLabel,
  activePassLabel,
  voucherLabel,
  connectedLabel,
  endedLabel,
  validityLabel,
  upToLabel,
  dataLabel,
  accessLabel,
  validUntilLabel,
}: {
  session: PortalSessionView;
  passLabel: string;
  activePassLabel: string;
  voucherLabel: string;
  connectedLabel: string;
  endedLabel: string;
  validityLabel: string;
  upToLabel: string;
  dataLabel: string;
  accessLabel: string;
  validUntilLabel: string;
}) {
  const stats: Array<[string, string]> = [
    [session.duration, validityLabel],
    [session.speed, upToLabel],
    [session.data, dataLabel],
    [`${session.devices} ${session.deviceUnit}`, accessLabel],
  ];

  return (
    <div className="relative overflow-hidden rounded-portal border border-portal-ink-line bg-portal-ink-deep p-5 text-white shadow-[0_15px_30px_rgba(27,51,73,0.09)]">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-20 size-60 rounded-full border border-white/[0.06] shadow-[0_0_0_29px_rgba(255,255,255,0.012),0_0_0_59px_rgba(255,255,255,0.008)]"
      />
      <div className="relative flex items-center justify-between gap-4">
        <div className="min-w-0">
          <PortalEyebrow className="text-[9px] tracking-[0.12em] text-[#b6c9d9]">
            {session.method === "voucher" ? voucherLabel : activePassLabel}
          </PortalEyebrow>
          <h2 className="mt-1.5 truncate text-[26px] tracking-[-0.04em]">{session.packageName}</h2>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#315947] px-2.5 py-1.5 text-[9px] font-semibold text-[#bcf2d8]">
          <span className="size-1.5 rounded-full bg-current" />
          {session.expired ? endedLabel : connectedLabel}
        </span>
      </div>
      <p className="relative mt-1.5 text-[11px] text-[#b6c9d9]">
        {session.resellerName} · {session.location}
      </p>
      <div className="relative mt-4 grid grid-cols-4 gap-2.5 border-y border-white/10 py-4">
        {stats.map(([value, label]) => (
          <div key={label}>
            <strong className="mb-1 block text-[13px] font-semibold tracking-[-0.02em]">{value}</strong>
            <small className="text-[10px] text-[#b6c9d9]">{label}</small>
          </div>
        ))}
      </div>
      <div className="relative mt-4 flex items-center justify-between gap-3.5">
        <div>
          <small className="block text-[10px] text-[#b6c9d9]">{validUntilLabel}</small>
          <strong className="mt-0.5 block text-[11px] font-medium">{session.validUntil}</strong>
        </div>
        <div className="text-right">
          <small className="block text-[10px] text-[#b6c9d9]">{session.paidLabel}</small>
          <strong className="mt-0.5 block text-[11px] font-medium text-[#aee4c8]">{session.remaining}</strong>
        </div>
      </div>
      <span className="sr-only">{passLabel}</span>
    </div>
  );
}

/** The green "payment complete" confirmation that opens the connected page. */
export function PortalSuccessMark() {
  return (
    <span className="relative grid size-14 place-items-center rounded-[18px] bg-portal-green-soft text-portal-green">
      <span aria-hidden="true" className="absolute inset-1.5 rounded-[13px] border border-[#95c4b1]/50" />
      <PortalIcon className="size-6" name="check" />
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Explore (sponsored discovery)
 * ───────────────────────────────────────────────────────────────────────── */

export type PortalBusinessView = {
  id: string;
  name: string;
  category: string;
  description: string;
  location: string;
  theme: AdTheme;
  imageUrl?: string;
};

/** One sponsored business card. Rendered only when Explore is visible. */
export function PortalBusinessCard({
  business,
  offerLabel,
  sponsoredLabel,
  onOffer,
  className,
}: {
  business: PortalBusinessView;
  offerLabel: string;
  /** The creator-credit badge; passed in so it reads in the guest's language. */
  sponsoredLabel: string;
  onOffer?: (id: string) => void;
  className?: string;
}) {
  return (
    <article className={`min-w-0 overflow-hidden rounded-portal-card border border-portal-line bg-white transition duration-200 hover:-translate-y-0.5 ${className ?? ""}`}>
      <div className={`relative h-[130px] overflow-hidden @md:h-[155px] ${adThemeClass(business.theme)}`}>
        {business.imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" className="size-full object-cover" src={business.imageUrl} />
          </>
        ) : (
          <>
            <span className="absolute left-4 top-5 z-[1] max-w-[50%] font-serif text-[24px] leading-[1.04] tracking-[-0.03em]">{adArtLabel(business.theme)}</span>
            <span className="absolute -right-4 top-0 z-0 h-full w-[78%]">
              <AdArtwork className="size-full overflow-visible" theme={business.theme} />
            </span>
          </>
        )}
        <span className="absolute bottom-3 left-3 z-[1] rounded border-0 bg-white/80 px-1.5 py-0.5 text-[8px] text-[#47504e]">{sponsoredLabel}</span>
      </div>
      <div className="p-4">
        <PortalEyebrow className="text-[8px] tracking-[0.11em] text-portal-orange-deep">{business.category}</PortalEyebrow>
        <h3 className="my-1.5 text-[17px]">{business.name}</h3>
        <p className="min-h-8 text-[11px] leading-[1.5] text-portal-muted">{business.description}</p>
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-portal-line pt-3">
          <span className="flex items-center gap-1 text-[10px] text-portal-muted">
            <PortalIcon className="size-3" name="pin" />
            {business.location}
          </span>
          <button className="flex items-center gap-1.5 text-[11px] font-semibold hover:text-portal-orange-deep" onClick={() => onOffer?.(business.id)} type="button">
            {offerLabel}
            <PortalIcon className="size-3.5" name="diag" />
          </button>
        </div>
      </div>
    </article>
  );
}

export type PortalShortcut = {
  id: string;
  title: string;
  subtitle: string;
  icon: PortalIconName;
  href?: string;
};

/**
 * The three discovery shortcuts under the connected page.
 *
 * Each one is its own plan-controlled placement (`discovery.*`), so this takes
 * only the shortcuts the effective configuration allows — it never decides.
 */
export function PortalDiscoverLinks({ shortcuts, ariaLabel }: { shortcuts: PortalShortcut[]; ariaLabel: string }) {
  if (shortcuts.length === 0) return null;
  return (
    <nav aria-label={ariaLabel} className="grid overflow-hidden rounded-[14px] border border-portal-line bg-white @md:grid-cols-3">
      {shortcuts.map((shortcut) => {
        const inner = (
          <>
            <PortalIcon className="size-5 shrink-0 text-[#7b8a98]" name={shortcut.icon} />
            <span className="min-w-0">
              <strong className="block text-[11px] font-semibold">{shortcut.title}</strong>
              <small className="mt-0.5 block text-[10px] text-portal-muted">{shortcut.subtitle}</small>
            </span>
            <PortalIcon className="ml-auto size-3.5 shrink-0 text-portal-muted" name="diag" />
          </>
        );
        const className = "flex min-w-0 items-center gap-3 border-b border-portal-line px-4 py-3 text-left last:border-b-0 @md:border-b-0 @md:border-e @md:px-5 @md:last:border-e-0";
        return shortcut.href ? (
          <a className={className} href={shortcut.href} key={shortcut.id} rel="noopener noreferrer" target="_blank">
            {inner}
          </a>
        ) : (
          <button className={className} key={shortcut.id} type="button">
            {inner}
          </button>
        );
      })}
    </nav>
  );
}

/** Service assurance strip under the package grid. */
export function PortalServiceStrip({ items, className }: { items: Array<{ icon: PortalIconName; label: string }>; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3.5 rounded-xl bg-[#eff3f6] px-4 py-3.5 text-[11px] text-portal-muted ${className ?? ""}`}>
      {items.map((item) => (
        <span className="flex items-center gap-1.5" key={item.label}>
          <PortalIcon className="size-3.5 text-[#688277]" name={item.icon} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/** "WiFi by <reseller> · Powered by AdvoWiFi" plus the legal links. */
export function PortalFooter({ resellerName, poweredLabel, links, showPlatformBadge = true }: { resellerName: string; poweredLabel: string; links: Array<{ id: string; label: string; onClick?: () => void }>; showPlatformBadge?: boolean }) {
  return (
    <footer className="border-t border-portal-line px-4 pb-6 pt-5">
      <div className="flex flex-col items-center justify-between gap-3 text-center text-[11px] text-portal-muted @md:flex-row @md:text-start">
        <span>
          {resellerName}
          {showPlatformBadge ? (
            <>
              {" · "}
              {poweredLabel}{" "}
              <span className="font-extrabold tracking-[-0.02em] text-portal-ink">
                Advo<em className="not-italic text-portal-orange-deep">WiFi</em>
              </span>
            </>
          ) : null}
        </span>
        <span className="flex items-center gap-4">
          {links.map((link) => (
            <button className="text-[11px] text-portal-muted hover:text-portal-ink" key={link.id} onClick={link.onClick} type="button">
              {link.label}
            </button>
          ))}
        </span>
      </div>
    </footer>
  );
}

/** Shared inline style helper for callers that need the portal paper surface. */
export const portalPaperStyle: CSSProperties = { backgroundColor: "var(--advo-portal-paper)", color: "var(--advo-portal-ink)" };
