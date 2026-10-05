"use client";

import { useMemo, useState } from "react";
import { formatDateTime } from "@advo/api-client";
import { Button, Card, Skeleton } from "@heroui/react";
import { AdvoKpi, AdvoSelect, AdvoTable, SoftIcon, StatusChip, type IconTone } from "@advo/ui";
import {
  Activity,
  Cable,
  ClipboardList,
  Globe,
  RefreshCw,
  Router,
  TriangleAlert,
  Wifi,
} from "lucide-react";
import { PageHero, ResourceView, SectionHeader } from "@/features/common/components";
import { ActionButton } from "@/features/common/actions";
import { api } from "@/lib/api";
import { useResource } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { MessageKey, TranslateVars } from "@advo/i18n";

type T = (key: MessageKey, vars?: TranslateVars) => string;

type SiteRow = {
  id: string;
  name: string;
  slug: string;
  state: string;
  location: string | null;
  createdAt: string;
  reseller: { businessName: string };
  mapping: { state: string; remoteSiteId: string | null; lastError: string | null } | null;
  _count: { devices: number };
};

type ClaimRow = {
  id: string;
  name: string | null;
  mac: string;
  model: string | null;
  hardwareVersion: string | null;
  serial: string | null;
  state: string;
  reviewReason: string | null;
  lastError: string | null;
  createdAt: string;
  site: { name: string };
  reseller: { businessName: string };
};

type OperationRow = {
  id: string;
  kind: string;
  targetType: string;
  state: string;
  attempts: number;
  lastErrorCode: string | null;
  lastError: string | null;
  nextRetryAt: string | null;
  updatedAt: string;
};

/** `GET /admin/network-summary` — the counts behind every tile on this page. */
type NetworkSummary = {
  sites: {
    total: number;
    byState: Record<string, number>;
    ready: number;
    provisioning: number;
    awaitingDevice: number;
    failed: number;
    needsReview: number;
  };
  mappings: {
    total: number;
    byState: Record<string, number>;
    provisioned: number;
    pending: number;
    failed: number;
    manualRequired: number;
    needsReview: number;
    failing: number;
    unmapped: number;
  };
  claims: {
    total: number;
    byState: Record<string, number>;
    submitted: number;
    approved: number;
    rejected: number;
    adoptionPending: number;
    adopted: number;
    failed: number;
  };
  devices: { total: number; adopted: number; unassigned: number };
  operations: {
    total: number;
    byState: Record<string, number>;
    pending: number;
    running: number;
    succeeded: number;
    failed: number;
    needsReview: number;
    unsupported: number;
    stuck: number;
  };
  attention: number;
  lastActivityAt: string | null;
};

/**
 * Colour family for a state, so a bar reads at a glance.
 *
 * "progress" is deliberately its own tone: a site still provisioning is not a
 * problem, and painting it amber would train operators to ignore amber.
 */
type StateTone = "good" | "progress" | "warn" | "bad" | "neutral";

const STATE_TONE: Record<string, StateTone> = {
  READY: "good",
  PROVISIONED: "good",
  APPROVED: "good",
  ADOPTED: "good",
  SUCCEEDED: "good",
  PROCESSING: "progress",
  PROVISIONING: "progress",
  PENDING: "progress",
  SUBMITTED: "progress",
  RUNNING: "progress",
  ADOPTION_PENDING: "progress",
  AWAITING_DEVICE: "progress",
  REQUESTED: "neutral",
  NEEDS_REVIEW: "warn",
  MANUAL_REQUIRED: "warn",
  UNKNOWN: "warn",
  UNSUPPORTED: "warn",
  FAILED: "bad",
  REJECTED: "bad",
};

const TONE_BAR: Record<StateTone, string> = {
  good: "bg-emerald-500",
  progress: "bg-advo-blue",
  warn: "bg-amber-500",
  bad: "bg-red-500",
  neutral: "bg-slate-400",
};

/**
 * The states each distribution card lists, in the order an operator reasons
 * about them: healthy first, then in-flight, then the ones needing a decision.
 */
const SITE_STATES = ["READY", "PROVISIONING", "AWAITING_DEVICE", "NEEDS_REVIEW", "FAILED"] as const;
const MAPPING_STATES = ["PROVISIONED", "PENDING", "PROVISIONING", "MANUAL_REQUIRED", "NEEDS_REVIEW", "FAILED"] as const;
const CLAIM_STATES = ["SUBMITTED", "APPROVED", "ADOPTION_PENDING", "ADOPTED", "REJECTED", "FAILED"] as const;
const OPERATION_STATES = ["PENDING", "RUNNING", "SUCCEEDED", "NEEDS_REVIEW", "UNSUPPORTED", "FAILED"] as const;

/** Values the operations table can be filtered by; mirrors the API's `?state=` query. */
const OPERATION_FILTERS = ["PENDING", "RUNNING", "SUCCEEDED", "NEEDS_REVIEW", "UNSUPPORTED", "FAILED"] as const;

const stateLabel = (state: string) => `admin.network.state.${state}` as MessageKey;

export function AdminNetworkScreen() {
  const { t } = useI18n();
  const [opState, setOpState] = useState<string>("");
  const [flash, setFlash] = useState<string | null>(null);

  const summary = useResource<NetworkSummary>("/admin/network-summary");
  const claims = useResource<ClaimRow[]>("/admin/device-claims?state=SUBMITTED");
  const sites = useResource<SiteRow[]>("/admin/sites");
  const ops = useResource<OperationRow[]>(`/admin/network-operations${opState ? `?state=${opState}` : ""}`);

  const stats = summary.data;

  const cards = useMemo(() => {
    if (!stats) return [];
    // Only buckets that actually hold something are shown; an empty state is noise,
    // and the card's total chip already tells the reader nothing is there.
    const build = (states: readonly string[], byState: Record<string, number>) =>
      states
        .map((state) => ({ state, count: byState[state] ?? 0 }))
        .filter((row) => row.count > 0)
        .map((row) => ({
          ...row,
          label: t(stateLabel(row.state)),
          tone: STATE_TONE[row.state] ?? "neutral",
        }));

    // A mapping row only exists once provisioning was attempted, so sites that were
    // never mapped are added as their own bucket. Without it the card would show
    // "1 provisioned" out of 1 and hide the three sites with no Controller.
    const mappingRows = build(MAPPING_STATES, stats.mappings.byState);
    if (stats.mappings.unmapped > 0) {
      mappingRows.push({
        state: "UNMAPPED",
        count: stats.mappings.unmapped,
        label: t(stateLabel("UNMAPPED")),
        tone: "warn",
      });
    }

    return [
      {
        key: "sites",
        title: t("admin.network.distribution.sites"),
        hint: t("admin.network.distribution.sitesHint"),
        icon: <Globe />,
        iconTone: "teal" as IconTone,
        total: stats.sites.total,
        rows: build(SITE_STATES, stats.sites.byState),
      },
      {
        key: "mappings",
        title: t("admin.network.distribution.mappings"),
        hint: t("admin.network.distribution.mappingsHint"),
        icon: <Cable />,
        iconTone: stats.mappings.failing > 0 || stats.mappings.unmapped > 0 ? ("warning" as IconTone) : ("accent" as IconTone),
        total: stats.sites.total,
        rows: mappingRows,
      },
      {
        key: "claims",
        title: t("admin.network.distribution.claims"),
        hint: t("admin.network.distribution.claimsHint"),
        icon: <ClipboardList />,
        iconTone: stats.claims.submitted > 0 ? ("warning" as IconTone) : ("violet" as IconTone),
        total: stats.claims.total,
        rows: build(CLAIM_STATES, stats.claims.byState),
      },
      {
        key: "operations",
        title: t("admin.network.distribution.operations"),
        hint: t("admin.network.distribution.operationsHint"),
        icon: <Activity />,
        iconTone: stats.operations.stuck > 0 ? ("danger" as IconTone) : ("gold" as IconTone),
        total: stats.operations.total,
        rows: build(OPERATION_STATES, stats.operations.byState),
      },
    ];
  }, [stats, t]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-4">
      <PageHero
        actions={
          <Button
            isDisabled={summary.loading}
            onPress={() => void summary.reload()}
            size="sm"
            type="button"
            variant="outline"
          >
            <RefreshCw className={`size-4 ${summary.loading ? "animate-spin" : ""}`} />
            {t("admin.network.action.refresh")}
          </Button>
        }
        description={t("admin.network.description")}
        eyebrow={t("admin.network.eyebrow")}
        icon={<Router />}
        iconTone="teal"
        meta={
          stats ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--advo-border)] bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-advo-muted tabular-nums">
                <Globe className="size-3" />
                {t("admin.network.hero.sites", { count: stats.sites.total })}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-advo-blue-soft px-2.5 py-1 text-[11px] font-bold text-advo-blue tabular-nums">
                <Wifi className="size-3" />
                {t("admin.network.hero.devices", { count: stats.devices.total })}
              </span>
              {stats.claims.submitted > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-advo-warning-soft px-2.5 py-1 text-[11px] font-bold text-[#b45309] tabular-nums">
                  <ClipboardList className="size-3" />
                  {t("admin.network.hero.claims", { count: stats.claims.submitted })}
                </span>
              ) : null}
              {stats.attention > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-advo-danger-soft px-2.5 py-1 text-[11px] font-bold text-[#b91c1c] tabular-nums">
                  <TriangleAlert className="size-3" />
                  {t("admin.network.hero.attention", { count: stats.attention })}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-advo-success-soft px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                  {t("admin.network.hero.clear")}
                </span>
              )}
            </>
          ) : null
        }
        title={t("admin.network.title")}
      />

      {flash ? (
        <div className="rounded-card border border-[var(--advo-border)] bg-advo-success-soft px-4 py-3 text-sm font-semibold text-emerald-800">
          <span className="flex flex-wrap items-center gap-2">
            {flash}
            <button className="font-bold underline" onClick={() => setFlash(null)} type="button">
              ✕
            </button>
          </span>
        </div>
      ) : null}

      {/* ── KPI row ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {stats ? (
          <>
            <AdvoKpi
              hint={
                stats.sites.total > 0
                  ? t("admin.network.kpi.sitesHint", {
                      ready: stats.sites.ready,
                      provisioning: stats.sites.provisioning,
                    })
                  : t("admin.network.kpi.sitesHintEmpty")
              }
              icon={<Globe />}
              iconTone="teal"
              label={t("admin.network.kpi.sites")}
              value={stats.sites.total}
            />
            <AdvoKpi
              hint={
                stats.claims.total > 0
                  ? t("admin.network.kpi.claimsHint", {
                      adopted: stats.claims.adopted,
                      rejected: stats.claims.rejected,
                    })
                  : t("admin.network.kpi.claimsHintEmpty")
              }
              icon={<ClipboardList />}
              iconTone={stats.claims.submitted > 0 ? "warning" : "violet"}
              label={t("admin.network.kpi.claims")}
              value={stats.claims.submitted}
            />
            <AdvoKpi
              hint={
                stats.sites.total === 0
                  ? t("admin.network.kpi.mappingsHintEmpty")
                  : stats.mappings.failing > 0
                    ? t("admin.network.kpi.mappingsFailing", { count: stats.mappings.failing })
                    : stats.mappings.unmapped > 0
                      ? t("admin.network.kpi.mappingsUnmapped", { count: stats.mappings.unmapped })
                      : t("admin.network.kpi.mappingsHint", {
                          provisioned: stats.mappings.provisioned,
                          total: stats.sites.total,
                        })
              }
              icon={<Cable />}
              iconTone={stats.mappings.failing > 0 || stats.mappings.unmapped > 0 ? "warning" : "accent"}
              label={t("admin.network.kpi.mappings")}
              value={`${stats.mappings.provisioned}/${stats.sites.total}`}
            />
            <AdvoKpi
              hint={
                stats.devices.total === 0
                  ? t("admin.network.kpi.devicesHintEmpty")
                  : stats.devices.unassigned > 0
                    ? t("admin.network.kpi.devicesUnassigned", { count: stats.devices.unassigned })
                    : t("admin.network.kpi.devicesHint", { adopted: stats.devices.adopted })
              }
              icon={<Wifi />}
              iconTone="accent"
              label={t("admin.network.kpi.devices")}
              value={stats.devices.total}
            />
            <AdvoKpi
              hint={
                stats.operations.total === 0
                  ? t("admin.network.kpi.operationsHintEmpty")
                  : stats.operations.stuck > 0
                    ? t("admin.network.kpi.operationsStuck", { count: stats.operations.stuck })
                    : t("admin.network.kpi.operationsHint", {
                        succeeded: stats.operations.succeeded,
                        running: stats.operations.running,
                      })
              }
              icon={<Activity />}
              iconTone={stats.operations.stuck > 0 ? "danger" : "gold"}
              label={t("admin.network.kpi.operations")}
              value={stats.operations.total}
            />
          </>
        ) : (
          Array.from({ length: 5 }, (_, i) => <KpiSkeleton key={i} />)
        )}
      </div>

      {/* ── Distribution box cards ── */}
      <section>
        <SectionHeader
          description={t("admin.network.distribution.description")}
          icon={<Cable />}
          iconTone="accent"
          title={t("admin.network.distribution.title")}
        />
        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats
            ? cards.map((card) => (
                <DistributionCard
                  empty={t("admin.network.distribution.empty")}
                  hint={card.hint}
                  icon={card.icon}
                  iconTone={card.iconTone}
                  key={card.key}
                  rows={card.rows}
                  title={card.title}
                  totalLabel={t("admin.network.distribution.total", { count: card.total })}
                />
              ))
            : Array.from({ length: 4 }, (_, i) => <CardSkeleton key={i} />)}
        </div>
      </section>

      {/* ── Device claims ── */}
      <section className="rounded-card border border-[var(--advo-border)] bg-white p-4 shadow-advo-card">
        <SectionHeader
          action={
            stats && stats.claims.submitted > 0 ? (
              <span className="rounded-full bg-advo-warning-soft px-2.5 py-1 text-[11px] font-bold text-[#b45309] tabular-nums">
                {stats.claims.submitted}
              </span>
            ) : null
          }
          description={t("admin.network.claims.description")}
          icon={<ClipboardList />}
          iconTone={stats && stats.claims.submitted > 0 ? "warning" : "violet"}
          title={t("admin.network.claims.title")}
        />
        <div className="mt-4">
          <ResourceView resource={claims}>
            {(rows) => (
              <AdvoTable
                columns={[
                  {
                    key: "r",
                    header: t("admin.network.claims.col.reseller"),
                    render: (c) => (
                      <>
                        {c.reseller.businessName}
                        <p className="text-xs text-[var(--advo-muted)]">{c.site.name}</p>
                      </>
                    ),
                  },
                  {
                    key: "d",
                    header: t("admin.network.claims.col.device"),
                    render: (c) => (
                      <>
                        <Mono>{c.mac}</Mono>
                        <p className="text-xs">
                          {c.name ?? c.model ?? "—"} {c.hardwareVersion ?? ""}
                          {c.serial ? ` ${t("admin.network.claims.serial", { serial: c.serial })}` : ""}
                        </p>
                      </>
                    ),
                  },
                  {
                    key: "t",
                    header: t("admin.network.claims.col.submitted"),
                    render: (c) => formatDateTime(c.createdAt),
                  },
                  {
                    key: "a",
                    header: t("admin.network.claims.col.decision"),
                    render: (c) => (
                      <div className="flex gap-2">
                        <ActionButton
                          onDone={async () => {
                            await claims.reload();
                            await sites.reload();
                            await summary.reload();
                            setFlash(t("admin.network.claims.approvedFlash", { mac: c.mac }));
                          }}
                          onRun={(reason) =>
                            api.post(`/admin/device-claims/${c.id}/review`, { decision: "approve", reason })
                          }
                          reasonError={t("admin.controllers.dialog.reasonTooShort")}
                          reasonPrompt={t("admin.network.claims.approvePrompt")}
                          variant="primary"
                        >
                          {t("admin.network.claims.approve")}
                        </ActionButton>
                        <ActionButton
                          onDone={async () => {
                            await claims.reload();
                            await summary.reload();
                            setFlash(t("admin.network.claims.rejectedFlash", { mac: c.mac }));
                          }}
                          onRun={(reason) =>
                            api.post(`/admin/device-claims/${c.id}/review`, { decision: "reject", reason })
                          }
                          reasonError={t("admin.controllers.dialog.reasonTooShort")}
                          reasonPrompt={t("admin.network.claims.rejectPrompt")}
                          variant="danger"
                        >
                          {t("admin.network.claims.reject")}
                        </ActionButton>
                      </div>
                    ),
                  },
                ]}
                empty={t("admin.network.claims.empty")}
                label={t("admin.network.claims.title")}
                rowKey={(c) => c.id}
                rows={rows}
              />
            )}
          </ResourceView>
        </div>
      </section>

      {/* ── Sites ── */}
      <section className="rounded-card border border-[var(--advo-border)] bg-white p-4 shadow-advo-card">
        <SectionHeader
          description={t("admin.network.sites.description")}
          icon={<Globe />}
          iconTone="teal"
          title={t("admin.network.sites.title")}
        />
        <div className="mt-4">
          <ResourceView resource={sites}>
            {(rows) => (
              <AdvoTable
                columns={[
                  {
                    key: "n",
                    header: t("admin.network.sites.col.site"),
                    render: (s) => (
                      <>
                        {s.name}
                        <p className="text-xs text-[var(--advo-muted)]">
                          {s.reseller.businessName} · /{s.slug}
                        </p>
                      </>
                    ),
                  },
                  {
                    key: "s",
                    header: t("admin.network.sites.col.state"),
                    render: (s) => <StatusChip>{t(stateLabel(s.state))}</StatusChip>,
                  },
                  {
                    key: "m",
                    header: t("admin.network.sites.col.mapping"),
                    render: (s) =>
                      s.mapping ? (
                        <>
                          <StatusChip>{t(stateLabel(s.mapping.state))}</StatusChip>
                          {s.mapping.lastError ? (
                            <p className="text-xs text-[var(--advo-danger)]">{s.mapping.lastError}</p>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-xs text-[var(--advo-muted)]">
                          {t("admin.network.sites.noMapping")}
                        </span>
                      ),
                  },
                  {
                    key: "d",
                    header: t("admin.network.sites.col.devices"),
                    render: (s) => <span className="tabular-nums">{s._count.devices}</span>,
                  },
                  {
                    key: "c",
                    header: t("admin.network.sites.col.created"),
                    render: (s) => formatDateTime(s.createdAt),
                  },
                ]}
                empty={t("admin.network.sites.empty")}
                label={t("admin.network.sites.title")}
                rowKey={(s) => s.id}
                rows={rows}
              />
            )}
          </ResourceView>
        </div>
      </section>

      {/* ── Network operations ── */}
      <section className="rounded-card border border-[var(--advo-border)] bg-white p-4 shadow-advo-card">
        <SectionHeader
          action={
            <AdvoSelect
              aria-label={t("admin.network.ops.filter")}
              className="w-auto min-w-44"
              onChange={(e) => setOpState(e.target.value)}
              value={opState}
            >
              <option value="">{t("admin.network.ops.filterAll")}</option>
              {OPERATION_FILTERS.map((state) => (
                <option key={state} value={state}>
                  {t(stateLabel(state))}
                </option>
              ))}
            </AdvoSelect>
          }
          description={t("admin.network.ops.description")}
          icon={<Activity />}
          iconTone={stats && stats.operations.stuck > 0 ? "danger" : "gold"}
          title={t("admin.network.ops.title")}
        />
        <div className="mt-4">
          <ResourceView resource={ops}>
            {(rows) => (
              <AdvoTable
                columns={[
                  {
                    key: "k",
                    header: t("admin.network.ops.col.operation"),
                    render: (o) => <Mono>{o.kind}</Mono>,
                  },
                  {
                    key: "s",
                    header: t("admin.network.ops.col.state"),
                    render: (o) => <StatusChip>{t(stateLabel(o.state))}</StatusChip>,
                  },
                  {
                    key: "a",
                    header: t("admin.network.ops.col.attempts"),
                    render: (o) => <span className="tabular-nums">{o.attempts}</span>,
                  },
                  {
                    key: "e",
                    header: t("admin.network.ops.col.error"),
                    render: (o) =>
                      o.lastError ? `${o.lastErrorCode ?? ""} ${o.lastError}` : t("admin.network.none"),
                  },
                  {
                    key: "n",
                    header: t("admin.network.ops.col.retry"),
                    render: (o) =>
                      o.nextRetryAt ? formatDateTime(o.nextRetryAt) : t("admin.network.none"),
                  },
                  {
                    key: "u",
                    header: t("admin.network.ops.col.updated"),
                    render: (o) => formatDateTime(o.updatedAt),
                  },
                ]}
                empty={t("admin.network.ops.empty")}
                label={t("admin.network.ops.title")}
                rowKey={(o) => o.id}
                rows={rows}
              />
            )}
          </ResourceView>
        </div>
      </section>
    </div>
  );
}

/* ────────────────────────────── Bits & pieces ────────────────────────────── */

/**
 * One box card: a labelled count per state with a proportional bar.
 *
 * Bars are scaled against the largest bucket rather than the total, so a card
 * with one dominant state still shows its smaller buckets instead of collapsing
 * them into an invisible sliver.
 */
function DistributionCard({
  title,
  hint,
  icon,
  iconTone,
  rows,
  totalLabel,
  empty,
}: {
  title: string;
  hint: string;
  icon: React.ReactNode;
  iconTone: IconTone;
  rows: Array<{ state: string; count: number; label: string; tone: StateTone }>;
  totalLabel: string;
  empty: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card className="gap-3 p-4 shadow-advo-card ring-1 ring-advo-border/70">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <SoftIcon size="sm" tone={iconTone}>
            {icon}
          </SoftIcon>
          <div className="min-w-0">
            <p className="text-sm font-bold text-advo-text">{title}</p>
            <p className="mt-0.5 text-xs text-advo-muted">{hint}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-advo-blue-soft px-2 py-0.5 text-[11px] font-bold text-advo-blue tabular-nums">
          {totalLabel}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="py-2 text-xs text-advo-muted">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.state}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-1.5 text-advo-text">
                  <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${TONE_BAR[row.tone]}`} />
                  <span className="truncate">{row.label}</span>
                </span>
                <span className="shrink-0 font-bold text-advo-text tabular-nums">{row.count}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <span
                  className={`block h-full rounded-full ${TONE_BAR[row.tone]}`}
                  style={{ width: `${Math.max(4, (row.count / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function KpiSkeleton() {
  return (
    <Card className="gap-3 p-4 shadow-advo-card ring-1 ring-advo-border/70">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-16" />
      <Skeleton className="h-3 w-32" />
    </Card>
  );
}

function CardSkeleton() {
  return (
    <Card className="gap-3 p-4 shadow-advo-card ring-1 ring-advo-border/70">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-2 w-5/6" />
      <Skeleton className="h-2 w-2/3" />
    </Card>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{children}</code>;
}
