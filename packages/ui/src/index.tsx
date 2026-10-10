"use client";

import { Alert, Card, Chip, EmptyState, Table } from "@heroui/react";
import { useId } from "react";
import type { ReactNode, SelectHTMLAttributes } from "react";

/**
 * `@advo/ui` is the Advo brand layer on top of HeroUI v3.
 *
 * HeroUI (@heroui/react + @heroui/styles) renders every control in the
 * product. This package keeps only the pieces HeroUI cannot know about:
 *
 *   1. the brand tokens in `tokens.css` (Inter, the 12px/16px radius scale,
 *      the Advo palette) that `.heroui` components read through CSS variables;
 *   2. the domain status vocabulary — the Advo API speaks in states such as
 *      `PAID`, `PENDING_ACTIVATION` or `QUARANTINED`, which map to a HeroUI
 *      `Chip` / `Alert` tone in exactly one place;
 *   3. three composed blocks (`Notice`, `AdvoKpi`, `AdvoTable`) built out of
 *      HeroUI primitives where HeroUI's own API would be noisier at the call
 *      site.
 *
 * Everything else (Button, Input, Textarea, Card, Chip, Alert, Skeleton,
 * Label, …) is imported from `@heroui/react` directly.
 */

/* ─────────────────────────────────────────────────────────────────────────
 * Domain status → HeroUI tone
 * ───────────────────────────────────────────────────────────────────────── */

export type StatusTone = "default" | "accent" | "success" | "warning" | "danger";

const STATE_TONES: Record<string, StatusTone> = {
  ACTIVE: "success", READY: "success", PAID: "success", COMPLETED: "success", PROVISIONED: "success",
  AUTHORIZED: "success", APPROVED: "success", AVAILABLE: "success", VERIFIED: "success", ACTIVATED: "success",
  FULFILLED: "success", PROCESSED: "success", UNUSED: "accent", TRIALING: "accent", PENDING: "warning",
  PENDING_ACTIVATION: "warning", SUBMITTED: "warning", REQUESTED: "warning", UNKNOWN: "warning",
  AWAITING_DEVICE: "warning", PROVISIONING: "warning", NEEDS_REVIEW: "danger", FAILED: "danger",
  QUARANTINED: "danger", SUSPENDED: "danger", REJECTED: "danger", REVOKED: "danger", EXPIRED: "default",
  PAST_DUE: "danger", MANUAL_REQUIRED: "danger", UNSUPPORTED: "danger", REVERSED: "default",
  PENDING_HOLD: "warning", RESERVED_FOR_WITHDRAWAL: "accent", ACTIVATION_FAILED: "danger", QUOTA_EXHAUSTED: "default",
  CANCELLED: "danger", REFUNDED: "danger", REVOKED_GRANT: "danger",
  UNPAID: "warning", OVERPAID: "warning", PROCESSING: "warning", ADOPTED: "success", ADOPTION_PENDING: "warning",
  RESERVED: "accent", AUTHORIZING: "warning", INVITED: "accent", ACCEPTED: "success", SUCCEEDED: "success", RUNNING: "warning",
  OPEN: "warning", RECEIVED: "accent", IGNORED: "default", DEAD: "danger",
};

/** Maps an Advo API status to the HeroUI tone used for chips and alerts. */
export function statusTone(state: string): StatusTone {
  return STATE_TONES[state] ?? "default";
}

/**
 * Status chip. HeroUI `Chip` with the Advo status vocabulary applied, so a
 * screen can render `<StatusChip>{order.paymentState}</StatusChip>` and get
 * the right tone without repeating the mapping.
 */
export function StatusChip({
  children,
  tone,
  size = "sm",
}: {
  children?: ReactNode;
  tone?: StatusTone;
  size?: "sm" | "md" | "lg";
}) {
  const resolved =
    tone ?? (typeof children === "string" ? statusTone(children) : "default");
  return (
    <Chip color={resolved} size={size} variant="soft">
      {typeof children === "string" ? children.replace(/_/g, " ") : children}
    </Chip>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Composed blocks
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Single-line status message. HeroUI's `Alert` is a three-level compound
 * (root → content → description) plus an indicator; repeating that anatomy at
 * every call site buries the message. This keeps the HeroUI component, its
 * tones and its tokens, behind a one-line API.
 */
export function Notice({
  children,
  tone = "accent",
}: {
  children: ReactNode;
  tone?: StatusTone;
}) {
  return (
    <Alert role={tone === "danger" ? "alert" : "status"} status={tone}>
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description>{children}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

/**
 * Dependency-free sparkline.
 *
 * Lives here rather than in the web app's recharts chart layer so any dashboard
 * can show a trend in a KPI tile without pulling a charting library into the
 * shared package.
 */
export function Sparkline({
  points,
  className = "",
  color = "var(--advo-blue)",
  height = 32,
}: {
  points: number[];
  className?: string;
  color?: string;
  height?: number;
}) {
  const gradientId = `advo-spark-${useId().replace(/:/g, "")}`;
  if (points.length < 2) return null;

  const width = 100;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  // Inset by 2px top and bottom so the stroke is never clipped.
  const y = (value: number) => height - ((value - min) / span) * (height - 4) - 2;

  const line = points.map((value, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${y(value).toFixed(2)}`).join(" ");

  return (
    <svg
      aria-hidden="true"
      className={className}
      height={height}
      preserveAspectRatio="none"
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} />
    </svg>
  );
}

/**
 * Compact signed change indicator, e.g. `▲ 12%`.
 *
 * `inverse` flips the colour meaning for metrics where a rise is bad
 * (chargebacks, failed payments).
 */
export function DeltaBadge({
  value,
  label,
  inverse = false,
}: {
  /** Percentage change. `null` renders a neutral "no baseline" chip. */
  value: number | null;
  label?: string;
  inverse?: boolean;
}) {
  if (value === null || !Number.isFinite(value)) {
    return <span className="text-[11px] font-medium text-muted">{label ?? "Hakuna linganisho"}</span>;
  }
  const up = value >= 0;
  const good = inverse ? !up : up;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
        good ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
      }`}
    >
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      {Math.abs(value).toFixed(value % 1 === 0 ? 0 : 1)}%
      {label ? <span className="font-medium opacity-80">{label}</span> : null}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Soft icon tiles
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Pastel tints for an icon tile.
 *
 * The premium-light look leans on one soft colour per metric family so a row
 * of tiles reads as a set instead of a wall of blue. Each tone pairs a tinted
 * background with the matching strong colour for the glyph.
 */
export const ICON_TONES = {
  accent: "bg-advo-blue-soft text-advo-blue",
  gold: "bg-advo-gold-soft text-[#b15f00]",
  success: "bg-advo-success-soft text-[#166534]",
  warning: "bg-advo-warning-soft text-[#b45309]",
  danger: "bg-advo-danger-soft text-[#b91c1c]",
  violet: "bg-advo-violet-soft text-advo-violet",
  teal: "bg-advo-teal-soft text-advo-teal",
} as const;

export type IconTone = keyof typeof ICON_TONES;

/** A rounded, tinted square holding an icon — the recurring dashboard accent. */
export function SoftIcon({
  children,
  tone = "accent",
  size = "md",
}: {
  children: ReactNode;
  tone?: IconTone;
  size?: "sm" | "md" | "lg";
}) {
  const box = size === "lg" ? "size-11 rounded-2xl" : size === "sm" ? "size-7 rounded-lg" : "size-9 rounded-xl";
  const glyph = size === "lg" ? "[&_svg]:size-5" : size === "sm" ? "[&_svg]:size-3.5" : "[&_svg]:size-4";
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center ${box} ${glyph} ${ICON_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * KPI tile: HeroUI `Card` in the product's metric layout.
 *
 * The tile lifts on hover and carries an optional tinted icon so an overview
 * row feels alive without any motion the user did not ask for.
 */
export function AdvoKpi({
  label,
  value,
  hint,
  icon,
  iconTone = "accent",
  action,
  delta,
  spark,
  sparkColor = "var(--advo-blue)",
  className = "",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** Optional icon shown in a tinted tile at the top right. */
  icon?: ReactNode;
  /** Colour family for the icon tile. */
  iconTone?: IconTone;
  /** Optional control rendered next to the value (e.g. a link to the wallet). */
  action?: ReactNode;
  /** Optional change indicator rendered under the value. */
  delta?: ReactNode;
  /** Optional trend series rendered as a sparkline under the value. */
  spark?: number[];
  sparkColor?: string;
  className?: string;
}) {
  return (
    <Card
      className={`group relative gap-3 overflow-hidden p-4 shadow-advo-card ring-1 ring-advo-border/70 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-advo-lift ${className}`}
    >
      {/* A hairline of brand colour that only shows on hover keeps the tile calm at rest. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-gradient-to-r from-advo-blue to-advo-gold transition-transform duration-300 group-hover:scale-x-100"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">{label}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <p className="text-[26px] leading-tight font-black tracking-tight text-foreground tabular-nums">{value}</p>
            {action}
          </div>
        </div>
        {icon ? <SoftIcon tone={iconTone}>{icon}</SoftIcon> : null}
      </div>
      {spark && spark.length > 1 ? <Sparkline color={sparkColor} points={spark} /> : null}
      {delta || hint ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {delta}
          {hint ? <p className="text-xs leading-snug text-muted">{hint}</p> : null}
        </div>
      ) : null}
    </Card>
  );
}

/**
 * Native `<select>` styled with HeroUI's field tokens.
 *
 * HeroUI's own `Select` is a React Aria listbox: it renders no `<select>`
 * element and has no `name`, `required`, `multiple` or `<option>` children.
 * The admin and reseller forms are plain HTML forms that submit with
 * `FormData`, so swapping in the listbox would silently break submission.
 * This keeps the native control and borrows HeroUI's field look.
 */
export function AdvoSelect({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={[
        "w-full rounded-field bg-field px-3 py-2 text-sm text-field-foreground shadow-field outline-none",
        "transition-colors hover:bg-field-hover focus:bg-field-focus",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </select>
  );
}

export type AdvoColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  /** Marks the column that labels the row for assistive tech. */
  isRowHeader?: boolean;
};

/**
 * Data table built on HeroUI `Table` (React Aria). HeroUI's own table is a
 * compound collection API; this wrapper keeps the flat `rows`/`columns`
 * shape the feature screens already speak.
 *
 * React Aria throws unless exactly one column is flagged `isRowHeader`, so the
 * wrapper guarantees one: an explicit `isRowHeader` wins, otherwise the first
 * column labels the row. Call sites therefore never have to remember the flag.
 */
export function AdvoTable<T>({
  rows,
  columns,
  rowKey,
  label,
  empty = "Nothing here yet.",
}: {
  rows: T[];
  columns: AdvoColumn<T>[];
  rowKey: (row: T) => string;
  /** Accessible name for the table. */
  label: string;
  empty?: ReactNode;
}) {
  const hasRowHeader = columns.some((c) => c.isRowHeader);
  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content aria-label={label}>
          <Table.Header>
            {columns.map((c, i) => (
              <Table.Column key={c.key} isRowHeader={c.isRowHeader ?? (!hasRowHeader && i === 0)}>
                {c.header}
              </Table.Column>
            ))}
          </Table.Header>
          <Table.Body
            renderEmptyState={() => (
              <EmptyState className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                <span className="text-sm text-muted">{empty}</span>
              </EmptyState>
            )}
          >
            {rows.map((row) => (
              <Table.Row key={rowKey(row)}>
                {columns.map((c) => (
                  <Table.Cell key={c.key} className={c.className}>
                    {c.render(row)}
                  </Table.Cell>
                ))}
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

/* Guest captive-portal design system (see portal.tsx). */
export * from "./portal";
