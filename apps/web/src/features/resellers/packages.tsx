"use client";

import { useMemo, useState, type ReactNode } from "react";
import { formatBytes, formatDuration, formatSpeed, formatTzs } from "@advo/api-client";
import { Card } from "@heroui/react";
import { AdvoTable } from "@advo/ui";
import { ActionButton } from "@/features/common/actions";
import { Mono, ResourceView } from "@/features/common/components";
import { useSiteScope } from "@/features/resellers/site-scope";
import { api, errorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAction, useResource } from "@/lib/hooks";
import {
  packageBodyFromDraft,
  draftFromRevision,
  PackageFormDrawer,
  type PackageDraft,
  type PackageFormSiteOptions,
} from "./package-form-drawer";
import {
  Package,
  Wifi,
  Zap,
  Clock,
  HardDrive,
  Smartphone,
  Plus,
  Edit3,
  List,
  Table2,
  Sparkles,
  MapPin,
  Archive,
  PauseCircle,
  Play,
  type LucideIcon,
} from "lucide-react";

type Revision = {
  id: string;
  revision: number;
  name: string;
  priceTzs: string;
  durationSeconds: number;
  downloadKbps: number | null;
  uploadKbps: number | null;
  quotaType: string;
  quotaBytes: string | null;
  maxDevices: number;
  activationWindowSeconds: number;
};
type PackageRow = {
  id: string;
  name: string;
  status: string;
  currentRevision: Revision | null;
  assignments: Array<{ site: { id: string; name: string } }>;
};
type SiteOption = { id: string; name: string; state: string };

/** A paused package is stored as `ARCHIVED` but is nothing like a deleted one. */
type PackageFilter = "active" | "paused" | "all";

export function ResellerPackagesScreen() {
  const { t } = useI18n();
  const { scoped } = useSiteScope();
  // Paused rows come back too — without them a pause would be a one-way door,
  // because the reseller could never see the package again to switch it back on.
  const packages = useResource<PackageRow[]>(scoped("/reseller/packages?includePaused=true"));
  const sites = useResource<SiteOption[]>("/reseller/sites");
  // Which caps each site can enforce; the form locks options the Controller would reject.
  const options = useResource<{ sites: PackageFormSiteOptions[] }>("/reseller/package-options");
  const [editing, setEditing] = useState<PackageRow | null>(null);
  const [viewMode, setViewMode] = useState<"rows" | "table">("rows");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [filter, setFilter] = useState<PackageFilter>("active");

  const save = useAction(async (draft: PackageDraft) => {
    const body = packageBodyFromDraft(draft);
    if (editing) await api.put(`/reseller/packages/${editing.id}`, body);
    else await api.post("/reseller/packages", body);
    setEditing(null);
    setIsFormOpen(false);
  }, packages.reload);

  /**
   * The drawer seeds itself from this on open, so it must keep one identity for
   * as long as the drawer is open — otherwise every keystroke would be reset by
   * the seeding effect.
   */
  const initialDraft = useMemo(
    () =>
      draftFromRevision(
        editing?.currentRevision ?? null,
        editing?.assignments.map((a) => a.site.id) ?? [],
      ),
    [editing],
  );

  const openCreate = () => {
    save.setError(null);
    setEditing(null);
    setIsFormOpen(true);
  };

  const openEdit = (row: PackageRow) => {
    save.setError(null);
    setEditing(row);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setEditing(null);
    setIsFormOpen(false);
  };

  /**
   * Pause or resume. Kept as a plain promise so each row can own its busy state
   * and show its own error — a single shared pending flag would grey out every
   * row and blame the wrong one.
   */
  const setStatus = async (row: PackageRow, status: "ACTIVE" | "ARCHIVED") => {
    await api.patch(`/reseller/packages/${row.id}/status`, { status });
    await packages.reload();
  };

  const allPackages = packages.data ?? [];
  const selling = allPackages.filter((p) => p.status === "ACTIVE");
  const pausedCount = allPackages.length - selling.length;
  const visible = allPackages.filter((p) =>
    filter === "all" ? true : filter === "active" ? p.status === "ACTIVE" : p.status !== "ACTIVE",
  );

  /**
   * The headline figures describe what guests can buy right now, so they are
   * computed from sellable packages only — a paused tariff must not raise the
   * average price or claim the top speed.
   */
  const totalPackages = selling.length;
  const avgPrice =
    totalPackages > 0
      ? Math.round(
          selling.reduce((acc, p) => acc + (Number(p.currentRevision?.priceTzs) || 0), 0) / totalPackages,
        )
      : 0;
  const maxDownloadMbps = selling.reduce((max, p) => {
    const kbps = p.currentRevision?.downloadKbps ?? 0;
    return Math.max(max, Math.round(kbps / 1024));
  }, 0);
  const unlimitedCount = selling.filter((p) => p.currentRevision?.quotaType === "UNLIMITED").length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-advo-blue/10 px-2.5 py-0.5 text-xs font-semibold text-advo-blue">
              <Wifi className="h-3.5 w-3.5" />
              {t("reseller.packages.badge")}
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs font-medium text-slate-500">{t("reseller.packages.sync")}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-advo-text sm:text-3xl">
            {t("nav.packages")}
          </h1>
          <p className="mt-1 text-sm text-advo-muted">{t("reseller.packages.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-advo-blue px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-advo-blue-hover active:scale-95"
          >
            <Plus className="h-4 w-4" />
            {t("reseller.packages.action.new")}
          </button>
        </div>
      </div>

      {/* Package KPI stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t("reseller.packages.kpi.activePlans")}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-advo-blue">
              <Package className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-advo-text">{totalPackages}</div>
          <p className="mt-1 text-xs text-slate-500">{t("reseller.packages.kpi.activePlansHint")}</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t("reseller.packages.kpi.averagePrice")}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-advo-gold">
              <Sparkles className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-advo-text">
            {totalPackages > 0 ? formatTzs(avgPrice) : "—"}
          </div>
          <p className="mt-1 text-xs text-slate-500">{t("reseller.packages.kpi.averagePriceHint")}</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t("reseller.packages.kpi.maxSpeed")}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Zap className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-advo-text">
            {totalPackages === 0
              ? "—"
              : maxDownloadMbps > 0
                ? `${maxDownloadMbps} Mbps`
                : t("reseller.packages.kpi.uncapped")}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {totalPackages === 0
              ? t("reseller.packages.kpi.maxSpeedNoPackages")
              : t("reseller.packages.kpi.maxSpeedHint")}
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t("reseller.packages.kpi.unlimitedPlans")}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-50 text-advo-orange">
              <HardDrive className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-advo-text">{unlimitedCount}</div>
          <p className="mt-1 text-xs text-slate-500">{t("reseller.packages.kpi.unlimitedPlansHint")}</p>
        </Card>
      </div>

      {/* The create/edit form, as a popup rather than a block on the page. */}
      <PackageFormDrawer
        editingName={editing?.name ?? null}
        editingRevision={editing?.currentRevision ?? null}
        error={save.error}
        initialDraft={initialDraft}
        onClose={closeForm}
        onSubmit={(draft) => void save.run(draft)}
        open={isFormOpen}
        pending={save.pending}
        sites={(sites.data ?? []).map((site) => ({ id: site.id, name: site.name, state: site.state }))}
        siteOptions={options.data?.sites ?? []}
        siteOptionsError={options.error?.message ?? null}
        sitesError={sites.error?.message ?? null}
        sitesLoading={sites.loading}
      />

      {/* Package Display Header with View Switcher */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-advo-text">{t("reseller.packages.list.title")}</h2>
          <p className="text-xs text-slate-500">{t("reseller.packages.list.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Paused packages are only interesting when you go looking for them. */}
          <div className="flex items-center rounded-xl border border-advo-border bg-white p-1 shadow-sm">
            <FilterTab active={filter === "active"} onPress={() => setFilter("active")}>
              {t("reseller.packages.filter.active")}
              <span className="tabular-nums opacity-70">{selling.length}</span>
            </FilterTab>
            <FilterTab active={filter === "paused"} onPress={() => setFilter("paused")}>
              {t("reseller.packages.filter.paused")}
              <span className="tabular-nums opacity-70">{pausedCount}</span>
            </FilterTab>
            <FilterTab active={filter === "all"} onPress={() => setFilter("all")}>
              {t("reseller.packages.filter.all")}
              <span className="tabular-nums opacity-70">{allPackages.length}</span>
            </FilterTab>
          </div>
          <div className="flex items-center rounded-xl border border-advo-border bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setViewMode("rows")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                viewMode === "rows" ? "bg-advo-blue text-white" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <List className="h-3.5 w-3.5" />
              {t("reseller.packages.view.cards")}
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                viewMode === "table" ? "bg-advo-blue text-white" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Table2 className="h-3.5 w-3.5" />
              {t("reseller.packages.view.table")}
            </button>
          </div>
        </div>
      </div>

      {/* Horizontal rows or table */}
      <ResourceView resource={packages}>
        {(rows) => {
          if (rows.length === 0) {
            return (
              <Card className="border-dashed p-12 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50 text-advo-blue">
                  <Package className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-base font-bold text-advo-text">{t("reseller.packages.empty.title")}</h3>
                <p className="mt-1 text-sm text-slate-500">{t("reseller.packages.empty.body")}</p>
                <button
                  type="button"
                  onClick={openCreate}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-advo-blue px-4 py-2 text-sm font-semibold text-white shadow hover:bg-advo-blue-hover"
                >
                  <Plus className="h-4 w-4" />
                  {t("reseller.packages.empty.cta")}
                </button>
              </Card>
            );
          }

          if (visible.length === 0) {
            return (
              <Card className="border-dashed p-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                  <PauseCircle className="h-6 w-6" />
                </div>
                <h3 className="mt-3 text-sm font-bold text-advo-text">{t("reseller.packages.filter.emptyTitle")}</h3>
                <p className="mt-1 text-xs text-slate-500">{t("reseller.packages.filter.emptyBody")}</p>
                <button
                  type="button"
                  onClick={() => setFilter(filter === "paused" ? "active" : "all")}
                  className="mt-4 text-xs font-semibold text-advo-blue hover:underline"
                >
                  {t("reseller.packages.filter.showAll")}
                </button>
              </Card>
            );
          }

          if (viewMode === "rows") {
            return (
              <div className="flex flex-col gap-2.5">
                {visible.map((p) => (
                  <PackageDetailRow
                    key={p.id}
                    onArchive={() => api.del(`/reseller/packages/${p.id}`)}
                    onArchived={packages.reload}
                    onEdit={() => openEdit(p)}
                    onSetStatus={(next) => setStatus(p, next)}
                    pkg={p}
                    t={t}
                  />
                ))}
              </div>
            );
          }

          // Table View fallback
          return (
            <Card className="overflow-hidden">
              <AdvoTable
                label={t("reseller.packages.tableLabel")}
                rows={visible}
                rowKey={(p) => p.id}
                empty={t("reseller.packages.table.empty")}
                columns={[
                  {
                    key: "n",
                    header: t("reseller.packages.col.package"),
                    render: (p) => (
                      <div>
                        <p className="font-bold text-advo-text">{p.currentRevision?.name ?? p.name}</p>
                        <Mono>rev {p.currentRevision?.revision}</Mono>
                      </div>
                    ),
                  },
                  {
                    key: "p",
                    header: t("reseller.packages.col.price"),
                    render: (p) => (
                      <span className="font-semibold text-emerald-700">
                        {formatTzs(p.currentRevision?.priceTzs)}
                      </span>
                    ),
                    className: "text-right",
                  },
                  {
                    key: "d",
                    header: t("reseller.packages.col.duration"),
                    render: (p) => (p.currentRevision ? formatDuration(p.currentRevision.durationSeconds) : "—"),
                  },
                  {
                    key: "l",
                    header: t("reseller.packages.col.limits"),
                    render: (p) =>
                      p.currentRevision ? (
                        <div className="text-xs text-slate-600">
                          <div>
                            ↓ {formatSpeed(p.currentRevision.downloadKbps)} · ↑{" "}
                            {formatSpeed(p.currentRevision.uploadKbps)}
                          </div>
                          <div className="text-slate-400">
                            {p.currentRevision.quotaType === "UNLIMITED"
                              ? t("reseller.packages.card.unlimitedData")
                              : `${formatBytes(p.currentRevision.quotaBytes)} ${p.currentRevision.quotaType.toLowerCase()}`}{" "}
                            · {t("reseller.packages.col.devices", { count: p.currentRevision.maxDevices })}
                          </div>
                        </div>
                      ) : null,
                  },
                  {
                    key: "s",
                    header: t("reseller.packages.col.sites"),
                    render: (p) =>
                      p.assignments.map((a) => a.site.name).join(", ") || (
                        <span className="text-advo-gold">{t("reseller.packages.notAssigned")}</span>
                      ),
                  },
                  {
                    key: "st",
                    header: t("reseller.packages.col.status"),
                    render: (p) =>
                      p.status === "ACTIVE" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          {t("reseller.packages.card.live")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                          <PauseCircle className="h-3 w-3" />
                          {t("reseller.packages.card.paused")}
                        </span>
                      ),
                  },
                  {
                    key: "a",
                    header: "",
                    render: (p) => (
                      <div className="flex gap-2">
                        <ActionButton onRun={async () => openEdit(p)}>
                          {t("reseller.packages.card.edit")}
                        </ActionButton>
                        <ActionButton
                          onRun={() => setStatus(p, p.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE")}
                        >
                          {p.status === "ACTIVE"
                            ? t("reseller.packages.card.pause")
                            : t("reseller.packages.card.resume")}
                        </ActionButton>
                        <ActionButton
                          variant="danger"
                          confirm={t("reseller.packages.card.archiveConfirm")}
                          onRun={() => api.del(`/reseller/packages/${p.id}`)}
                          onDone={packages.reload}
                        >
                          {t("reseller.packages.card.archive")}
                        </ActionButton>
                      </div>
                    ),
                  },
                ]}
              />
            </Card>
          );
        }}
      </ResourceView>
    </div>
  );
}

type Translate = ReturnType<typeof useI18n>["t"];

/** Horizontal detail row — package facts left, edit/pause/archive pinned far right. */
function PackageDetailRow({
  pkg,
  t,
  onEdit,
  onArchive,
  onArchived,
  onSetStatus,
}: {
  pkg: PackageRow;
  t: Translate;
  onEdit: () => void;
  onArchive: () => Promise<unknown>;
  onArchived: () => void | Promise<void>;
  onSetStatus: (status: "ACTIVE" | "ARCHIVED") => Promise<unknown>;
}) {
  const [busy, setBusy] = useState<"archive" | "status" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const paused = pkg.status !== "ACTIVE";
  const r = pkg.currentRevision;
  const title = r?.name ?? pkg.name;
  const speed = r?.downloadKbps
    ? `↓ ${formatSpeed(r.downloadKbps)} · ↑ ${formatSpeed(r.uploadKbps)}`
    : t("reseller.packages.card.unthrottled");
  const quota =
    r?.quotaType === "UNLIMITED"
      ? t("reseller.packages.card.unlimitedData")
      : r
        ? `${formatBytes(r.quotaBytes)} ${r.quotaType.toLowerCase()}`
        : "—";

  async function archive() {
    if (!window.confirm(t("reseller.packages.card.archiveConfirm"))) return;
    setBusy("archive");
    setError(null);
    try {
      await onArchive();
      await onArchived();
    } catch (err) {
      // A refused archive (an open voucher group, a plan limit) must say why.
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function toggleStatus() {
    setBusy("status");
    setError(null);
    try {
      await onSetStatus(paused ? "ACTIVE" : "ARCHIVED");
    } catch (err) {
      // The usual refusal is the plan's package allowance, which the reseller
      // can only fix by pausing something else — so the message must survive.
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card
      className={`overflow-hidden p-0 transition-shadow hover:shadow-advo-lift ${
        paused ? "border-amber-200/70 bg-amber-50/25" : ""
      }`}
    >
      <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ring-1 ${
              paused
                ? "bg-amber-100/70 text-amber-600 ring-amber-200"
                : "bg-advo-blue/10 text-advo-blue ring-advo-blue/20"
            }`}
          >
            <Package className="h-5 w-5" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3
                className={`truncate text-sm font-black tracking-tight ${paused ? "text-slate-500" : "text-advo-text"}`}
                title={title}
              >
                {title}
              </h3>
              {paused ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                  <PauseCircle className="h-3 w-3" />
                  {t("reseller.packages.card.paused")}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-advo-blue">
                <Clock className="h-3 w-3" />
                {r ? formatDuration(r.durationSeconds) : t("reseller.packages.card.custom")}
              </span>
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600">
                rev {r?.revision ?? 1}
              </span>
            </div>

            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-base font-extrabold tracking-tight text-advo-text">
                {formatTzs(r?.priceTzs)}
              </span>
              <span className="text-[11px] text-advo-muted">{t("reseller.packages.card.perVoucher")}</span>
            </div>

            <dl className="mt-2 flex flex-wrap gap-1.5">
              <FactChip icon={Zap} label={t("reseller.packages.card.speedLimit")} value={speed} />
              <FactChip icon={HardDrive} label={t("reseller.packages.card.dataQuota")} value={quota} />
              <FactChip
                icon={Smartphone}
                label={t("reseller.packages.card.deviceLimit")}
                value={t("reseller.packages.card.devices", { count: r?.maxDevices ?? 1 })}
              />
              {pkg.assignments.length > 0 ? (
                pkg.assignments.slice(0, 3).map((a) => (
                  <span
                    className="inline-flex items-center gap-1 rounded-lg border border-advo-border/70 bg-advo-page px-2 py-1 text-[10px] font-bold text-advo-text"
                    key={a.site.id}
                    title={a.site.name}
                  >
                    <MapPin className="h-3 w-3 text-slate-400" />
                    <span className="max-w-[8rem] truncate">{a.site.name}</span>
                  </span>
                ))
              ) : (
                <span className="inline-flex items-center gap-1 rounded-lg border border-dashed border-advo-gold/40 bg-advo-gold-soft/40 px-2 py-1 text-[10px] font-semibold text-[#b15f00]">
                  <MapPin className="h-3 w-3" />
                  {t("reseller.packages.card.notAssigned")}
                </span>
              )}
            </dl>

            {paused ? (
              <p className="mt-1.5 text-[11px] font-medium text-amber-700">
                {t("reseller.packages.card.pausedNote")}
              </p>
            ) : null}
            {error ? (
              <p className="mt-1.5 max-w-prose text-[11px] font-semibold text-[var(--advo-danger)]">{error}</p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-1 border-t border-advo-border/60 pt-2.5 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-3">
          <RowIconButton
            icon={Edit3}
            label={t("reseller.packages.card.edit")}
            onPress={onEdit}
          />
          <RowIconButton
            disabled={busy !== null}
            icon={paused ? Play : PauseCircle}
            label={paused ? t("reseller.packages.card.resume") : t("reseller.packages.card.pause")}
            onPress={() => void toggleStatus()}
            tone={paused ? "success" : "warn"}
          />
          <RowIconButton
            disabled={busy !== null}
            icon={Archive}
            label={t("reseller.packages.card.archive")}
            onPress={() => void archive()}
            tone="danger"
          />
        </div>
      </div>
    </Card>
  );
}

function FactChip({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-advo-border/70 bg-advo-page px-2 py-1">
      <Icon className="h-3 w-3 shrink-0 text-advo-muted" aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <span className="truncate text-[10px] font-bold text-advo-text" title={`${label}: ${value}`}>
        {value}
      </span>
    </span>
  );
}

const ROW_ICON_TONES = {
  default: "text-advo-muted hover:bg-advo-page hover:text-advo-text",
  danger: "text-rose-500 hover:bg-rose-50 hover:text-rose-600",
  /** Hide from portal — a state change, so it reads as a caution not a delete. */
  warn: "text-amber-600 hover:bg-amber-50 hover:text-amber-700",
  /** Show on portal again — the package returns to sale. */
  success: "text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700",
} as const;

function RowIconButton({
  icon: Icon,
  label,
  onPress,
  tone = "default",
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  tone?: keyof typeof ROW_ICON_TONES;
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={label}
      className={`grid size-9 place-items-center rounded-xl transition disabled:opacity-50 ${ROW_ICON_TONES[tone]}`}
      disabled={disabled}
      onClick={onPress}
      title={label}
      type="button"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

/** A count-carrying pill in the Active / Paused / All switch above the list. */
function FilterTab({
  active,
  onPress,
  children,
}: {
  active: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <button
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
        active ? "bg-advo-blue text-white" : "text-slate-600 hover:text-slate-900"
      }`}
      onClick={onPress}
      type="button"
    >
      {children}
    </button>
  );
}

