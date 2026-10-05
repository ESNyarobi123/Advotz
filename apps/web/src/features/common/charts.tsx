"use client";

import { Card } from "@heroui/react";
import { LOCALE_META } from "@advo/i18n";
import { useId, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Chart layer over `recharts`.
 *
 * HeroUI's own charts are a HeroUI _Pro_ component (a themed wrapper around
 * `recharts`). `recharts` itself is free, so this module applies the same idea
 * with the Advo palette and keeps one shared shape for every chart in the app.
 *
 * Recharts renders SVG, and SVG gradients need concrete colour values, so the
 * palette is repeated here rather than read from CSS variables. These values
 * mirror `@advo/ui/tokens.css` — keep the two in step.
 */
export const CHART_COLORS = {
  blue: "#1B5EA4",
  blueSoft: "#2176C2",
  gold: "#FBA102",
  orange: "#F16304",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#F43F5E",
  neutral: "#94A3B8",
  track: "#EBEFF5",
  border: "#DFE5EC",
  muted: "#526174",
  text: "#18212F",
} as const;

/** `1 250 000` → `1.3M`. Keeps axis labels short on narrow cards. */
export function formatCompactTzs(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(Math.round(value));
}

/** `2026-09-28` → `28 Sep` (or the Swahili abbreviation), from the catalog. */
function formatDay(day: string, months: string[]): string {
  const [, month, date] = day.split("-");
  const index = Number(month) - 1;
  return `${Number(date)} ${months[index] ?? month}`;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Shared card + tooltip
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Card wrapper for a chart: consistent title, description and header action
 * across every dashboard visual.
 */
export function ChartCard({
  title,
  description,
  action,
  legend,
  className = "",
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  legend?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={`flex flex-col gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-advo-text">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-advo-muted">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
      {legend ? <div>{legend}</div> : null}
    </Card>
  );
}

type TooltipEntry = { name?: string; value?: number | string; color?: string; payload?: Record<string, unknown> };
type TooltipProps = { active?: boolean; payload?: readonly TooltipEntry[]; label?: string | number };

/** Shared tooltip surface so every chart reads the same on hover. */
function ChartTooltip({
  active,
  payload,
  label,
  valueLabel,
  formatLabel = (value: string) => value,
}: TooltipProps & { valueLabel?: (v: number) => string; formatLabel?: (label: string) => string }) {
  if (!active || !payload || payload.length === 0) return null;
  const format = valueLabel ?? ((v: number) => String(v));
  return (
    <div className="rounded-lg border border-advo-border bg-white px-3 py-2 shadow-lg">
      {label !== undefined ? (
        <p className="mb-1 text-[11px] font-bold text-advo-text">{formatLabel(String(label))}</p>
      ) : null}
      {payload.map((entry, i) => (
        <p className="flex items-center gap-1.5 text-[11px] text-advo-muted" key={`${entry.name}-${i}`}>
          <span className="size-2 shrink-0 rounded-full" style={{ background: entry.color ?? CHART_COLORS.blue }} />
          <span>{entry.name}</span>
          <span className="font-bold text-advo-text">{format(Number(entry.value ?? 0))}</span>
        </p>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Trend — daily revenue over the window
 * ───────────────────────────────────────────────────────────────────────── */

export type TrendPoint = { day: string; amount: number; count: number };

/** Calendar month abbreviations, in catalog order (January first). */
const MONTH_KEYS = [
  "charts.month.1",
  "charts.month.2",
  "charts.month.3",
  "charts.month.4",
  "charts.month.5",
  "charts.month.6",
  "charts.month.7",
  "charts.month.8",
  "charts.month.9",
  "charts.month.10",
  "charts.month.11",
  "charts.month.12",
] as const;

/**
 * Daily paid-revenue area chart.
 *
 * Renders an explanatory empty state instead of a flat line when the window
 * has no sales at all, so a new reseller sees the reason rather than a
 * chart that looks broken.
 */
export function TrendChart({
  data,
  height = 240,
  amountLabel,
}: {
  data: TrendPoint[];
  height?: number;
  amountLabel?: string;
}) {
  const { t, locale } = useI18n();
  const gradientId = `advo-trend-${useId().replace(/:/g, "")}`;
  const hasSales = data.some((d) => d.amount > 0);
  // Month abbreviations come from the catalog so the axis follows the language.
  const months = MONTH_KEYS.map((key) => t(key));
  const formatTick = (day: string) => formatDay(day, months);

  if (!hasSales) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-1 rounded-lg bg-advo-page text-center"
        style={{ height }}
      >
        <p className="text-xs font-semibold text-advo-muted">{t("charts.trend.empty", { days: data.length })}</p>
        <p className="text-[11px] text-advo-muted">{t("charts.trend.emptyHint")}</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer height={height} width="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.blue} stopOpacity={0.28} />
            <stop offset="100%" stopColor={CHART_COLORS.blue} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={CHART_COLORS.border} strokeDasharray="3 3" vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="day"
          interval="preserveStartEnd"
          minTickGap={16}
          tick={{ fill: CHART_COLORS.muted, fontSize: 10 }}
          tickFormatter={formatTick}
          tickLine={false}
        />
        <YAxis
          axisLine={false}
          tick={{ fill: CHART_COLORS.muted, fontSize: 10 }}
          tickFormatter={(v: number) => formatCompactTzs(v)}
          tickLine={false}
          width={44}
        />
        <Tooltip
          content={(props) => (
            <ChartTooltip
              {...(props as TooltipProps)}
              formatLabel={formatTick}
              valueLabel={(v) =>
                t("charts.tooltip.amount", { amount: v.toLocaleString(LOCALE_META[locale].intlLocale) })
              }
            />
          )}
          cursor={{ stroke: CHART_COLORS.blue, strokeDasharray: "3 3", strokeOpacity: 0.4 }}
        />
        <Area
          dataKey="amount"
          fill={`url(#${gradientId})`}
          name={amountLabel ?? t("charts.trend.seriesAmount")}
          stroke={CHART_COLORS.blue}
          strokeWidth={2}
          type="monotone"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Dual trend — two stacked revenue streams over the window
 * ───────────────────────────────────────────────────────────────────────── */

export type DualTrendPoint = { day: string; primary: number; secondary: number };

/**
 * Stacked area chart for two revenue streams (for example guest sales against
 * platform subscriptions) so an admin can read the split and the total at once.
 * Falls back to the same explanatory empty state as `TrendChart`.
 */
export function DualAreaChart({
  data,
  primaryLabel,
  secondaryLabel,
  height = 260,
}: {
  data: DualTrendPoint[];
  primaryLabel: string;
  secondaryLabel: string;
  height?: number;
}) {
  const { t, locale } = useI18n();
  const primaryId = `advo-dual-a-${useId().replace(/:/g, "")}`;
  const secondaryId = `advo-dual-b-${useId().replace(/:/g, "")}`;
  const hasData = data.some((d) => d.primary > 0 || d.secondary > 0);
  const months = MONTH_KEYS.map((key) => t(key));
  const formatTick = (day: string) => formatDay(day, months);

  if (!hasData) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-1 rounded-lg bg-advo-page text-center"
        style={{ height }}
      >
        <p className="text-xs font-semibold text-advo-muted">{t("charts.trend.empty", { days: data.length })}</p>
        <p className="text-[11px] text-advo-muted">{t("charts.trend.emptyHint")}</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer height={height} width="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={primaryId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.blue} stopOpacity={0.34} />
            <stop offset="100%" stopColor={CHART_COLORS.blue} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id={secondaryId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.gold} stopOpacity={0.4} />
            <stop offset="100%" stopColor={CHART_COLORS.gold} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={CHART_COLORS.border} strokeDasharray="3 3" vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="day"
          interval="preserveStartEnd"
          minTickGap={16}
          tick={{ fill: CHART_COLORS.muted, fontSize: 10 }}
          tickFormatter={formatTick}
          tickLine={false}
        />
        <YAxis
          axisLine={false}
          tick={{ fill: CHART_COLORS.muted, fontSize: 10 }}
          tickFormatter={(v: number) => formatCompactTzs(v)}
          tickLine={false}
          width={44}
        />
        <Tooltip
          content={(props) => (
            <ChartTooltip
              {...(props as TooltipProps)}
              formatLabel={formatTick}
              valueLabel={(v) =>
                t("charts.tooltip.amount", { amount: v.toLocaleString(LOCALE_META[locale].intlLocale) })
              }
            />
          )}
          cursor={{ stroke: CHART_COLORS.blue, strokeDasharray: "3 3", strokeOpacity: 0.4 }}
        />
        <Area
          dataKey="primary"
          fill={`url(#${primaryId})`}
          name={primaryLabel}
          stackId="1"
          stroke={CHART_COLORS.blue}
          strokeWidth={2}
          type="monotone"
        />
        <Area
          dataKey="secondary"
          fill={`url(#${secondaryId})`}
          name={secondaryLabel}
          stackId="1"
          stroke={CHART_COLORS.gold}
          strokeWidth={2}
          type="monotone"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Mix — share of a total, as a donut
 * ───────────────────────────────────────────────────────────────────────── */

export type MixSlice = { label: string; value: number; color: string };

/**
 * Donut for a part-to-whole split (payment states, plan mix, …) with a legend
 * rendered outside the SVG so long labels stay readable and selectable.
 */
export function MixDonut({
  data,
  height = 200,
  centerLabel,
  centerValue,
  formatValue,
}: {
  data: MixSlice[];
  height?: number;
  centerLabel?: string;
  centerValue?: string;
  /** Optional secondary formatter, e.g. a currency amount next to the count. */
  formatValue?: (v: number) => string;
}) {
  const { t } = useI18n();
  const slices = data.filter((d) => d.value > 0);
  const total = slices.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg bg-advo-page text-xs text-advo-muted" style={{ height }}>
        {t("charts.mix.empty")}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative shrink-0" style={{ height, width: height }}>
        <ResponsiveContainer height={height} width="100%">
          <PieChart>
            <Tooltip
              content={(props) => (
                <ChartTooltip
                  {...(props as TooltipProps)}
                  valueLabel={(v) => (formatValue ? `${v} · ${formatValue(v)}` : String(v))}
                />
              )}
            />
            <Pie
              data={slices}
              dataKey="value"
              innerRadius="62%"
              nameKey="label"
              outerRadius="100%"
              paddingAngle={2}
              stroke="none"
            >
              {slices.map((slice) => (
                <Cell fill={slice.color} key={slice.label} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {centerValue ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-black text-advo-text">{centerValue}</span>
            {centerLabel ? <span className="text-[10px] uppercase tracking-wider text-advo-muted">{centerLabel}</span> : null}
          </div>
        ) : null}
      </div>

      <ul className="min-w-0 flex-1 space-y-2">
        {slices.map((slice) => (
          <li className="flex items-center justify-between gap-3 text-xs" key={slice.label}>
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: slice.color }} />
              <span className="truncate text-advo-text">{slice.label}</span>
            </span>
            <span className="shrink-0 tabular-nums text-advo-muted">
              <span className="font-bold text-advo-text">{slice.value}</span>
              {formatValue ? <span> · {formatValue(slice.value)}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
