"use client";

import { useMemo, useState, type ReactNode } from "react";
import { formatDateTime } from "@advo/api-client";
import { Button, Card, EmptyState, ToggleButton, ToggleButtonGroup } from "@heroui/react";
import { AdvoSelect, DeltaBadge } from "@advo/ui";
import { Activity, ArrowDownToLine, ArrowUpFromLine, Gauge, Info, MonitorSmartphone, RefreshCw, Users } from "lucide-react";
import { useSiteScope } from "@/features/resellers/site-scope";
import { useI18n } from "@/lib/i18n";
import { useResource } from "@/lib/hooks";
import { errorMessage } from "@/lib/api";

type UsageRange = "today" | "yesterday" | "week" | "month";
const RANGE_LABEL_KEYS = {
  today: "reseller.usage.range.today",
  yesterday: "reseller.usage.range.yesterday",
  week: "reseller.usage.range.week",
  month: "reseller.usage.range.month",
} as const;
type UsageSource = "CONTROLLER" | "ESTIMATED" | "MIXED" | "UNKNOWN";

type UsageDevice = {
  grantDeviceId: string;
  clientMac: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  siteId: string;
  siteName: string;
  bytesIn: string;
  bytesOut: string;
  bytes: string;
  controllerBytes: string;
  estimatedBytes: string;
  source: UsageSource;
  active: boolean;
  lastSeenAt: string | null;
};

type UsageResponse = {
  range: UsageRange;
  from: string;
  to: string;
  bucket: "hour" | "day";
  totals: {
    bytesIn: string;
    bytesOut: string;
    bytes: string;
    previousBytes: string;
    deltaPct: number | null;
    deviceCount: number;
    activeDeviceCount: number;
    averageBytes: string;
    controllerBytes: string;
    estimatedBytes: string;
    estimatedPercent: number;
    topDevice: { label: string; bytes: string } | null;
  };
  series: Array<{ key: string; bytes: number }>;
  devices: UsageDevice[];
  customers: Array<{ id: string; phone: string; name: string }>;
  coverage: { lastSampledAt: string | null; hasControllerData: boolean; hasEstimatedData: boolean };
};

/** `1 572 864 000` → `1.46 GB`; small values stay readable in MB/KB. */
function formatData(value: string | number): string {
  const bytes = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(gb >= 100 ? 0 : gb >= 10 ? 1 : 2)} GB`;
  const mb = bytes / 1024 ** 2;
  if (mb >= 1) return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function shortMac(mac: string) {
  const parts = mac.split(":");
  if (parts.length < 4) return mac;
  return `${parts.slice(0, 2).join(":")}…${parts.slice(-2).join(":")}`;
}

export function ResellerUsageCard() {
  const { t, locale } = useI18n();
  const { scoped } = useSiteScope();
  const [range, setRange] = useState<UsageRange>("today");
  const [customerId, setCustomerId] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const path = useMemo(() => {
    const params = new URLSearchParams({ range });
    if (customerId) params.set("customerId", customerId);
    return scoped(`/reseller/usage?${params.toString()}`);
  }, [range, customerId, scoped]);

  const usage = useResource<UsageResponse>(path);
  const data = usage.data;

  const intlLocale = locale === "sw" ? "sw-TZ" : "en-GB";

  function formatSeriesKey(key: string) {
    if (data?.bucket === "hour") {
      return new Intl.DateTimeFormat(intlLocale, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Africa/Dar_es_Salaam",
      }).format(new Date(key));
    }
    return new Intl.DateTimeFormat(intlLocale, {
      day: "numeric",
      month: "short",
      timeZone: "Africa/Dar_es_Salaam",
    }).format(new Date(`${key}T12:00:00+03:00`));
  }

  function handleRefresh() {
    setIsRefreshing(true);
    void usage.reload().finally(() => setTimeout(() => setIsRefreshing(false), 500));
  }

  const total = data ? Number(data.totals.bytes) : 0;
  const estimatedPercent = data ? data.totals.estimatedPercent : 0;
  // A fresh reseller can jump from almost nothing to many GB, which would
  // render as a 7000% chip. Keep the chip readable instead of absurd.
  const deltaPct = data?.totals.deltaPct ?? null;
  const deltaIsOffScale = deltaPct !== null && Math.abs(deltaPct) > 999;
  const sourceLine =
    data && data.coverage.hasControllerData && data.coverage.hasEstimatedData
      ? t("reseller.usage.source.mixed")
      : data?.coverage.hasEstimatedData
        ? t("reseller.usage.source.estimated")
        : t("reseller.usage.source.controller");
  const rangeLabel = t(RANGE_LABEL_KEYS[range]);

  return (
    <Card className="overflow-hidden p-0 shadow-advo-card ring-1 ring-advo-border/70">
      {/* ── Hero: total and the headline numbers ── */}
      <div className="relative isolate overflow-hidden bg-[linear-gradient(135deg,#123a63_0%,#0b2848_55%,#081d34_100%)] p-5 text-white">
        <span aria-hidden="true" className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-[#2176C2]/35 blur-3xl" />
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-28 left-10 size-56 rounded-full bg-[#FBA102]/20 blur-3xl" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15">
              <Gauge className="size-5 text-advo-gold" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-black tracking-tight">{t("reseller.usage.title")}</h2>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/30 bg-emerald-400/15 px-2 py-0.5 text-[9px] font-bold tracking-wider text-emerald-200 uppercase">
                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-300" />
                  {t("reseller.usage.badge")}
                </span>
              </div>
              <p className="mt-0.5 max-w-md text-xs leading-snug text-white/60">{t("reseller.usage.description")}</p>
              {data ? (
                <p className="mt-1 text-[10px] font-semibold text-white/45">
                  {t("reseller.usage.rangeLabel", {
                    from: formatDateTime(data.from),
                    to: formatDateTime(data.to),
                  })}
                </p>
              ) : null}
            </div>
          </div>

          <div className="shrink-0 sm:text-right">
            <p className="text-[10px] font-bold tracking-[0.18em] text-white/45 uppercase">{t("reseller.usage.total")}</p>
            <p className="mt-0.5 text-3xl leading-none font-black tracking-tight tabular-nums">
              {usage.loading && !data ? "—" : formatData(data?.totals.bytes ?? 0)}
            </p>
            <div className="mt-2 flex items-center gap-2 sm:justify-end">
              {deltaIsOffScale && deltaPct !== null ? (
                <span
                  className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                    deltaPct >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                  }`}
                  title={`${deltaPct.toFixed(1)}%`}
                >
                  <span aria-hidden="true">{deltaPct >= 0 ? "▲" : "▼"}</span>
                  999+%
                  <span className="font-medium opacity-80"> {t("reseller.usage.vsPrevious")}</span>
                </span>
              ) : (
                <DeltaBadge label={` ${t("reseller.usage.vsPrevious")}`} value={deltaPct} />
              )}
            </div>
          </div>
        </div>

        <div className="relative mt-4 grid grid-cols-3 gap-2">
          <UsageHeroStat
            hint={t("reseller.usage.devicesHint", { active: data?.totals.activeDeviceCount ?? 0 })}
            icon={<MonitorSmartphone className="size-3.5" />}
            label={t("reseller.usage.devices")}
            value={String(data?.totals.deviceCount ?? 0)}
          />
          <UsageHeroStat
            icon={<Activity className="size-3.5" />}
            label={t("reseller.usage.average")}
            value={formatData(data?.totals.averageBytes ?? 0)}
          />
          <UsageHeroStat
            hint={data?.totals.topDevice ? t("reseller.usage.topHint", { bytes: formatData(data.totals.topDevice.bytes) }) : undefined}
            icon={<Users className="size-3.5" />}
            label={t("reseller.usage.top")}
            value={data?.totals.topDevice?.label ?? "—"}
          />
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-col gap-3 border-b border-advo-border/70 bg-advo-page/60 p-4 lg:flex-row lg:items-center lg:justify-between">
        <ToggleButtonGroup
          isDetached
          onSelectionChange={(keys) => {
            const next = [...keys][0];
            if (typeof next === "string") setRange(next as UsageRange);
          }}
          selectedKeys={[range]}
          selectionMode="single"
          size="sm"
        >
          <ToggleButton id="today">{t("reseller.usage.range.today")}</ToggleButton>
          <ToggleButton id="yesterday">{t("reseller.usage.range.yesterday")}</ToggleButton>
          <ToggleButton id="week">{t("reseller.usage.range.week")}</ToggleButton>
          <ToggleButton id="month">{t("reseller.usage.range.month")}</ToggleButton>
        </ToggleButtonGroup>

        <div className="flex items-center gap-2">
          <label className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-[10px] font-bold tracking-wide text-advo-muted uppercase">
              {t("reseller.usage.customer.label")}
            </span>
            <AdvoSelect
              aria-label={t("reseller.usage.customer.label")}
              className="min-w-[180px] max-w-[240px]"
              onChange={(event) => setCustomerId(event.target.value)}
              value={customerId}
            >
              <option value="">
                {data && data.customers.length > 0
                  ? t("reseller.usage.customer.count", { count: data.customers.length })
                  : t("reseller.usage.customer.all")}
              </option>
              {data?.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name || customer.phone}
                </option>
              ))}
            </AdvoSelect>
          </label>
          <Button isIconOnly aria-label={t("common.refresh")} onPress={handleRefresh} size="sm" variant="outline">
            <RefreshCw className={isRefreshing ? "size-3.5 animate-spin text-advo-blue" : "size-3.5"} />
          </Button>
        </div>
      </div>

      {/* ── Body ── */}
      {usage.error ? (
        <div className="flex flex-col items-center gap-2 p-10 text-center">
          <p className="text-xs font-semibold text-rose-600">{t("reseller.usage.error", { error: errorMessage(usage.error) })}</p>
          <Button onPress={() => void usage.reload()} size="sm" variant="outline">
            {t("reseller.usage.retry")}
          </Button>
        </div>
      ) : !data ? (
        <UsageLoading />
      ) : data.devices.length === 0 ? (
        <EmptyState className="flex flex-col items-center justify-center gap-2 p-10 text-center">
          <span className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent">
            <Gauge className="size-5" />
          </span>
          <span className="text-sm font-bold text-advo-text">{t("reseller.usage.empty.title")}</span>
          <span className="max-w-sm text-xs text-advo-muted">{t("reseller.usage.empty.body")}</span>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-5 p-5 xl:grid-cols-12">
          {/* Device ranking */}
          <section className="min-w-0 xl:col-span-7">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-black tracking-tight text-advo-text">{t("reseller.usage.breakdown.title")}</h3>
                <p className="text-[11px] text-advo-muted">{t("reseller.usage.breakdown.subtitle")}</p>
              </div>
              <span className="shrink-0 rounded-full bg-advo-page px-2.5 py-1 text-[10px] font-bold text-advo-muted">
                {t("reseller.usage.devices")}: {data.totals.deviceCount}
              </span>
            </div>
            <ul className="space-y-2">
              {data.devices.slice(0, 8).map((device) => {
                const share = total > 0 ? (Number(device.bytes) / total) * 100 : 0;
                const label = device.customerName ?? device.customerPhone ?? t("reseller.usage.walkIn");
                const initial = (device.customerName ?? device.customerPhone ?? device.clientMac).slice(0, 1).toUpperCase();
                const estimated = device.source === "ESTIMATED";
                return (
                  <li
                    className="rounded-xl border border-advo-border/70 bg-white p-3 transition-colors hover:border-advo-blue/40"
                    key={device.grantDeviceId}
                  >
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-xs font-black text-accent">
                        {initial}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-xs font-bold text-advo-text" title={label}>
                            {label}
                          </p>
                          {device.active ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                              <span className="size-1 rounded-full bg-emerald-500" />
                              {t("reseller.usage.active")}
                            </span>
                          ) : null}
                          {device.source === "MIXED" ? (
                            <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                              {t("reseller.usage.source.mixedShort")}
                            </span>
                          ) : estimated ? (
                            <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                              {t("reseller.usage.source.estimatedShort")}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 truncate text-[10px] text-advo-muted">
                          {device.customerPhone ? `${device.customerPhone} · ` : ""}
                          {device.siteName} · {shortMac(device.clientMac)}
                          {device.lastSeenAt ? ` · ${t("reseller.usage.lastSeen", { time: formatDateTime(device.lastSeenAt) })}` : ""}
                        </p>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-advo-track">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-advo-blue to-advo-gold"
                            style={{ width: `${Math.max(share, 2)}%` }}
                          />
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-black tracking-tight text-advo-text tabular-nums">{formatData(device.bytes)}</p>
                        <p className="text-[10px] font-semibold text-advo-muted">
                          {t("reseller.usage.share", { percent: share.toFixed(share >= 10 ? 0 : 1) })}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            {data.devices.length > 8 ? (
              <p className="mt-2 text-[10px] font-semibold text-advo-muted">
                {t("reseller.usage.devices")}: {data.devices.length}
              </p>
            ) : null}
          </section>

          {/* Trend + source */}
          <aside className="min-w-0 space-y-4 xl:col-span-5">
            <div className="rounded-xl border border-advo-border/70 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-black tracking-tight text-advo-text">{t("reseller.usage.trend.title")}</h3>
                  <p className="text-[11px] text-advo-muted">
                    {data.bucket === "hour" ? t("reseller.usage.trend.samples") : t("reseller.usage.trend.days")}
                  </p>
                </div>
                <span className="rounded-full bg-advo-page px-2 py-1 text-[10px] font-bold text-advo-muted">{rangeLabel}</span>
              </div>
              <UsageBars formatKey={formatSeriesKey} points={data.series} />
            </div>

            <div className="rounded-xl border border-advo-border/70 bg-advo-page p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-black tracking-tight text-advo-text">{t("reseller.usage.source.title")}</h3>
                {estimatedPercent > 0 ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-800">
                    {t("reseller.usage.estimatedShare", { percent: estimatedPercent.toFixed(0) })}
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-800">
                    {t("reseller.usage.source.controllerShort")}
                  </span>
                )}
              </div>
              <ul className="mt-3 space-y-2 text-[11px] text-advo-muted">
                <li className="flex items-start gap-2">
                  <ArrowDownToLine className="mt-0.5 size-3.5 shrink-0 text-advo-blue" />
                  <span>
                    <span className="font-bold text-advo-text">{formatData(data.totals.bytesIn)}</span> ·{" "}
                    {t("reseller.usage.download")}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <ArrowUpFromLine className="mt-0.5 size-3.5 shrink-0 text-advo-gold" />
                  <span>
                    <span className="font-bold text-advo-text">{formatData(data.totals.bytesOut)}</span> ·{" "}
                    {t("reseller.usage.upload")}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Info className="mt-0.5 size-3.5 shrink-0 text-advo-muted" />
                  <span>{sourceLine}</span>
                </li>
              </ul>
              <p className="mt-3 flex items-start gap-1.5 border-t border-advo-border/70 pt-3 text-[10px] leading-snug text-advo-muted">
                <Info className="mt-0.5 size-3 shrink-0" />
                {t("reseller.usage.source.note")}
              </p>
              {data.coverage.lastSampledAt ? (
                <p className="mt-2 text-[10px] text-advo-muted">
                  {t("reseller.usage.lastSampled", { time: formatDateTime(data.coverage.lastSampledAt) })}
                </p>
              ) : null}
            </div>
          </aside>
        </div>
      )}
    </Card>
  );
}

function UsageHeroStat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 px-2.5 py-2 backdrop-blur-sm">
      <p className="flex items-center gap-1 text-[9px] font-bold tracking-wider text-white/45 uppercase">
        {icon}
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-0.5 truncate text-sm font-black text-white tabular-nums" title={value}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 truncate text-[9px] text-white/45">{hint}</p> : null}
    </div>
  );
}

function UsageBars({
  points,
  formatKey,
}: {
  points: Array<{ key: string; bytes: number }>;
  formatKey: (key: string) => string;
}) {
  const max = points.reduce((highest, point) => Math.max(highest, point.bytes), 0);
  if (max === 0) {
    return (
      <div className="mt-3 flex h-24 items-center justify-center rounded-lg bg-advo-page text-[11px] text-advo-muted">
        —
      </div>
    );
  }
  return (
    <div className="mt-3">
      <div className="flex h-24 items-end gap-1">
        {points.map((point, index) => {
          const height = point.bytes > 0 ? Math.max((point.bytes / max) * 100, 4) : 2;
          return (
            <div
              className="group relative min-w-0 flex-1 rounded-t bg-gradient-to-t from-advo-blue/70 to-advo-gold/90 transition-all hover:from-advo-blue hover:to-advo-gold"
              key={`${point.key}-${index}`}
              style={{ height: `${height}%` }}
              title={`${formatKey(point.key)} · ${formatData(point.bytes)}`}
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[9px] font-semibold text-advo-muted">
        <span className="truncate">{formatKey(points[0]?.key ?? "")}</span>
        <span className="truncate">{formatKey(points.at(-1)?.key ?? "")}</span>
      </div>
    </div>
  );
}

function UsageLoading() {
  return (
    <div className="grid grid-cols-1 gap-5 p-5 xl:grid-cols-12">
      <div className="space-y-2 xl:col-span-7">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="h-16 animate-pulse rounded-xl bg-advo-track/60" key={index} />
        ))}
      </div>
      <div className="space-y-4 xl:col-span-5">
        <div className="h-40 animate-pulse rounded-xl bg-advo-track/60" />
        <div className="h-32 animate-pulse rounded-xl bg-advo-track/60" />
      </div>
    </div>
  );
}
