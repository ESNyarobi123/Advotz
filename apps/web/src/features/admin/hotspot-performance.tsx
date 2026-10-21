"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@heroui/react";
import { AdvoKpi, Notice, StatusChip } from "@advo/ui";
import { formatDateTime, formatTzs } from "@advo/api-client";
import { ArrowLeft, BarChart3, Download, ExternalLink, Link2, Store, Users, Zap } from "lucide-react";
import { PageHero, ResourceView } from "@/features/common/components";
import { ChartCard, CHART_COLORS, MixDonut, TrendChart } from "@/features/common/charts";
import { api, errorMessage } from "@/lib/api";
import { useResource } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

/** One money bucket: order count, total and per-order average, as decimal strings. */
type Money = { count: number; amountTzs: string; averageTzs: string };

type SiteSummary = {
  id: string;
  name: string;
  slug: string;
  state: string;
  location: string | null;
  owner: { resellerId: string; businessName: string; status: string; email: string | null };
};

type PerformanceReport = {
  hotspot: {
    id: string;
    name: string;
    city: string;
    region: string;
    category: string;
    imageUrl: string | null;
    active: boolean;
    portalSlug: string | null;
  };
  site: SiteSummary | null;
  window: { days: number; from: string; to: string };
  kpis: {
    today: Money;
    week: Money;
    month: Money;
    lifetime: Money;
    activeGrants: number;
    uniqueClients: number;
    firstSaleAt: string | null;
  };
  daily: { day: string; count: number; amountTzs: string }[];
  packages: { packageId: string | null; package: string; count: number; amountTzs: string }[];
  payments: { state: string; count: number; amountTzs: string }[];
  generatedAt: string;
};

const WINDOWS = [7, 30, 90] as const;

/** The guest portal lives in the portal app, not under this one. */
const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL ?? "http://localhost:3011";

/** Payment states keep stable colours so the same state reads the same every visit. */
const PAYMENT_COLORS: Record<string, string> = {
  PAID: CHART_COLORS.success,
  OVERPAID: CHART_COLORS.success,
  UNPAID: CHART_COLORS.neutral,
  PENDING: CHART_COLORS.warning,
  FAILED: CHART_COLORS.danger,
  NEEDS_REVIEW: CHART_COLORS.orange,
  EXPIRED: CHART_COLORS.muted,
  REFUNDED: CHART_COLORS.blueSoft,
};

function paymentColor(state: string) {
  return PAYMENT_COLORS[state] ?? CHART_COLORS.muted;
}

/** Mixed palette for package slices, in a fixed order so colours stay stable. */
const PACKAGE_COLORS = [
  CHART_COLORS.blue,
  CHART_COLORS.gold,
  CHART_COLORS.orange,
  CHART_COLORS.blueSoft,
  CHART_COLORS.muted,
];

export function AdminHotspotPerformanceScreen({ hotspotId }: { hotspotId: string }) {
  const { t } = useI18n();
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30);
  const resource = useResource<PerformanceReport>(`/admin/hotspots/${hotspotId}/performance?days=${days}`);

  const exportCsv = useMemo(
    () => async () => {
      const res = await api.raw(`/admin/hotspots/${hotspotId}/performance/export.csv?days=${days}`);
      const disposition = res.headers.get("content-disposition") ?? "";
      const match = /filename="?([^";]+)"?/.exec(disposition);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = match?.[1] ?? `hotspot-${hotspotId}-${days}d.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },
    [hotspotId, days],
  );

  return (
    <ResourceView resource={resource}>
      {(report) => <PerformanceBody days={days} onDays={setDays} onExport={exportCsv} report={report} />}
    </ResourceView>
  );
}

function PerformanceBody({
  report,
  days,
  onDays,
  onExport,
}: {
  report: PerformanceReport;
  days: number;
  onDays: (next: (typeof WINDOWS)[number]) => void;
  onExport: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const trend = useMemo(
    () => report.daily.map((row) => ({ day: row.day, amount: Number(row.amountTzs), count: row.count })),
    [report.daily],
  );
  const packageMix = useMemo(
    () =>
      [...report.packages]
        .sort((a, b) => Number(b.amountTzs) - Number(a.amountTzs))
        .map((row, index) => ({
          label: row.package,
          value: row.count,
          color: PACKAGE_COLORS[index % PACKAGE_COLORS.length],
        })),
    [report.packages],
  );
  const paymentMix = useMemo(
    () => report.payments.map((row) => ({ label: row.state, value: row.count, color: paymentColor(row.state) })),
    [report.payments],
  );
  const packageRevenue = useMemo(
    () => report.packages.reduce((sum, row) => sum + Number(row.amountTzs), 0),
    [report.packages],
  );
  const windowOrders = useMemo(
    () => report.payments.reduce((sum, row) => sum + row.count, 0),
    [report.payments],
  );

  async function download() {
    setExporting(true);
    setExportError(null);
    try {
      await onExport();
    } catch (err) {
      setExportError(errorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  const owner = report.site?.owner;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHero
        actions={
          <>
            <Link
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--advo-border)] bg-white px-3 py-2 text-xs font-bold text-advo-text transition-colors hover:border-advo-blue hover:text-advo-blue"
              href="/admin/hotspots"
            >
              <ArrowLeft className="size-3.5" />
              {t("admin.hotspotPerformance.back")}
            </Link>
            {report.site ? (
              <Button isDisabled={exporting} onPress={() => void download()} type="button" variant="primary">
                <Download className="size-3.5" />
                {exporting ? t("admin.hotspotPerformance.exporting") : t("admin.hotspotPerformance.export")}
              </Button>
            ) : null}
          </>
        }
        description={t("admin.hotspotPerformance.subtitle")}
        eyebrow={t("admin.hotspotPerformance.badge")}
        icon={<BarChart3 />}
        iconTone="accent"
        meta={
          <>
            <span className="rounded-full bg-advo-blue/10 px-2 py-0.5 text-[10px] font-bold text-advo-blue">
              {report.hotspot.category || t("admin.hotspotPerformance.badge")}
            </span>
            <span className="text-[11px] text-advo-muted">
              {[report.hotspot.city, report.hotspot.region].filter(Boolean).join(", ")}
            </span>
            {report.site ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-advo-muted">
                <Link2 className="h-3 w-3" />
                {report.site.name}
              </span>
            ) : null}
          </>
        }
        title={report.hotspot.name}
      />

      {exportError ? <Notice tone="danger">{exportError}</Notice> : null}

      {!report.site ? (
        <Card className="p-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-advo-blue/10 text-advo-blue">
            <Link2 className="h-6 w-6" />
          </span>
          <p className="mt-3 text-sm font-bold text-advo-text">{t("admin.hotspotPerformance.unlinked.title")}</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-advo-muted">
            {t("admin.hotspotPerformance.unlinked.body")}
          </p>
        </Card>
      ) : (
        <>
          {/* ── Window switcher ── */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-0.5 rounded-xl border border-[var(--advo-border)] bg-white p-0.5">
              {WINDOWS.map((option) => {
                const active = days === option;
                return (
                  <button
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      active ? "bg-advo-blue text-white shadow-xs" : "text-advo-muted hover:text-advo-text"
                    }`}
                    key={option}
                    onClick={() => onDays(option)}
                    type="button"
                  >
                    {t(`admin.hotspotPerformance.window.${option}`)}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-advo-muted">
              {`${t("admin.hotspotPerformance.window")}: ${report.window.from} → ${report.window.to}`}
            </p>
          </div>

          {/* ── Money at a glance ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AdvoKpi
              hint={t("admin.hotspotPerformance.kpi.todayHint", { count: report.kpis.today.count })}
              icon={<Zap />}
              iconTone="gold"
              label={t("admin.hotspotPerformance.kpi.today")}
              value={formatTzs(report.kpis.today.amountTzs)}
            />
            <AdvoKpi
              hint={t("admin.hotspotPerformance.kpi.weekHint", { count: report.kpis.week.count })}
              icon={<BarChart3 />}
              iconTone="accent"
              label={t("admin.hotspotPerformance.kpi.week")}
              value={formatTzs(report.kpis.week.amountTzs)}
            />
            <AdvoKpi
              hint={t("admin.hotspotPerformance.kpi.monthHint", { count: report.kpis.month.count })}
              icon={<Store />}
              iconTone="teal"
              label={t("admin.hotspotPerformance.kpi.month")}
              value={formatTzs(report.kpis.month.amountTzs)}
            />
            <AdvoKpi
              hint={t("admin.hotspotPerformance.kpi.lifetimeHint", {
                count: report.kpis.lifetime.count,
                since: report.kpis.firstSaleAt ? formatDateTime(report.kpis.firstSaleAt) : "—",
              })}
              icon={<Download />}
              iconTone="success"
              label={t("admin.hotspotPerformance.kpi.lifetime")}
              value={formatTzs(report.kpis.lifetime.amountTzs)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <AdvoKpi
              hint={t("admin.hotspotPerformance.kpi.averageHint", { count: report.kpis.month.count })}
              icon={<BarChart3 />}
              iconTone="violet"
              label={t("admin.hotspotPerformance.kpi.averageLabel")}
              value={formatTzs(report.kpis.month.averageTzs)}
            />
            <AdvoKpi
              hint={t("admin.hotspotPerformance.kpi.clientsHint")}
              icon={<Users />}
              iconTone="accent"
              label={t("admin.hotspotPerformance.kpi.clients")}
              value={report.kpis.uniqueClients.toLocaleString()}
            />
            <AdvoKpi
              hint={t("admin.hotspotPerformance.kpi.activeGrantsHint")}
              icon={<Zap />}
              iconTone="success"
              label={t("admin.hotspotPerformance.kpi.activeGrants")}
              value={report.kpis.activeGrants.toLocaleString()}
            />
          </div>

          {/* ── Trend ── */}
          <ChartCard
            description={t("admin.hotspotPerformance.trend.description", { days })}
            title={t("admin.hotspotPerformance.trend.title")}
          >
            <TrendChart amountLabel={t("admin.hotspotPerformance.trend.title")} data={trend} height={280} />
          </ChartCard>

          {/* ── Mixes ── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard
              description={t("admin.hotspotPerformance.packages.description")}
              title={t("admin.hotspotPerformance.packages.title")}
            >
              {packageMix.length === 0 ? (
                <p className="rounded-lg bg-advo-page p-6 text-center text-xs text-advo-muted">
                  {t("admin.hotspotPerformance.packages.empty")}
                </p>
              ) : (
                <MixDonut
                  centerLabel={t("admin.hotspotPerformance.packages.center")}
                  centerValue={formatTzs(packageRevenue)}
                  data={packageMix}
                  height={190}
                />
              )}
            </ChartCard>

            <ChartCard
              description={t("admin.hotspotPerformance.payments.description")}
              title={t("admin.hotspotPerformance.payments.title")}
            >
              {paymentMix.length === 0 ? (
                <p className="rounded-lg bg-advo-page p-6 text-center text-xs text-advo-muted">
                  {t("admin.hotspotPerformance.payments.empty")}
                </p>
              ) : (
                <MixDonut
                  centerLabel={t("admin.hotspotPerformance.payments.center")}
                  centerValue={String(windowOrders)}
                  data={paymentMix}
                  height={190}
                />
              )}
            </ChartCard>
          </div>

          {/* ── Who owns the numbers ── */}
          {owner ? (
            <Card className="p-5">
              <h2 className="text-sm font-bold text-advo-text">{t("admin.hotspotPerformance.owner.title")}</h2>
              <dl className="mt-3 grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-advo-muted">{t("admin.hotspotPerformance.owner.business")}</dt>
                  <dd className="mt-0.5 font-bold text-advo-text">{owner.businessName}</dd>
                </div>
                <div>
                  <dt className="text-advo-muted">{t("admin.hotspotPerformance.owner.email")}</dt>
                  <dd className="mt-0.5 font-bold text-advo-text">{owner.email ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-advo-muted">{t("admin.hotspotPerformance.owner.site")}</dt>
                  <dd className="mt-0.5 flex flex-wrap items-center gap-1.5 font-bold text-advo-text">
                    {report.site?.name}
                    <StatusChip tone={report.site?.state === "READY" ? "success" : "default"}>
                      {report.site?.state ?? "—"}
                    </StatusChip>
                  </dd>
                </div>
                <div>
                  <dt className="text-advo-muted">{t("admin.hotspotPerformance.owner.portal")}</dt>
                  <dd className="mt-0.5">
                    <Link
                      className="inline-flex items-center gap-1 font-bold text-advo-blue underline"
                      href={`${PORTAL_URL.replace(/\/$/, "")}/${encodeURIComponent(report.site?.slug ?? "")}`}
                      target="_blank"
                    >
                      {report.site?.slug}
                      <ExternalLink className="size-3" />
                    </Link>
                  </dd>
                </div>
              </dl>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
