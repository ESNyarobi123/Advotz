"use client";

import { useState } from "react";
import { formatBytes, formatDuration, formatSpeed, formatTzs } from "@advo/api-client";
import { Button, Card } from "@heroui/react";
import { AdvoTable, Notice } from "@advo/ui";
import { ActionButton } from "@/features/common/actions";
import { Field, Mono, ResourceView, SelectField } from "@/features/common/components";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formValues, toInt, useAction, useResource } from "@/lib/hooks";
import {
  Package,
  Wifi,
  Zap,
  Clock,
  HardDrive,
  Smartphone,
  Plus,
  Edit3,
  LayoutGrid,
  List,
  Sparkles,
  MapPin,
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

/**
 * Standard durations. Keys rather than labels, so the option text is resolved
 * in the active language at render time.
 */
const DURATION_OPTIONS = [
  { value: "3600", key: "reseller.packages.duration.1h" },
  { value: "10800", key: "reseller.packages.duration.3h" },
  { value: "21600", key: "reseller.packages.duration.6h" },
  { value: "86400", key: "reseller.packages.duration.1d" },
  { value: "604800", key: "reseller.packages.duration.7d" },
  { value: "2592000", key: "reseller.packages.duration.30d" },
] as const;

export function ResellerPackagesScreen() {
  const { t } = useI18n();
  const durations = DURATION_OPTIONS.map((option) => ({ value: option.value, label: t(option.key) }));
  const packages = useResource<PackageRow[]>("/reseller/packages");
  const sites = useResource<SiteOption[]>("/reseller/sites");
  const [editing, setEditing] = useState<PackageRow | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [isFormOpen, setIsFormOpen] = useState(false);

  const save = useAction(async (form: HTMLFormElement) => {
    const v = formValues(form);
    const siteIds = new FormData(form).getAll("siteIds").map(String);
    const quotaGb = v.quotaGb ? Number(v.quotaGb) : undefined;
    const body = {
      name: v.name,
      priceTzs: v.priceTzs,
      durationSeconds: toInt(v.customMinutes) ? toInt(v.customMinutes)! * 60 : toInt(v.durationSeconds),
      downloadKbps: v.downloadMbps ? Math.round(Number(v.downloadMbps) * 1024) : undefined,
      uploadKbps: v.uploadMbps ? Math.round(Number(v.uploadMbps) * 1024) : undefined,
      quotaType: v.quotaType ?? "UNLIMITED",
      quotaBytes: quotaGb ? String(Math.round(quotaGb * 1024 ** 3)) : undefined,
      maxDevices: toInt(v.maxDevices) ?? 1,
      siteIds,
    };
    if (editing) await api.put(`/reseller/packages/${editing.id}`, body);
    else await api.post("/reseller/packages", body);
    form.reset();
    setEditing(null);
    setIsFormOpen(false);
  }, packages.reload);

  const rev = editing?.currentRevision;
  const assigned = new Set(editing?.assignments.map((a) => a.site.id) ?? []);
  const packageList = packages.data ?? [];

  // Summary Metrics
  const totalPackages = packageList.length;
  const avgPrice = totalPackages > 0
    ? Math.round(
        packageList.reduce((acc, p) => acc + (Number(p.currentRevision?.priceTzs) || 0), 0) / totalPackages
      )
    : 0;
  const maxDownloadMbps = packageList.reduce((max, p) => {
    const kbps = p.currentRevision?.downloadKbps ?? 0;
    return Math.max(max, Math.round(kbps / 1024));
  }, 0);
  const unlimitedCount = packageList.filter((p) => p.currentRevision?.quotaType === "UNLIMITED").length;

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
            onClick={() => {
              setEditing(null);
              setIsFormOpen(!isFormOpen);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-advo-blue px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-advo-blue-hover active:scale-95"
          >
            <Plus className="h-4 w-4" />
            {isFormOpen && !editing ? t("reseller.packages.action.closeCreator") : t("reseller.packages.action.new")}
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

      {/* Package form */}
      {(isFormOpen || editing) && (
        <Card className="p-6 ring-4 ring-advo-blue/5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-advo-blue/10 text-advo-blue">
                {editing ? <Edit3 className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              </div>
              <div>
                <h3 className="font-bold text-advo-text">
                  {editing
                    ? t("reseller.packages.form.editTitle", {
                        name: editing.name,
                        revision: (rev?.revision ?? 0) + 1,
                      })
                    : t("reseller.packages.form.createTitle")}
                </h3>
                <p className="text-xs text-slate-500">
                  {editing
                    ? t("reseller.packages.form.editHint")
                    : t("reseller.packages.form.createHint")}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setIsFormOpen(false);
              }}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              {t("reseller.packages.form.cancel")}
            </button>
          </div>

          <form
            key={editing?.id ?? "new"}
            className="mt-6 space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              void save.run(e.currentTarget);
            }}
          >
            <div className="grid gap-5 md:grid-cols-3">
              <Field
                name="name"
                label={t("reseller.packages.form.name")}
                defaultValue={rev?.name}
                placeholder={t("reseller.packages.form.namePlaceholder")}
                required
              />
              <Field
                name="priceTzs"
                label={t("reseller.packages.form.price")}
                type="number"
                min={500}
                defaultValue={rev?.priceTzs}
                hint={t("reseller.packages.form.priceHint")}
                required
              />
              <SelectField
                name="durationSeconds"
                label={t("reseller.packages.form.duration")}
                required
                defaultValue={String(rev?.durationSeconds ?? 3600)}
                options={durations}
              />
              <Field
                name="customMinutes"
                label={t("reseller.packages.form.customMinutes")}
                type="number"
                min={1}
                placeholder={t("reseller.packages.form.customMinutesPlaceholder")}
              />
              <Field
                name="downloadMbps"
                label={t("reseller.packages.form.download")}
                type="number"
                step={0.1}
                min={0.1}
                placeholder={t("reseller.packages.form.downloadPlaceholder")}
                defaultValue={rev?.downloadKbps ? rev.downloadKbps / 1024 : undefined}
                hint={t("reseller.packages.form.speedHint")}
              />
              <Field
                name="uploadMbps"
                label={t("reseller.packages.form.upload")}
                type="number"
                step={0.1}
                min={0.1}
                placeholder={t("reseller.packages.form.uploadPlaceholder")}
                defaultValue={rev?.uploadKbps ? rev.uploadKbps / 1024 : undefined}
                hint={t("reseller.packages.form.speedHint")}
              />
              <SelectField
                name="quotaType"
                label={t("reseller.packages.form.quotaType")}
                required
                defaultValue={rev?.quotaType ?? "UNLIMITED"}
                options={[
                  { value: "UNLIMITED", label: t("reseller.packages.form.quotaType.unlimited") },
                  { value: "TOTAL", label: t("reseller.packages.form.quotaType.total") },
                  { value: "DAILY", label: t("reseller.packages.form.quotaType.daily") },
                  { value: "MONTHLY", label: t("reseller.packages.form.quotaType.monthly") },
                ]}
              />
              <Field
                name="quotaGb"
                label={t("reseller.packages.form.quotaGb")}
                type="number"
                step={0.1}
                min={0.1}
                placeholder={t("reseller.packages.form.quotaGbPlaceholder")}
                defaultValue={
                  rev?.quotaBytes ? Math.round((Number(rev.quotaBytes) / (1024 ** 3)) * 10) / 10 : undefined
                }
              />
              <Field
                name="maxDevices"
                label={t("reseller.packages.form.maxDevices")}
                type="number"
                min={1}
                max={10}
                defaultValue={rev?.maxDevices ?? 1}
                required
              />
            </div>

            {/* Sites Checklist with Modern Badges */}
            <div className="rounded-xl border border-slate-100 bg-advo-page p-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-advo-text">{t("reseller.packages.form.sites")}</label>
                <span className="text-xs text-slate-500">{t("reseller.packages.form.sitesHint")}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                {(sites.data ?? []).map((s) => (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-advo-text shadow-sm transition hover:border-advo-blue hover:bg-blue-50/30"
                  >
                    <input
                      type="checkbox"
                      name="siteIds"
                      value={s.id}
                      defaultChecked={assigned.has(s.id)}
                      className="h-4 w-4 rounded border-slate-300 text-advo-blue focus:ring-advo-blue"
                    />
                    <span>{s.name}</span>
                    <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                      {s.state}
                    </span>
                  </label>
                ))}
                {sites.error ? (
                  <span role="alert" className="text-sm text-[var(--advo-danger)]">
                    {t("reseller.packages.form.sitesLoadError", { reason: sites.error.message })}
                  </span>
                ) : sites.loading && sites.data === undefined ? (
                  <span className="text-sm text-slate-400">{t("reseller.packages.form.sitesLoading")}</span>
                ) : sites.data?.length === 0 ? (
                  <span className="text-sm text-slate-400">{t("reseller.packages.form.sitesEmpty")}</span>
                ) : null}
              </div>
            </div>

            {save.error ? <Notice tone="danger">{save.error}</Notice> : null}

            <div className="flex items-center gap-3">
              <Button variant="primary" type="submit" isDisabled={save.pending}>
                {save.pending
                  ? t("reseller.packages.form.save")
                  : editing
                  ? t("reseller.packages.form.saveRevision")
                  : t("reseller.packages.form.create")}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setIsFormOpen(false);
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                {t("reseller.packages.form.cancel")}
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* Package Display Header with View Switcher */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-advo-text">{t("reseller.packages.list.title")}</h2>
          <p className="text-xs text-slate-500">{t("reseller.packages.list.subtitle")}</p>
        </div>
        <div className="flex items-center rounded-xl border border-advo-border bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              viewMode === "grid" ? "bg-advo-blue text-white" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            {t("reseller.packages.view.cards")}
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              viewMode === "table" ? "bg-advo-blue text-white" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <List className="h-3.5 w-3.5" />
            {t("reseller.packages.view.table")}
          </button>
        </div>
      </div>

      {/* Grid or Table Display */}
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
                  onClick={() => setIsFormOpen(true)}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-advo-blue px-4 py-2 text-sm font-semibold text-white shadow hover:bg-advo-blue-hover"
                >
                  <Plus className="h-4 w-4" />
                  {t("reseller.packages.empty.cta")}
                </button>
              </Card>
            );
          }

          if (viewMode === "grid") {
            return (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {rows.map((p) => {
                  const r = p.currentRevision;
                  return (
                    <Card
                      key={p.id}
                      className="group relative flex flex-col justify-between overflow-hidden p-6 transition hover:-translate-y-0.5 hover:shadow-lg"
                    >
                      {/* Top Accent Strip */}
                      <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-advo-blue via-advo-gold to-advo-orange" />

                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-advo-blue">
                              <Clock className="h-3 w-3" />
                              {r ? formatDuration(r.durationSeconds) : t("reseller.packages.card.custom")}
                            </span>
                            <h3 className="mt-2 text-xl font-bold text-advo-text group-hover:text-advo-blue">
                              {r?.name ?? p.name}
                            </h3>
                          </div>
                          <span className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-[10px] font-semibold text-slate-600">
                            rev {r?.revision ?? 1}
                          </span>
                        </div>

                        {/* Price */}
                        <div className="mt-4 flex items-baseline gap-1">
                          <span className="text-3xl font-extrabold tracking-tight text-advo-text">
                            {formatTzs(r?.priceTzs)}
                          </span>
                          <span className="text-xs text-slate-400">{t("reseller.packages.card.perVoucher")}</span>
                        </div>

                        {/* Limits and Quota Badges */}
                        <div className="mt-5 space-y-2.5 border-t border-slate-100 pt-4">
                          <div className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5 text-slate-500">
                              <Zap className="h-3.5 w-3.5 text-advo-gold" />
                              {t("reseller.packages.card.speedLimit")}
                            </span>
                            <span className="font-semibold text-slate-800">
                              {r?.downloadKbps
                                ? `↓ ${formatSpeed(r.downloadKbps)} · ↑ ${formatSpeed(r.uploadKbps)}`
                                : t("reseller.packages.card.unthrottled")}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5 text-slate-500">
                              <HardDrive className="h-3.5 w-3.5 text-emerald-600" />
                              {t("reseller.packages.card.dataQuota")}
                            </span>
                            <span className="font-semibold text-slate-800">
                              {r?.quotaType === "UNLIMITED"
                                ? t("reseller.packages.card.unlimitedData")
                                : `${formatBytes(r?.quotaBytes)} ${r?.quotaType.toLowerCase()}`}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5 text-slate-500">
                              <Smartphone className="h-3.5 w-3.5 text-indigo-600" />
                              {t("reseller.packages.card.deviceLimit")}
                            </span>
                            <span className="font-semibold text-slate-800">
                              {t("reseller.packages.card.devices", { count: r?.maxDevices ?? 1 })}
                            </span>
                          </div>
                        </div>

                        {/* Sites assignment */}
                        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
                          <MapPin className="h-3 w-3 text-slate-400" />
                          {p.assignments.length > 0 ? (
                            p.assignments.map((a) => (
                              <span
                                key={a.site.id}
                                className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                              >
                                {a.site.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-[11px] font-medium text-advo-gold">
                              {t("reseller.packages.card.notAssigned")}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Card Actions */}
                      <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(p);
                            setIsFormOpen(true);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-advo-blue hover:text-advo-blue"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          {t("reseller.packages.card.edit")}
                        </button>
                        <ActionButton
                          variant="danger"
                          confirm={t("reseller.packages.card.archiveConfirm")}
                          onRun={() => api.del(`/reseller/packages/${p.id}`)}
                          onDone={packages.reload}
                        >
                          {t("reseller.packages.card.archive")}
                        </ActionButton>
                      </div>
                    </Card>
                  );
                })}
              </div>
            );
          }

          // Table View fallback
          return (
            <Card className="overflow-hidden">
              <AdvoTable label={t("reseller.packages.tableLabel")}
                rows={rows}
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
                            ·{" "}
                            {t("reseller.packages.col.devices", { count: p.currentRevision.maxDevices })}
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
                    key: "a",
                    header: "",
                    render: (p) => (
                      <div className="flex gap-2">
                        <ActionButton
                          onRun={async () => {
                            setEditing(p);
                            setIsFormOpen(true);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          {t("reseller.packages.card.edit")}
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
