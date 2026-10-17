"use client";

import { useMemo, useState } from "react";
import { formatDateTime } from "@advo/api-client";
import { Button, Card, Input, Skeleton } from "@heroui/react";
import { AdvoKpi, SoftIcon, StatusChip, type IconTone, type StatusTone } from "@advo/ui";
import {
  Activity,
  Cable,
  ClipboardList,
  Filter,
  Globe,
  MapPin,
  RefreshCw,
  Router,
  Search,
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
  progress: "bg-[#1B5EA4]",
  warn: "bg-amber-500",
  bad: "bg-red-500",
  neutral: "bg-slate-400",
};

const TONE_CHIP: Record<StateTone, StatusTone> = {
  good: "success",
  progress: "accent",
  warn: "warning",
  bad: "danger",
  neutral: "default",
};

const TONE_ACCENT: Record<StateTone, string> = {
  good: "from-emerald-500/80 to-emerald-500/20",
  progress: "from-[#1B5EA4]/90 to-[#1B5EA4]/20",
  warn: "from-amber-500/80 to-amber-500/20",
  bad: "from-red-500/80 to-red-500/20",
  neutral: "from-slate-400/70 to-slate-400/15",
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

type TabKey = "sites" | "claims" | "ops";
type MappingFilter = "all" | "mapped" | "unmapped";

const stateLabel = (state: string) => `admin.network.state.${state}` as MessageKey;

export function AdminNetworkScreen() {
  const { t } = useI18n();
  const [tab, setTab] = useState<TabKey>("sites");
  const [opState, setOpState] = useState<string>("");
  const [siteQuery, setSiteQuery] = useState("");
  const [siteState, setSiteState] = useState<string>("all");
  const [mappingFilter, setMappingFilter] = useState<MappingFilter>("all");
  const [flash, setFlash] = useState<string | null>(null);

  const summary = useResource<NetworkSummary>("/admin/network-summary");
  const claims = useResource<ClaimRow[]>("/admin/device-claims?state=SUBMITTED");
  const sites = useResource<SiteRow[]>("/admin/sites");
  const ops = useResource<OperationRow[]>(`/admin/network-operations${opState ? `?state=${opState}` : ""}`);

  const stats = summary.data;
  const siteRows = sites.data ?? [];
  const claimRows = claims.data ?? [];
  const opRows = ops.data ?? [];

  const siteStateCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const site of siteRows) map.set(site.state, (map.get(site.state) ?? 0) + 1);
    return map;
  }, [siteRows]);

  const mappedCount = useMemo(() => siteRows.filter((s) => s.mapping).length, [siteRows]);
  const unmappedCount = siteRows.length - mappedCount;

  const visibleSites = useMemo(() => {
    const needle = siteQuery.trim().toLowerCase();
    return siteRows.filter((site) => {
      if (siteState !== "all" && site.state !== siteState) return false;
      if (mappingFilter === "mapped" && !site.mapping) return false;
      if (mappingFilter === "unmapped" && site.mapping) return false;
      if (!needle) return true;
      return [site.name, site.slug, site.reseller.businessName, site.location ?? "", site.state, site.mapping?.state ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [siteRows, siteQuery, siteState, mappingFilter]);

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
        onPick: (state: string) => {
          setTab("sites");
          setSiteState(state);
          setMappingFilter("all");
        },
      },
      {
        key: "mappings",
        title: t("admin.network.distribution.mappings"),
        hint: t("admin.network.distribution.mappingsHint"),
        icon: <Cable />,
        iconTone: stats.mappings.failing > 0 || stats.mappings.unmapped > 0 ? ("warning" as IconTone) : ("accent" as IconTone),
        total: stats.sites.total,
        rows: mappingRows,
        onPick: (state: string) => {
          setTab("sites");
          setSiteState("all");
          setMappingFilter(state === "UNMAPPED" ? "unmapped" : "mapped");
        },
      },
      {
        key: "claims",
        title: t("admin.network.distribution.claims"),
        hint: t("admin.network.distribution.claimsHint"),
        icon: <ClipboardList />,
        iconTone: stats.claims.submitted > 0 ? ("warning" as IconTone) : ("violet" as IconTone),
        total: stats.claims.total,
        rows: build(CLAIM_STATES, stats.claims.byState),
        onPick: () => setTab("claims"),
      },
      {
        key: "operations",
        title: t("admin.network.distribution.operations"),
        hint: t("admin.network.distribution.operationsHint"),
        icon: <Activity />,
        iconTone: stats.operations.stuck > 0 ? ("danger" as IconTone) : ("gold" as IconTone),
        total: stats.operations.total,
        rows: build(OPERATION_STATES, stats.operations.byState),
        onPick: (state: string) => {
          setTab("ops");
          setOpState(state);
        },
      },
    ];
  }, [stats, t]);

  async function afterClaimChange(message: string) {
    setFlash(message);
    await Promise.all([claims.reload(), sites.reload(), summary.reload()]);
  }

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
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-[#2A2D33] px-2.5 py-1 text-[11px] font-semibold text-[#F4F6F8] tabular-nums">
                <Globe className="size-3 text-[#C5CDD8]" />
                {t("admin.network.hero.sites", { count: stats.sites.total })}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#1B5EA4]/40 bg-[#1B5EA4]/20 px-2.5 py-1 text-[11px] font-bold text-[#9EC5F0] tabular-nums">
                <Wifi className="size-3" />
                {t("admin.network.hero.devices", { count: stats.devices.total })}
              </span>
              {stats.claims.submitted > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-300 tabular-nums">
                  <ClipboardList className="size-3" />
                  {t("admin.network.hero.claims", { count: stats.claims.submitted })}
                </span>
              ) : null}
              {stats.attention > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/15 px-2.5 py-1 text-[11px] font-bold text-red-300 tabular-nums">
                  <TriangleAlert className="size-3" />
                  {t("admin.network.hero.attention", { count: stats.attention })}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
                  {t("admin.network.hero.clear")}
                </span>
              )}
            </>
          ) : null
        }
        title={t("admin.network.title")}
      />

      {flash ? (
        <div className="rounded-card border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-300">
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
                  onPick={card.onPick}
                  rows={card.rows}
                  title={card.title}
                  totalLabel={t("admin.network.distribution.total", { count: card.total })}
                />
              ))
            : Array.from({ length: 4 }, (_, i) => <CardSkeleton key={i} />)}
        </div>
      </section>

      {/* ── Tabs ── */}
      <div
        className="flex flex-wrap gap-1 rounded-2xl border border-[var(--advo-border)] bg-[var(--advo-surface-sunken)] p-1.5 shadow-advo-card"
        role="tablist"
      >
        {(
          [
            { key: "sites" as const, icon: <Globe className="size-3.5 shrink-0" />, label: t("admin.network.tab.sites"), count: siteRows.length },
            {
              key: "claims" as const,
              icon: <ClipboardList className="size-3.5 shrink-0" />,
              label: t("admin.network.tab.claims"),
              count: stats?.claims.submitted ?? claimRows.length,
            },
            {
              key: "ops" as const,
              icon: <Activity className="size-3.5 shrink-0" />,
              label: t("admin.network.tab.ops"),
              count: stats?.operations.total ?? opRows.length,
            },
          ] as const
        ).map((item) => {
          const active = tab === item.key;
          return (
            <button
              aria-selected={active}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors ${
                active
                  ? "bg-[#1B5EA4] text-white shadow-advo-card"
                  : "text-[#E8EAEE] hover:bg-[#2A2D33] hover:text-white"
              }`}
              key={item.key}
              onClick={() => setTab(item.key)}
              role="tab"
              type="button"
            >
              {item.icon}
              {item.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                  active ? "bg-white/25 text-white" : "border border-white/15 bg-[#101113] text-[#F4F6F8]"
                }`}
              >
                {item.count}
              </span>
            </button>
          );
        })}
      </div>

      {tab === "sites" ? (
        <>
          <Card className="gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70">
            <SectionHeader
              action={
                <span className="rounded-full border border-white/15 bg-[#2A2D33] px-2.5 py-1 text-[11px] font-bold text-[#E8EAEE] tabular-nums">
                  {t("admin.network.sites.showing", { shown: visibleSites.length, total: siteRows.length })}
                </span>
              }
              icon={<Filter />}
              iconTone="teal"
              title={t("admin.network.sites.searchTitle")}
            />
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-56 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-[#8B939E]" />
                <Input
                  aria-label={t("admin.network.sites.search")}
                  className="border border-[var(--advo-border)] !bg-[var(--advo-surface-sunken)] pl-9 !text-[var(--advo-text)]"
                  placeholder={t("admin.network.sites.search")}
                  value={siteQuery}
                  onChange={(e) => setSiteQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("admin.network.sites.col.state")}>
              <FilterPill
                active={siteState === "all"}
                count={siteRows.length}
                label={t("admin.network.sites.filter.all")}
                onClick={() => setSiteState("all")}
              />
              {SITE_STATES.map((state) => (
                <FilterPill
                  active={siteState === state}
                  count={siteStateCounts.get(state) ?? 0}
                  key={state}
                  label={t(stateLabel(state))}
                  onClick={() => setSiteState(state)}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("admin.network.sites.col.mapping")}>
              <FilterPill
                active={mappingFilter === "all"}
                count={siteRows.length}
                label={t("admin.network.sites.filter.mappingAll")}
                onClick={() => setMappingFilter("all")}
              />
              <FilterPill
                active={mappingFilter === "mapped"}
                count={mappedCount}
                label={t("admin.network.sites.filter.mapped")}
                onClick={() => setMappingFilter("mapped")}
              />
              <FilterPill
                active={mappingFilter === "unmapped"}
                count={unmappedCount}
                label={t("admin.network.sites.filter.unmapped")}
                onClick={() => setMappingFilter("unmapped")}
              />
            </div>
          </Card>

          <ResourceView resource={sites}>
            {(rows) =>
              rows.length === 0 ? (
                <Card className="shadow-advo-card ring-1 ring-advo-border/70">
                  <EmptyState text={t("admin.network.sites.empty")} />
                </Card>
              ) : visibleSites.length === 0 ? (
                <Card className="shadow-advo-card ring-1 ring-advo-border/70">
                  <EmptyState
                    hint={t("admin.network.sites.noMatchHint")}
                    text={t("admin.network.sites.noMatch")}
                  />
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {visibleSites.map((site) => (
                    <SiteCard key={site.id} site={site} t={t} />
                  ))}
                </div>
              )
            }
          </ResourceView>
        </>
      ) : null}

      {tab === "claims" ? (
        <Card className="gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70">
          <SectionHeader
            action={
              stats && stats.claims.submitted > 0 ? (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-300 tabular-nums">
                  {stats.claims.submitted}
                </span>
              ) : null
            }
            description={t("admin.network.claims.description")}
            icon={<ClipboardList />}
            iconTone={stats && stats.claims.submitted > 0 ? "warning" : "violet"}
            title={t("admin.network.claims.title")}
          />
          <ResourceView resource={claims}>
            {(rows) =>
              rows.length === 0 ? (
                <EmptyState text={t("admin.network.claims.empty")} />
              ) : (
                <ul className="space-y-3">
                  {rows.map((claim) => (
                    <li
                      className="rounded-2xl border border-[var(--advo-border)] bg-[var(--advo-surface-sunken)] p-4"
                      key={claim.id}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm font-bold text-[var(--advo-text)]">{claim.reseller.businessName}</p>
                          <p className="text-xs text-[var(--advo-muted)]">{claim.site.name}</p>
                          <p className="pt-1">
                            <Mono>{claim.mac}</Mono>
                          </p>
                          <p className="text-xs text-[var(--advo-muted)]">
                            {claim.name ?? claim.model ?? "—"} {claim.hardwareVersion ?? ""}
                            {claim.serial ? ` ${t("admin.network.claims.serial", { serial: claim.serial })}` : ""}
                          </p>
                          <p className="text-[11px] text-[var(--advo-muted)]">{formatDateTime(claim.createdAt)}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <ActionButton
                            onDone={async () => {
                              await afterClaimChange(t("admin.network.claims.approvedFlash", { mac: claim.mac }));
                            }}
                            onRun={(reason) =>
                              api.post(`/admin/device-claims/${claim.id}/review`, { decision: "approve", reason })
                            }
                            reasonError={t("admin.controllers.dialog.reasonTooShort")}
                            reasonPrompt={t("admin.network.claims.approvePrompt")}
                            variant="primary"
                          >
                            {t("admin.network.claims.approve")}
                          </ActionButton>
                          <ActionButton
                            onDone={async () => {
                              await afterClaimChange(t("admin.network.claims.rejectedFlash", { mac: claim.mac }));
                            }}
                            onRun={(reason) =>
                              api.post(`/admin/device-claims/${claim.id}/review`, { decision: "reject", reason })
                            }
                            reasonError={t("admin.controllers.dialog.reasonTooShort")}
                            reasonPrompt={t("admin.network.claims.rejectPrompt")}
                            variant="danger"
                          >
                            {t("admin.network.claims.reject")}
                          </ActionButton>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            }
          </ResourceView>
        </Card>
      ) : null}

      {tab === "ops" ? (
        <>
          <Card className="gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70">
            <SectionHeader
              description={t("admin.network.ops.description")}
              icon={<Filter />}
              iconTone="gold"
              title={t("admin.network.ops.filterTitle")}
            />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("admin.network.ops.filter")}>
              <FilterPill
                active={opState === ""}
                count={stats?.operations.total ?? opRows.length}
                label={t("admin.network.ops.filterAll")}
                onClick={() => setOpState("")}
              />
              {OPERATION_FILTERS.map((state) => (
                <FilterPill
                  active={opState === state}
                  count={stats?.operations.byState[state] ?? 0}
                  key={state}
                  label={t(stateLabel(state))}
                  onClick={() => setOpState(state)}
                />
              ))}
            </div>
          </Card>

          <ResourceView resource={ops}>
            {(rows) =>
              rows.length === 0 ? (
                <Card className="shadow-advo-card ring-1 ring-advo-border/70">
                  <EmptyState text={t("admin.network.ops.empty")} />
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {rows.map((op) => {
                    const tone = STATE_TONE[op.state] ?? "neutral";
                    return (
                      <Card className="gap-3 overflow-hidden p-0 shadow-advo-card ring-1 ring-advo-border/70" key={op.id}>
                        <div className="flex">
                          <span aria-hidden="true" className={`w-1.5 shrink-0 bg-gradient-to-b ${TONE_ACCENT[tone]}`} />
                          <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-3 p-4">
                            <div className="min-w-0 space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <Mono>{op.kind}</Mono>
                                <StatusChip tone={TONE_CHIP[tone]}>{t(stateLabel(op.state))}</StatusChip>
                              </div>
                              <p className="text-xs text-[var(--advo-muted)]">
                                {t("admin.network.ops.col.attempts")}:{" "}
                                <span className="font-bold text-[var(--advo-text)] tabular-nums">{op.attempts}</span>
                                {" · "}
                                {t("admin.network.ops.col.updated")}: {formatDateTime(op.updatedAt)}
                              </p>
                              {op.lastError ? (
                                <p className="text-xs text-red-300">
                                  {op.lastErrorCode ? `${op.lastErrorCode} · ` : ""}
                                  {op.lastError}
                                </p>
                              ) : null}
                              {op.nextRetryAt ? (
                                <p className="text-[11px] text-[var(--advo-muted)]">
                                  {t("admin.network.ops.col.retry")}: {formatDateTime(op.nextRetryAt)}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )
            }
          </ResourceView>
        </>
      ) : null}
    </div>
  );
}

/* ────────────────────────────── Bits & pieces ────────────────────────────── */

function SiteCard({ site, t }: { site: SiteRow; t: T }) {
  const tone = STATE_TONE[site.state] ?? "neutral";
  return (
    <Card className="gap-0 overflow-hidden p-0 shadow-advo-card ring-1 ring-advo-border/70">
      <div className="flex">
        <span aria-hidden="true" className={`w-1.5 shrink-0 bg-gradient-to-b ${TONE_ACCENT[tone]}`} />
        <div className="min-w-0 flex-1 space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-[var(--advo-text)]">{site.name}</p>
              <p className="mt-0.5 truncate text-xs text-[var(--advo-muted)]">
                {site.reseller.businessName}
                <span className="text-[var(--advo-muted)]/70"> · /{site.slug}</span>
              </p>
            </div>
            <StatusChip tone={TONE_CHIP[tone]}>{t(stateLabel(site.state))}</StatusChip>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <MetaTile
              icon={<Cable className="size-3.5" />}
              label={t("admin.network.sites.col.mapping")}
              value={
                site.mapping ? (
                  <span className="flex flex-col gap-0.5">
                    <StatusChip tone={TONE_CHIP[STATE_TONE[site.mapping.state] ?? "neutral"]}>
                      {t(stateLabel(site.mapping.state))}
                    </StatusChip>
                    {site.mapping.lastError ? (
                      <span className="text-[10px] leading-snug text-red-300">{site.mapping.lastError}</span>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-[var(--advo-muted)]">{t("admin.network.sites.noMapping")}</span>
                )
              }
            />
            <MetaTile
              icon={<Wifi className="size-3.5" />}
              label={t("admin.network.sites.col.devices")}
              value={<span className="font-bold tabular-nums">{site._count.devices}</span>}
            />
            <MetaTile
              icon={<MapPin className="size-3.5" />}
              label={t("admin.network.sites.col.created")}
              value={<span className="text-[11px]">{formatDateTime(site.createdAt)}</span>}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

function MetaTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--advo-border)] bg-[var(--advo-surface-sunken)] px-3 py-2.5">
      <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-[var(--advo-muted)] uppercase">
        {icon}
        {label}
      </p>
      <div className="text-xs text-[var(--advo-text)]">{value}</div>
    </div>
  );
}

/** Pill in a filter row; the count is always the unfiltered total for that value. */
function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${
        active
          ? "border-transparent bg-[#1B5EA4] text-white"
          : "border-white/15 bg-[#2A2D33] text-[#E8EAEE] hover:border-[#1B5EA4]/60 hover:text-white"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
      <span className={`ml-1.5 tabular-nums ${active ? "text-white/85" : "text-white"}`}>{count}</span>
    </button>
  );
}

function EmptyState({ text, hint }: { text: string; hint?: string }) {
  return (
    <span className="flex flex-col items-center gap-1.5 py-8">
      <span className="text-sm font-bold text-[var(--advo-text)]">{text}</span>
      {hint ? <span className="max-w-md text-center text-xs text-[var(--advo-muted)]">{hint}</span> : null}
    </span>
  );
}

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
  onPick,
}: {
  title: string;
  hint: string;
  icon: React.ReactNode;
  iconTone: IconTone;
  rows: Array<{ state: string; count: number; label: string; tone: StateTone }>;
  totalLabel: string;
  empty: string;
  onPick?: (state: string) => void;
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
            <p className="text-sm font-bold text-[var(--advo-text)]">{title}</p>
            <p className="mt-0.5 text-xs text-[var(--advo-muted)]">{hint}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-[#1B5EA4]/35 bg-[#1B5EA4]/20 px-2 py-0.5 text-[11px] font-bold text-[#9EC5F0] tabular-nums">
          {totalLabel}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="py-2 text-xs text-[var(--advo-muted)]">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.state}>
              <button
                className={`flex w-full flex-col gap-1 rounded-lg px-1 py-0.5 text-left transition-colors ${
                  onPick ? "hover:bg-white/[0.04]" : ""
                }`}
                disabled={!onPick}
                onClick={() => onPick?.(row.state)}
                type="button"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-1.5 text-[var(--advo-text)]">
                    <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${TONE_BAR[row.tone]}`} />
                    <span className="truncate">{row.label}</span>
                  </span>
                  <span className="shrink-0 font-bold text-[var(--advo-text)] tabular-nums">{row.count}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#101113]">
                  <span
                    className={`block h-full rounded-full ${TONE_BAR[row.tone]}`}
                    style={{ width: `${Math.max(4, (row.count / max) * 100)}%` }}
                  />
                </div>
              </button>
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
  return (
    <code className="rounded border border-white/10 bg-[#101113] px-1.5 py-0.5 font-mono text-xs text-[#E8EAEE]">
      {children}
    </code>
  );
}
