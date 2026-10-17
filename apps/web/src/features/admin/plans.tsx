"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatDateTime, formatTzs } from "@advo/api-client";
import type { PlanFeatures, PlanLifecycle, CommercialPromise } from "@advo/contracts";
import { useOverlayState } from "@heroui/react";
import { Button, Card, Input, Modal } from "@heroui/react";
import { AdvoKpi, Notice, SoftIcon, StatusChip } from "@advo/ui";
import {
  ArchiveRestore,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  Coins,
  ChevronDown,
  FileText,
  Filter,
  Gauge,
  Hash,
  History,
  Layers,
  Pencil,
  Plus,
  Receipt,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  TriangleAlert,
  Users,
  Wifi,
} from "lucide-react";
import { PageHero, ResourceView, SectionHeader } from "@/features/common/components";
import { ReasonDialog } from "@/features/common/reason-dialog";
import { PlanFeatureEditor, planDraftFrom, planIssues, type PlanDraft } from "@/features/admin/plan-features";
import { PlanMigrationList, PlanMigrationModal } from "@/features/admin/plan-migrations";
import { api } from "@/lib/api";
import { toInt, useAction, useResource } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

/**
 * Row shape returned by `GET /admin/plans`.
 *
 * Plans are versioned: one row per (code, version). The API adds `subscriptions`,
 * `paidInvoiceCount` and `paidRevenueTzs` so a card can show real usage and decide
 * whether the row is still deletable.
 */
export type PlanRow = {
  id: string;
  code: string;
  version: number;
  name: string;
  description: string;
  priceTzs: string;
  periodDays: number;
  trialEligible: boolean;
  trialDays: number | null;
  maxSites: number;
  maxDevices: number;
  maxPackages: number;
  active: boolean;
  isDemo: boolean;
  createdAt: string;
  /** The feature catalog values this version grants. */
  features: PlanFeatures;
  /** Draft versions exist but are never served to a guest. */
  lifecycle: PlanLifecycle;
  commercialPromise: CommercialPromise;
  subscriptions: number;
  paidInvoiceCount: number;
  paidRevenueTzs: string;
  _count: { subscriptions: number; invoices: number };
};

/**
 * One plan code and every version published under it, newest first.
 *
 * `current` is the version on sale when there is one — otherwise the newest — so a
 * rollback never leaves the headline showing an archived price.
 */
type PlanFamily = { code: string; versions: PlanRow[]; current: PlanRow; older: PlanRow[] };

/** Filters the pill row cycles through. */
const FILTERS = ["all", "active", "archived", "demo"] as const;
type FilterKey = (typeof FILTERS)[number];

/** Static labels keep the translator call fully typed instead of built from a template. */
const FILTER_LABEL: Record<
  FilterKey,
  | "admin.plans.filter.all"
  | "admin.plans.filter.active"
  | "admin.plans.filter.archived"
  | "admin.plans.filter.demo"
> = {
  all: "admin.plans.filter.all",
  active: "admin.plans.filter.active",
  archived: "admin.plans.filter.archived",
  demo: "admin.plans.filter.demo",
};

/** Reference counts that make a row unsafe to delete. */
function references(plan: PlanRow): number {
  return plan._count.subscriptions + plan._count.invoices;
}

export function AdminPlansScreen() {
  const { t } = useI18n();
  const plans = useResource<PlanRow[]>("/admin/plans");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  /** `undefined` = closed, `null` = creating, a row = editing that row. */
  const [formTarget, setFormTarget] = useState<PlanRow | null | undefined>(undefined);
  const [reasonTarget, setReasonTarget] = useState<{ kind: "archive" | "reactivate" | "delete" | "publish"; plan: PlanRow } | null>(null);
  /** The published version a migration would move subscribers onto. */
  const [migrationTarget, setMigrationTarget] = useState<PlanRow | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const rows = plans.data ?? [];

  const stats = useMemo(() => {
    const active = rows.filter((r) => r.active).length;
    const archived = rows.filter((r) => !r.active).length;
    const demo = rows.filter((r) => r.isDemo).length;
    const families = new Set(rows.map((r) => r.code)).size;
    const subscribers = rows.reduce((sum, r) => sum + r.subscriptions, 0);
    const withSubscribers = rows.filter((r) => r.subscriptions > 0).length;
    // Paid revenue is counted once per code: an invoice is billed against one version.
    const revenue = rows.reduce((sum, r) => sum + BigInt(r.paidRevenueTzs), 0n);
    const invoices = rows.reduce((sum, r) => sum + r.paidInvoiceCount, 0);
    return { total: rows.length, active, archived, demo, families, subscribers, withSubscribers, revenue, invoices };
  }, [rows]);

  /** Newest version of each code, so a code is one card rather than a row per version. */
  const families = useMemo<PlanFamily[]>(() => {
    const byCode = new Map<string, PlanRow[]>();
    for (const row of rows) {
      const list = byCode.get(row.code) ?? [];
      list.push(row);
      byCode.set(row.code, list);
    }
    return [...byCode.entries()]
      .map(([code, versions]) => {
        const sorted = [...versions].sort((a, b) => b.version - a.version);
        const current = sorted.find((v) => v.active) ?? sorted[0];
        return { code, versions: sorted, current, older: sorted.filter((v) => v.id !== current.id) };
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return families.filter((family) => {
      // A filter matches a family when any of its versions qualifies, so an archived
      // code with a live version still shows under "On sale".
      const matchesFilter = family.versions.some((v) =>
        filter === "all"
          ? true
          : filter === "active"
            ? v.active
            : filter === "archived"
              ? !v.active
              : v.isDemo,
      );
      if (!matchesFilter) return false;
      if (!needle) return true;
      return family.versions
        .some((v) => [v.code, v.name, v.priceTzs, String(v.version)].join(" ").toLowerCase().includes(needle));
    });
  }, [families, query, filter]);

  async function afterChange(message: string) {
    setFlash(message);
    await plans.reload();
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-4">
      <PageHero
        actions={
          <Button onPress={() => setFormTarget(null)} size="sm" type="button" variant="primary">
            <Plus className="size-4" />
            {t("admin.plans.action.create")}
          </Button>
        }
        description={t("admin.plans.description")}
        eyebrow={t("admin.plans.eyebrow")}
        icon={<Layers />}
        iconTone="teal"
        meta={
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--advo-border)] bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-advo-muted tabular-nums">
              <Tag className="size-3" />
              {t("admin.plans.count", { count: stats.total })}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-advo-success-soft px-2.5 py-1 text-[11px] font-bold text-emerald-700 tabular-nums">
              <Sparkles className="size-3" />
              {t("admin.plans.codeCount", { count: stats.families })}
            </span>
          </>
        }
        title={t("admin.plans.title")}
      />

      {flash ? (
        <Notice tone="success">
          <span className="flex flex-wrap items-center gap-2">
            {flash}
            <button className="font-bold underline" onClick={() => setFlash(null)} type="button">
              ✕
            </button>
          </span>
        </Notice>
      ) : null}

      {/* ── Summary ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdvoKpi
          hint={t("admin.plans.kpi.totalHint", { codes: stats.families })}
          icon={<Layers />}
          iconTone="teal"
          label={t("admin.plans.kpi.total")}
          value={stats.total}
        />
        <AdvoKpi
          hint={t("admin.plans.kpi.activeHint")}
          icon={<Sparkles />}
          iconTone="success"
          label={t("admin.plans.kpi.active")}
          value={stats.active}
        />
        <AdvoKpi
          hint={t("admin.plans.kpi.subscribersHint", { plans: stats.withSubscribers })}
          icon={<Users />}
          iconTone="accent"
          label={t("admin.plans.kpi.subscribers")}
          value={stats.subscribers}
        />
        <AdvoKpi
          hint={t("admin.plans.kpi.revenueHint", { count: stats.invoices })}
          icon={<Coins />}
          iconTone="gold"
          label={t("admin.plans.kpi.revenue")}
          value={formatTzs(stats.revenue)}
        />
      </div>

      {/* ── Search & filter ── */}
      <Card className="gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70">
        <SectionHeader
          action={
            <span className="rounded-full bg-advo-surface-soft px-2.5 py-1 text-[11px] font-bold text-advo-muted tabular-nums">
              {visible.length} / {families.length}
            </span>
          }
          icon={<Filter />}
          iconTone="teal"
          title={t("admin.plans.search.title")}
        />
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-advo-muted" />
            <Input
              aria-label={t("admin.plans.search.label")}
              className="pl-9"
              placeholder={t("admin.plans.search.placeholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group">
            {FILTERS.map((key) => (
              <button
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
                  filter === key
                    ? "bg-advo-blue text-white"
                    : "bg-advo-surface-soft text-advo-muted hover:bg-advo-blue-soft hover:text-advo-blue"
                }`}
                key={key}
                onClick={() => setFilter(key)}
                type="button"
              >
                {t(FILTER_LABEL[key])}
                <span className="ml-1.5 tabular-nums opacity-70">
                  {key === "all"
                    ? stats.total
                    : key === "active"
                      ? stats.active
                      : key === "archived"
                        ? stats.archived
                        : stats.demo}
                </span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* ── Cards ── */}
      <ResourceView resource={plans}>
        {() =>
          visible.length === 0 ? (
            <Card className="shadow-advo-card ring-1 ring-advo-border/70">
              <span className="flex flex-col items-center gap-2 py-6">
                <SoftIcon size="lg" tone={families.length === 0 ? "teal" : "accent"}>
                  <Layers />
                </SoftIcon>
                <span className="text-sm font-bold text-advo-text">
                  {families.length === 0 ? t("admin.plans.emptyNone") : t("admin.plans.empty")}
                </span>
                <span className="max-w-md text-center text-xs text-advo-muted">
                  {families.length === 0 ? t("admin.plans.emptyNoneHint") : t("admin.plans.emptyHint")}
                </span>
                {families.length === 0 ? (
                  <Button onPress={() => setFormTarget(null)} size="sm" type="button" variant="primary">
                    <Plus className="size-4" />
                    {t("admin.plans.action.create")}
                  </Button>
                ) : null}
              </span>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {visible.map((family) => (
                <PlanFamilyCard
                  family={family}
                  key={family.code}
                  onEdit={setFormTarget}
                  onMigrate={setMigrationTarget}
                  onReason={(kind, plan) => setReasonTarget({ kind, plan })}
                />
              ))}
            </div>
          )
        }
      </ResourceView>

      <PlanFormModal
        onClose={() => setFormTarget(undefined)}
        onSaved={afterChange}
        plan={formTarget ?? null}
        open={formTarget !== undefined}
      />

      <PlanReasonDialog
        onClose={() => setReasonTarget(null)}
        onDone={afterChange}
        target={reasonTarget}
      />

      <PlanMigrationModal
        onClose={() => setMigrationTarget(null)}
        onScheduled={(message) => void afterChange(message)}
        open={migrationTarget !== null}
        planId={migrationTarget?.id ?? null}
        planLabel={migrationTarget ? `${migrationTarget.name} v${migrationTarget.version}` : ""}
      />
    </div>
  );
}

/* ─────────────────────────────── Cards ─────────────────────────────── */

/** One plan code: the live version up front, older versions folded away underneath. */
function PlanFamilyCard({
  family,
  onEdit,
  onMigrate,
  onReason,
}: {
  family: PlanFamily;
  onEdit: (plan: PlanRow) => void;
  onMigrate: (plan: PlanRow) => void;
  onReason: (kind: "archive" | "reactivate" | "delete" | "publish", plan: PlanRow) => void;
}) {
  const { t } = useI18n();
  const [historyOpen, setHistoryOpen] = useState(false);
  const plan = family.current;
  const older = family.older;
  const blocked = references(plan) > 0;
  // A draft is not on sale yet, so publishing is the only action that matters and
  // the same feature validator the backend runs decides whether it may go live.
  const isDraft = plan.lifecycle === "DRAFT";
  const issues = planIssues(plan.features, plan.commercialPromise);

  return (
    <Card className="group gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-advo-lift">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <SoftIcon size="lg" tone={plan.active ? "teal" : "warning"}>
            <Layers />
          </SoftIcon>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-black tracking-tight text-advo-text">{plan.name}</h3>
              {plan.isDemo ? <StatusChip tone="warning">{t("admin.plans.badge.demo")}</StatusChip> : null}
              {plan.commercialPromise === "ad_free" ? (
                <StatusChip tone="accent">{t("admin.plans.promise.ad_free")}</StatusChip>
              ) : null}
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-advo-muted">
              <span className="font-mono font-bold">{plan.code}</span>
              <span>·</span>
              <span>{t("admin.plans.version", { version: plan.version })}</span>
              {family.versions.length > 1 ? (
                <>
                  <span>·</span>
                  <span>{t("admin.plans.versionsCount", { count: family.versions.length })}</span>
                </>
              ) : null}
            </p>
          </div>
        </div>
        <StatusChip tone={isDraft ? "warning" : plan.active ? "success" : "default"} size="md">
          {isDraft
            ? t("admin.plans.badge.draft")
            : plan.active
              ? t("admin.plans.badge.published")
              : t("admin.plans.badge.archived")}
        </StatusChip>
      </div>

      {/* ── Price ── */}
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-[var(--advo-border)] bg-gradient-to-br from-white to-[var(--advo-blue-soft)] px-4 py-3">
        <div>
          <p className="text-[10px] font-bold tracking-wider text-advo-muted uppercase">
            {t("admin.plans.form.section.pricing")}
          </p>
          <p className="mt-0.5 text-xl font-black tracking-tight text-advo-text tabular-nums">
            {t("admin.plans.perPeriod", { price: formatTzs(plan.priceTzs), days: plan.periodDays })}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-bold text-advo-muted">
          <CalendarClock className="size-3" />
          {plan.trialEligible
            ? t("admin.plans.trial.days", { days: plan.trialDays ?? 0 })
            : t("admin.plans.trial.none")}
        </span>
      </div>

      {/* ── Usage & limits ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Mini icon={<Users />} label={t("admin.plans.metric.subscribers")} value={plan.subscriptions} />
        <Mini
          icon={<Coins />}
          label={t("admin.plans.metric.revenue")}
          value={formatTzs(plan.paidRevenueTzs)}
        />
        <Mini icon={<Wifi />} label={t("admin.plans.metric.sites")} value={plan.maxSites} />
        <Mini icon={<Gauge />} label={t("admin.plans.metric.devices")} value={plan.maxDevices} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip icon={<Receipt />}>
          {t("admin.plans.limit.packages", { count: plan.maxPackages })}
        </Chip>
        <Chip icon={<Coins />}>
          {t("admin.plans.metric.invoices")}: <span className="font-bold tabular-nums">{plan.paidInvoiceCount}</span>
        </Chip>
      </div>

      {/* ── Actions ── */}
      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--advo-border)] pt-3.5">
        {isDraft ? (
          <Button
            isDisabled={issues.length > 0}
            onPress={() => onReason("publish", plan)}
            size="sm"
            type="button"
            variant="primary"
          >
            <Rocket className="size-3.5" />
            {t("admin.plans.action.publish")}
          </Button>
        ) : null}
        <Button onPress={() => onEdit(plan)} size="sm" type="button" variant={isDraft ? "outline" : "primary"}>
          <Pencil className="size-3.5" />
          {t("admin.plans.action.edit")}
        </Button>
        {/* Publishing is not enough on its own: existing subscribers only move
            through a scoped, dated migration. Only a published version can be
            a migration target, so a draft gets no such button. */}
        {!isDraft ? (
          <Button onPress={() => onMigrate(plan)} size="sm" type="button" variant="outline">
            <CalendarClock className="size-3.5" />
            {t("admin.plans.migration.action")}
          </Button>
        ) : null}
        <Button
          onPress={() => onReason(plan.active ? "archive" : "reactivate", plan)}
          size="sm"
          type="button"
          variant="outline"
        >
          {plan.active ? <ArchiveRestore className="size-3.5" /> : <Sparkles className="size-3.5" />}
          {plan.active ? t("admin.plans.action.archive") : t("admin.plans.action.reactivate")}
        </Button>
        <Button
          className="ml-auto"
          isDisabled={blocked}
          onPress={() => onReason("delete", plan)}
          size="sm"
          type="button"
          variant="danger-soft"
        >
          <Trash2 className="size-3.5" />
          {t("admin.plans.action.delete")}
        </Button>
      </div>

      {blocked ? (
        <p className="flex items-start gap-1.5 rounded-lg bg-advo-warning-soft px-3 py-2 text-[11px] font-semibold text-[#b45309]">
          <TriangleAlert className="mt-0.5 size-3 shrink-0" />
          {t("admin.plans.deleteBlocked", { count: references(plan) })}
        </p>
      ) : null}

      {/* A draft that cannot be published says why, before the admin tries. */}
      {isDraft && issues.length > 0 ? (
        <p className="flex items-start gap-1.5 rounded-lg bg-advo-danger-soft px-3 py-2 text-[11px] font-semibold text-[#b91c1c]">
          <TriangleAlert className="mt-0.5 size-3 shrink-0" />
          <span>
            {t("admin.plans.issues.title", { count: issues.length })}: {issues.map((issue) => issue.key).join(", ")}
          </span>
        </p>
      ) : null}

      {/* The promise is a contract, so the card states whether it currently holds. */}
      {plan.commercialPromise === "ad_free" && issues.length === 0 ? (
        <p className="flex items-start gap-1.5 rounded-lg bg-advo-success-soft px-3 py-2 text-[11px] font-semibold text-emerald-700">
          <ShieldCheck className="mt-0.5 size-3 shrink-0" />
          {t("admin.plans.adFreeOk")}
        </p>
      ) : null}

      {/* ── Version history ── */}
      {older.length > 0 ? (
        <div className="border-t border-[var(--advo-border)] pt-3">
          <button
            className="flex w-full items-center justify-between gap-2 text-left"
            onClick={() => setHistoryOpen((open) => !open)}
            type="button"
          >
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-advo-muted">
              <History className="size-3.5" />
              {t("admin.plans.history.title")}
              <span className="rounded-full bg-advo-surface-soft px-1.5 py-0.5 tabular-nums">{older.length}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-advo-blue">
              {historyOpen ? t("admin.plans.history.hide") : t("admin.plans.history.toggle")}
              <ChevronDown className={`size-3.5 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
            </span>
          </button>

          {historyOpen ? (
            <ul className="mt-2.5 space-y-2">
              {older.map((version) => (
                <VersionRow
                  key={version.id}
                  onReason={onReason}
                  version={version}
                />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* ── Migrations recorded for this code ── */}
      {!isDraft ? <PlanMigrationList planId={plan.id} /> : null}
    </Card>
  );
}

/** A retired version: read-only terms plus the two actions that still make sense. */
function VersionRow({
  version,
  onReason,
}: {
  version: PlanRow;
  onReason: (kind: "archive" | "reactivate" | "delete" | "publish", plan: PlanRow) => void;
}) {
  const { t } = useI18n();
  const blocked = references(version) > 0;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--advo-border)] bg-advo-surface-soft/50 px-3 py-2.5">
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white font-mono text-[10px] font-bold text-advo-muted ring-1 ring-advo-border">
        {version.version}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-advo-text tabular-nums">
          {t("admin.plans.perPeriod", { price: formatTzs(version.priceTzs), days: version.periodDays })}
        </p>
        <p className="flex flex-wrap items-center gap-x-1.5 text-[10px] text-advo-muted">
          <span>{formatDateTime(version.createdAt)}</span>
          <span>·</span>
          <span>{t("admin.plans.limit.sites", { count: version.maxSites })}</span>
          <span>·</span>
          <span>{t("admin.plans.limit.devices", { count: version.maxDevices })}</span>
          {version.isDemo ? (
            <>
              <span>·</span>
              <span className="font-bold">{t("admin.plans.badge.demo")}</span>
            </>
          ) : null}
        </p>
      </div>
      <StatusChip tone={version.lifecycle === "DRAFT" ? "warning" : version.active ? "success" : "default"}>
        {version.lifecycle === "DRAFT"
          ? t("admin.plans.badge.draft")
          : version.active
            ? t("admin.plans.badge.published")
            : t("admin.plans.badge.archived")}
      </StatusChip>
      <div className="flex items-center gap-1.5">
        {version.lifecycle === "DRAFT" ? (
          <Button onPress={() => onReason("publish", version)} size="sm" type="button" variant="ghost">
            <Rocket className="size-3.5" />
            {t("admin.plans.action.publish")}
          </Button>
        ) : !version.active ? (
          <Button onPress={() => onReason("reactivate", version)} size="sm" type="button" variant="ghost">
            <Sparkles className="size-3.5" />
            {t("admin.plans.action.reactivate")}
          </Button>
        ) : (
          <Button onPress={() => onReason("archive", version)} size="sm" type="button" variant="ghost">
            <ArchiveRestore className="size-3.5" />
            {t("admin.plans.action.archive")}
          </Button>
        )}
        <Button
          aria-label={`${t("admin.plans.action.delete")} ${t("admin.plans.version", { version: version.version })}`}
          isDisabled={blocked}
          onPress={() => onReason("delete", version)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </li>
  );
}

/** Small static chip used for the plan's secondary facts. */
function Chip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--advo-border)] bg-advo-surface-soft/60 px-2.5 py-1 text-[11px] font-semibold text-advo-muted">
      <span className="[&_svg]:size-3">{icon}</span>
      {children}
    </span>
  );
}

/** Compact metric tile used inside a plan card. */
function Mini({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--advo-border)] bg-advo-surface-soft/60 px-3 py-2">
      <p className="flex items-center gap-1 text-[10px] font-bold tracking-wider text-advo-muted uppercase">
        <span className="[&_svg]:size-3">{icon}</span>
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-0.5 truncate text-sm font-black text-advo-text tabular-nums">{value}</p>
    </div>
  );
}

/* ────────────────────────── Create / edit modal ────────────────────────── */

const PLAN_FORM_STEPS = ["identity", "pricing", "features", "launch"] as const;
type PlanFormStep = (typeof PLAN_FORM_STEPS)[number];

const PLAN_STEP_LABEL: Record<
  PlanFormStep,
  | "admin.plans.form.step.identity"
  | "admin.plans.form.step.pricing"
  | "admin.plans.form.step.features"
  | "admin.plans.form.step.launch"
> = {
  identity: "admin.plans.form.step.identity",
  pricing: "admin.plans.form.step.pricing",
  features: "admin.plans.form.step.features",
  launch: "admin.plans.form.step.launch",
};

const PLAN_STEP_LEAD: Record<
  PlanFormStep,
  | "admin.plans.form.step.identityLead"
  | "admin.plans.form.step.pricingLead"
  | "admin.plans.form.step.featuresLead"
  | "admin.plans.form.step.launchLead"
> = {
  identity: "admin.plans.form.step.identityLead",
  pricing: "admin.plans.form.step.pricingLead",
  features: "admin.plans.form.step.featuresLead",
  launch: "admin.plans.form.step.launchLead",
};

type PlanFormValues = {
  code: string;
  name: string;
  description: string;
  priceTzs: string;
  periodDays: string;
  trialDays: string;
  trialEligible: boolean;
  isDemo: boolean;
};

function planFormValuesFrom(plan: PlanRow | null): PlanFormValues {
  return {
    code: plan?.code ?? "",
    name: plan?.name ?? "",
    description: plan?.description ?? "",
    priceTzs: plan?.priceTzs ?? "",
    periodDays: String(plan?.periodDays ?? 30),
    trialDays: plan?.trialDays != null ? String(plan.trialDays) : "",
    trialEligible: plan?.trialEligible ?? false,
    isDemo: plan?.isDemo ?? false,
  };
}

/**
 * One modal for both create and edit — four short hero-style steps instead of
 * one long scroll.
 *
 * `plan === null` means create; a row means edit. `open` drives the overlay so the
 * modal is always mounted and HeroUI can run its enter/exit transition.
 */
function PlanFormModal({
  open,
  plan,
  onClose,
  onSaved,
}: {
  open: boolean;
  plan: PlanRow | null;
  onClose: () => void;
  onSaved: (message: string) => Promise<void> | void;
}) {
  const { t } = useI18n();
  const overlay = useOverlayState({ isOpen: open, onOpenChange: (next) => (!next ? onClose() : undefined) });
  const [done, setDone] = useState(false);
  const [step, setStep] = useState<PlanFormStep>("identity");
  const [stepError, setStepError] = useState<string | null>(null);
  const [values, setValues] = useState<PlanFormValues>(() => planFormValuesFrom(plan));
  /**
   * The plan version's feature configuration, held as one draft.
   *
   * It is state rather than form fields because it is nested JSON: the feature
   * editor writes whole objects (`setPlacement`), which `FormData` cannot express.
   */
  const [draft, setDraft] = useState<PlanDraft>(() => planDraftFrom(plan));

  const save = useAction(async () => {
    const payload = {
      code: values.code.trim().toLowerCase(),
      name: values.name.trim(),
      description: values.description.trim(),
      priceTzs: values.priceTzs,
      periodDays: toInt(values.periodDays),
      trialEligible: values.trialEligible,
      trialDays: toInt(values.trialDays),
      isDemo: values.isDemo,
      // The feature payload owns the limits, so the legacy columns are left out
      // and cannot drift away from what the portal actually enforces.
      features: draft.features,
      commercialPromise: draft.commercialPromise,
      lifecycle: draft.lifecycle,
    };
    if (plan) {
      await api.put(`/admin/plans/${plan.id}`, payload);
      await onSaved(t("admin.plans.form.successEdit"));
    } else {
      await api.post("/admin/plans", payload);
      await onSaved(t("admin.plans.form.successCreate"));
    }
    setDone(true);
  });

  const resetError = save.setError;
  const planId = plan?.id;
  // Reopening (or switching plan) must not show the previous run's result, error
  // or feature draft. Keyed on the id so a background reload cannot clobber an edit.
  useEffect(() => {
    if (open) {
      setDone(false);
      setStep("identity");
      setStepError(null);
      resetError(null);
      setValues(planFormValuesFrom(plan));
      setDraft(planDraftFrom(plan));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, planId, resetError]);

  function close() {
    setDone(false);
    setStep("identity");
    setStepError(null);
    save.setError(null);
    onClose();
  }

  function patch<K extends keyof PlanFormValues>(key: K, value: PlanFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setStepError(null);
  }

  function validateStep(current: PlanFormStep): string | null {
    if (current === "identity") {
      const code = values.code.trim();
      if (!code) return t("admin.plans.form.code");
      if (!/^[a-zA-Z0-9-]+$/.test(code)) return t("admin.plans.form.codeHint");
      if (!values.name.trim()) return t("admin.plans.form.name");
      return null;
    }
    if (current === "pricing") {
      const price = Number(values.priceTzs);
      const days = Number(values.periodDays);
      if (!Number.isFinite(price) || price < 1) return t("admin.plans.form.priceHint");
      if (!Number.isFinite(days) || days < 1 || days > 366) return t("admin.plans.form.periodDaysHint");
      return null;
    }
    if (current === "features") {
      const issues = planIssues(draft.features, draft.commercialPromise);
      return issues[0]?.message ?? null;
    }
    if (values.trialEligible) {
      const days = Number(values.trialDays);
      if (!Number.isFinite(days) || days < 1 || days > 90) return t("admin.plans.form.trialDaysHint");
    }
    return null;
  }

  function goNext() {
    const error = validateStep(step);
    if (error) {
      setStepError(error);
      return;
    }
    const index = PLAN_FORM_STEPS.indexOf(step);
    if (index < PLAN_FORM_STEPS.length - 1) {
      setStepError(null);
      setStep(PLAN_FORM_STEPS[index + 1]!);
    }
  }

  function goBack() {
    const index = PLAN_FORM_STEPS.indexOf(step);
    if (index > 0) {
      setStepError(null);
      setStep(PLAN_FORM_STEPS[index - 1]!);
    }
  }

  async function submit() {
    const error = validateStep("launch");
    if (error) {
      setStepError(error);
      return;
    }
    await save.run();
  }

  // A live plan with subscribers cannot be rewritten in place, so say so before saving.
  const willVersion = plan !== null && references(plan) > 0;
  const title = plan
    ? t("admin.plans.form.titleEdit", { name: plan.name })
    : t("admin.plans.form.titleCreate");
  const stepIndex = PLAN_FORM_STEPS.indexOf(step);
  const progressPct = (stepIndex / (PLAN_FORM_STEPS.length - 1)) * 100;
  const pricePreview = Number(values.priceTzs);
  const periodPreview = Number(values.periodDays);

  return (
    <Modal.Root state={overlay}>
      <Modal.Backdrop>
        <Modal.Container size="lg">
          <Modal.Dialog className="max-h-[92vh] overflow-hidden !bg-white !text-[#18212F] [color-scheme:light]">
            <Modal.Header className="relative overflow-hidden !bg-white border-b border-[#DFE5EC] pb-4">
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-1.5"
                style={{ background: "linear-gradient(90deg, #1B5EA4 0%, #FBA102 50%, #F16304 100%)" }}
              />
              <div className="space-y-1 pt-1">
                <p className="inline-flex items-center gap-1.5 rounded-full bg-[#1B5EA4]/10 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-[#1B5EA4] uppercase">
                  <Sparkles className="size-3 text-[#FBA102]" />
                  {t("admin.plans.form.step.of", { current: stepIndex + 1, total: PLAN_FORM_STEPS.length })}
                </p>
                <Modal.Heading className="!text-xl font-black tracking-tight !text-[#18212F]">{title}</Modal.Heading>
                <p className="text-xs leading-relaxed text-[#526174]">
                  {plan ? t("admin.plans.form.descriptionEdit") : t("admin.plans.form.descriptionCreate")}
                </p>
              </div>
            </Modal.Header>
            <Modal.Body className="overflow-y-auto !bg-white">
              {done ? (
                <div className="space-y-4 py-2">
                  <Notice tone="success">
                    {plan ? t("admin.plans.form.successEdit") : t("admin.plans.form.successCreate")}
                  </Notice>
                  <div className="flex justify-end border-t border-[var(--advo-border)] pt-4">
                    <Button onPress={close} type="button" variant="primary">
                      {t("admin.plans.form.done")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-5" key={plan?.id ?? "create"}>
                  {/* Step progress — same language as the registration hero */}
                  <div className="rounded-2xl border border-[#DFE5EC] bg-[#F7F9FC] p-4">
                    <div className="relative flex items-center justify-between">
                      <div className="absolute top-4 right-6 left-6 -z-0 h-0.5 bg-[#DFE5EC]" />
                      <div
                        className="absolute top-4 left-6 -z-0 h-0.5 bg-[#1B5EA4] transition-all duration-300"
                        style={{ width: `calc(${progressPct}% - 0px)` }}
                      />
                      {PLAN_FORM_STEPS.map((key, index) => {
                        const active = index === stepIndex;
                        const complete = index < stepIndex;
                        const last = index === PLAN_FORM_STEPS.length - 1;
                        return (
                          <div className="relative z-10 flex flex-col items-center" key={key}>
                            <div
                              className={`flex size-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                                complete
                                  ? "bg-[#1B5EA4] text-white shadow-md ring-4 ring-blue-50"
                                  : active && last
                                    ? "text-[#111213] shadow-md ring-4 ring-amber-50"
                                    : active
                                      ? "bg-[#1B5EA4] text-white shadow-md ring-4 ring-blue-50"
                                      : "bg-slate-200 text-slate-500"
                              }`}
                              style={
                                active && last
                                  ? { background: "linear-gradient(135deg, #FBA102 0%, #F16304 100%)" }
                                  : undefined
                              }
                            >
                              {complete ? <CheckCircle2 className="size-4 text-white" /> : index + 1}
                            </div>
                            <span
                              className={`mt-1.5 text-[10px] font-bold ${
                                active ? (last ? "text-[#F16304]" : "text-[#1B5EA4]") : "text-[#18212F]"
                              }`}
                            >
                              {t(PLAN_STEP_LABEL[key])}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-sm font-black tracking-tight text-[#18212F]">{t(PLAN_STEP_LABEL[step])}</h3>
                    <p className="text-xs text-[#526174]">{t(PLAN_STEP_LEAD[step])}</p>
                  </div>

                  {step === "identity" ? (
                    <div className="animate-in fade-in slide-in-from-right-4 space-y-4 duration-200">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <SmartField
                          hint={t("admin.plans.form.codeHint")}
                          icon={<Hash />}
                          label={t("admin.plans.form.code")}
                          mono
                          onChange={(v) => patch("code", v)}
                          placeholder={t("admin.plans.form.codePlaceholder")}
                          value={values.code}
                        />
                        <SmartField
                          icon={<Tag />}
                          label={t("admin.plans.form.name")}
                          onChange={(v) => patch("name", v)}
                          placeholder={t("admin.plans.form.namePlaceholder")}
                          value={values.name}
                        />
                      </div>
                      <SmartField
                        hint={t("admin.plans.form.descriptionHint")}
                        icon={<FileText />}
                        label={t("admin.plans.form.descriptionLabel")}
                        maxLength={200}
                        onChange={(v) => patch("description", v)}
                        value={values.description}
                      />
                    </div>
                  ) : null}

                  {step === "pricing" ? (
                    <div className="animate-in fade-in slide-in-from-right-4 space-y-4 duration-200">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <SmartField
                          hint={t("admin.plans.form.priceHint")}
                          icon={<Coins />}
                          label={t("admin.plans.form.price")}
                          min={1}
                          onChange={(v) => patch("priceTzs", v)}
                          type="number"
                          value={values.priceTzs}
                        />
                        <SmartField
                          hint={t("admin.plans.form.periodDaysHint")}
                          icon={<CalendarClock />}
                          label={t("admin.plans.form.periodDays")}
                          max={366}
                          min={1}
                          onChange={(v) => patch("periodDays", v)}
                          type="number"
                          value={values.periodDays}
                        />
                      </div>
                      <div className="overflow-hidden rounded-2xl border border-[#DFE5EC] bg-gradient-to-br from-[#F7F9FC] via-white to-[#FFF8EE] p-4">
                        <p className="text-[10px] font-bold tracking-wider text-[#526174] uppercase">
                          {t("admin.plans.form.previewTitle")}
                        </p>
                        <p className="mt-1 truncate text-lg font-black tracking-tight text-[#18212F]">
                          {values.name.trim() || t("admin.plans.form.namePlaceholder")}
                        </p>
                        <p className="mt-2 text-2xl font-black tabular-nums text-[#1B5EA4]">
                          {Number.isFinite(pricePreview) && pricePreview > 0 && Number.isFinite(periodPreview) && periodPreview > 0
                            ? t("admin.plans.perPeriod", {
                                price: formatTzs(String(Math.round(pricePreview))),
                                days: Math.round(periodPreview),
                              })
                            : "—"}
                        </p>
                        {values.code.trim() ? (
                          <p className="mt-1 font-mono text-[11px] text-[#526174]">{values.code.trim().toLowerCase()}</p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {step === "features" ? (
                    <div className="animate-in fade-in slide-in-from-right-4 space-y-3 duration-200">
                      <PlanFeatureEditor draft={draft} onChange={setDraft} />
                    </div>
                  ) : null}

                  {step === "launch" ? (
                    <div className="animate-in fade-in slide-in-from-right-4 space-y-4 duration-200">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <SmartField
                          hint={t("admin.plans.form.trialDaysHint")}
                          icon={<Sparkles />}
                          label={t("admin.plans.form.trialDays")}
                          max={90}
                          min={1}
                          onChange={(v) => patch("trialDays", v)}
                          type="number"
                          value={values.trialDays}
                        />
                        <div className="flex flex-col justify-center gap-3 sm:pt-6">
                          <SmartToggle
                            checked={values.trialEligible}
                            label={t("admin.plans.form.trialEligible")}
                            onChange={(checked) => patch("trialEligible", checked)}
                          />
                          <SmartToggle
                            checked={values.isDemo}
                            label={t("admin.plans.form.isDemo")}
                            onChange={(checked) => patch("isDemo", checked)}
                          />
                          <p className="text-[11px] text-advo-muted">{t("admin.plans.form.isDemoHint")}</p>
                        </div>
                      </div>
                      <Notice tone={willVersion ? "warning" : "accent"}>
                        {willVersion && plan
                          ? t("admin.plans.form.willVersion", { count: references(plan) })
                          : t("admin.plans.form.willReplace")}
                      </Notice>
                    </div>
                  ) : null}

                  {stepError ? <Notice tone="danger">{stepError}</Notice> : null}
                  {save.error ? <Notice tone="danger">{save.error}</Notice> : null}

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--advo-border)] pt-4">
                    <div className="flex flex-wrap gap-2">
                      {stepIndex > 0 ? (
                        <Button onPress={goBack} type="button" variant="ghost">
                          <ChevronLeft className="size-4" />
                          {t("admin.plans.form.step.back")}
                        </Button>
                      ) : (
                        <Button onPress={close} type="button" variant="ghost">
                          {t("admin.plans.form.cancel")}
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {stepIndex > 0 ? (
                        <Button className="sm:hidden" onPress={close} type="button" variant="ghost">
                          {t("admin.plans.form.cancel")}
                        </Button>
                      ) : null}
                      {step === "launch" ? (
                        <Button isDisabled={save.pending} onPress={() => void submit()} type="button" variant="primary">
                          {plan ? <Pencil className="size-4" /> : <Plus className="size-4" />}
                          {save.pending ? "…" : plan ? t("admin.plans.form.submitEdit") : t("admin.plans.form.submitCreate")}
                        </Button>
                      ) : (
                        <Button onPress={goNext} type="button" variant="primary">
                          {t("admin.plans.form.step.next")}
                          <ArrowRight className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </Modal.Body>
            <Modal.CloseTrigger aria-label={t("admin.plans.form.cancel")} />
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}

/** Register-style labelled input with a leading icon. */
function SmartField({
  label,
  hint,
  icon,
  value,
  onChange,
  placeholder,
  type = "text",
  mono,
  min,
  max,
  maxLength,
}: {
  label: string;
  hint?: string;
  icon: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "number";
  mono?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-bold tracking-wide text-[#18212F] uppercase">{label}</label>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#526174] [&_svg]:size-4">
          {icon}
        </div>
        <input
          className={`w-full rounded-field border border-[#DFE5EC] bg-[#F7F9FC] py-3 pr-3.5 pl-10 text-xs text-[#18212F] outline-none transition focus:border-[#1B5EA4] focus:bg-white focus:ring-2 focus:ring-[#1B5EA4]/20 ${
            mono ? "font-mono" : ""
          }`}
          max={max}
          maxLength={maxLength}
          min={min}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          type={type}
          value={value}
        />
      </div>
      {hint ? <p className="text-[11px] leading-snug text-[#526174]">{hint}</p> : null}
    </div>
  );
}

/** Large tap target toggle used on the launch step. */
function SmartToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      aria-pressed={checked}
      className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
        checked
          ? "border-[#1B5EA4]/30 bg-[#1B5EA4]/8 text-[#18212F]"
          : "border-[#DFE5EC] bg-[#F7F9FC] text-[#526174] hover:border-[#1B5EA4]/20"
      }`}
      onClick={() => onChange(!checked)}
      type="button"
    >
      <span className="text-sm font-semibold">{label}</span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${
          checked ? "bg-[#1B5EA4]" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </span>
    </button>
  );
}

/* ───────────────── Archive / reactivate / delete dialog ───────────────── */

/**
 * Plan actions mapped onto the shared audited-reason dialog.
 *
 * Archive and reactivate are reversible, delete is not — so delete gets the danger
 * treatment while the other two stay neutral. The reason is never sent as less than
 * three characters: the API rejects shorter ones anyway.
 */
function PlanReasonDialog({
  target,
  onClose,
  onDone,
}: {
  target: { kind: "archive" | "reactivate" | "delete" | "publish"; plan: PlanRow } | null;
  onClose: () => void;
  onDone: (message: string) => Promise<void> | void;
}) {
  const { t } = useI18n();
  const plan = target?.plan;
  const name = plan?.name ?? "";

  // The verb doubles as the flash message, so the four actions cannot drift apart.
  const verb =
    target?.kind === "delete"
      ? t("admin.plans.action.delete")
      : target?.kind === "reactivate"
        ? t("admin.plans.action.reactivate")
        : target?.kind === "publish"
          ? t("admin.plans.action.publish")
          : t("admin.plans.action.archive");

  return (
    <ReasonDialog
      labels={{
        title:
          target?.kind === "delete"
            ? t("admin.plans.dialog.deleteTitle", { name })
            : target?.kind === "reactivate"
              ? t("admin.plans.dialog.reactivateTitle", { name })
              : target?.kind === "publish"
                ? t("admin.plans.dialog.publishTitle", { name })
                : t("admin.plans.dialog.archiveTitle", { name }),
        note:
          target?.kind === "delete"
            ? t("admin.plans.dialog.deleteNote")
            : target?.kind === "reactivate"
              ? t("admin.plans.dialog.reactivateNote")
              : target?.kind === "publish"
                ? t("admin.plans.dialog.publishNote")
                : t("admin.plans.dialog.archiveNote"),
        reasonLabel: t("admin.plans.dialog.reason"),
        reasonPlaceholder: t("admin.plans.dialog.reasonPlaceholder"),
        reasonHint: t("admin.plans.dialog.reasonHint"),
        tooShort: t("admin.plans.dialog.reasonTooShort"),
        cancel: t("admin.plans.dialog.cancel"),
        confirm: t("admin.plans.dialog.confirm"),
      }}
      onClose={onClose}
      onSubmit={async (reason) => {
        if (!target || !plan) return;
        if (target.kind === "delete") {
          // The API client's `del` cannot carry a body, and the reason must be audited.
          await api.request(`/admin/plans/${plan.id}`, {
            method: "DELETE",
            body: JSON.stringify({ reason }),
          });
        } else if (target.kind === "publish") {
          // Publishing runs the same feature validator server-side; a refused publish
          // throws before anything becomes sellable.
          await api.post(`/admin/plans/${plan.id}/publish`, { reason });
          await onDone(t("admin.plans.publishSuccess", { name: plan.name, version: plan.version }));
          return;
        } else {
          await api.post(`/admin/plans/${plan.id}/active`, {
            active: target.kind === "reactivate",
            reason,
          });
        }
        await onDone(`${verb} — ${plan.name}`);
      }}
      open={target !== null}
      summary={
        plan ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--advo-border)] bg-advo-surface-soft/60 px-3.5 py-2.5">
            <div>
              <p className="text-sm font-black text-advo-text">{plan.name}</p>
              <p className="font-mono text-[10px] text-advo-muted">
                {plan.code} · {t("admin.plans.version", { version: plan.version })}
              </p>
            </div>
            <p className="text-sm font-bold text-advo-text tabular-nums">
              {t("admin.plans.perPeriod", { price: formatTzs(plan.priceTzs), days: plan.periodDays })}
            </p>
          </div>
        ) : null
      }
      tone={target?.kind === "delete" ? "danger" : "primary"}
    />
  );
}
