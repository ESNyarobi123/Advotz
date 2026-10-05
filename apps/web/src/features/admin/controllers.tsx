"use client";

import { useMemo, useState, type ReactNode } from "react";
import { formatDateTime } from "@advo/api-client";
import { Button, Card, Input, Label, Modal, ProgressBar, Switch, TextArea, useOverlayState } from "@heroui/react";
import { AdvoKpi, AdvoSelect, AdvoTable, Notice, SoftIcon, StatusChip } from "@advo/ui";
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  FlaskConical,
  Globe,
  KeyRound,
  ListChecks,
  Pencil,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Router,
  Search,
  Server,
  ShieldCheck,
  Star,
  Trash2,
  TriangleAlert,
  Wifi,
  X,
  XCircle,
} from "lucide-react";
import { Field, PageHero, ResourceView, SectionHeader } from "@/features/common/components";
import { ReasonDialog, type ReasonDialogLabels } from "@/features/common/reason-dialog";
import { api, errorMessage } from "@/lib/api";
import { formValues, useResource } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { MessageKey, TranslateVars } from "@advo/i18n";

type T = (key: MessageKey, vars?: TranslateVars) => string;

type Capability = {
  id: string;
  operation: string;
  supported: boolean;
  verified: boolean;
  reason: string | null;
  evidence: string | null;
  updatedAt: string;
};

type ControllerRow = {
  id: string;
  name: string;
  mode: "FAKE" | "LIVE";
  baseUrl: string | null;
  omadacId: string | null;
  version: string | null;
  portalTimeSemantics: string | null;
  healthStatus: string | null;
  lastHealthAt: string | null;
  lastHealthError: string | null;
  isDefault: boolean;
  active: boolean;
  hasCredentials: boolean;
  createdAt: string;
  capabilities: Capability[];
  counts: { sites: number; sitesFailing: number; devices: number };
};

/** `POST /admin/controllers/:id/inspect` — a live readback, not a stored claim. */
type InspectionResponse = {
  inspection: { type: string; version: string | null; controllerId: string | null; reachable: boolean; detail?: string };
  capabilities: Record<string, { supported: boolean; verified: boolean; reason?: string }>;
  simulated: boolean;
};

type Filter = "all" | "live" | "simulated" | "retired" | "attention";
type TabKey = "controllers" | "matrix";
/** `null` = register, a row = edit, `undefined` = closed. */
type FormTarget = ControllerRow | null | undefined;
type ReasonKind = "default" | "deactivate" | "reactivate" | "delete";

const FILTERS: Filter[] = ["all", "live", "simulated", "retired", "attention"];

function coverageOf(controller: ControllerRow) {
  const total = controller.capabilities.length;
  const verified = controller.capabilities.filter((c) => c.verified).length;
  const supported = controller.capabilities.filter((c) => c.supported).length;
  return { total, verified, supported };
}

function portalTimeLabel(t: T, semantics: string | null) {
  if (semantics === "absolute_epoch") return t("admin.controllers.card.portalAbsolute");
  if (semantics === "duration") return t("admin.controllers.card.portalDuration");
  return t("admin.controllers.card.notSet");
}

export function AdminControllersScreen() {
  const { t } = useI18n();
  const controllers = useResource<ControllerRow[]>("/admin/controllers");

  const [tab, setTab] = useState<TabKey>("controllers");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [flash, setFlash] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [formTarget, setFormTarget] = useState<FormTarget>(undefined);
  const [evidenceTarget, setEvidenceTarget] = useState<ControllerRow | null>(null);
  const [inspection, setInspection] = useState<{ controller: ControllerRow; result: InspectionResponse } | null>(null);
  const [reasonTarget, setReasonTarget] = useState<{ kind: ReasonKind; controller: ControllerRow } | null>(null);

  const rows = controllers.data ?? [];

  // The hero summary is the fastest way into the list, so its pills double as filters.
  function applyFilter(next: Filter) {
    setTab("controllers");
    setFilter(next);
  }

  const stats = useMemo(() => {
    const live = rows.filter((c) => c.mode === "LIVE").length;
    const simulated = rows.filter((c) => c.mode === "FAKE").length;
    const active = rows.filter((c) => c.active);
    const reachable = active.filter((c) => c.healthStatus === "reachable").length;
    const total = rows.reduce((sum, c) => sum + coverageOf(c).total, 0);
    const verified = rows.reduce((sum, c) => sum + coverageOf(c).verified, 0);
    const sites = rows.reduce((sum, c) => sum + c.counts.sites, 0);
    const devices = rows.reduce((sum, c) => sum + c.counts.devices, 0);
    const failing = rows.reduce((sum, c) => sum + c.counts.sitesFailing, 0);
    const lastChecked = rows
      .map((c) => c.lastHealthAt)
      .filter((v): v is string => Boolean(v))
      .sort()
      .at(-1);
    const fallbackDefault = active[0]?.name ?? null;
    return {
      live,
      simulated,
      active: active.length,
      retired: rows.length - active.length,
      reachable,
      coverageTotal: total,
      coverageVerified: verified,
      sites,
      devices,
      failing,
      lastChecked: lastChecked ?? null,
      defaultName: rows.find((c) => c.isDefault && c.active)?.name ?? fallbackDefault,
      attention: rows.filter(needsAttention).length,
    };
  }, [rows]);

  // Retiring the default Controller hands the role to the next active one, oldest first.
  // Shown up front so the operator knows where provisioning moves before confirming.
  const defaultHandover = useMemo(() => {
    if (reasonTarget?.kind !== "deactivate" || !reasonTarget.controller.isDefault) return null;
    return (
      rows
        .filter((c) => c.active && c.id !== reasonTarget.controller.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.name ?? null
    );
  }, [reasonTarget, rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .filter((c) => {
        if (filter === "live") return c.mode === "LIVE" && c.active;
        if (filter === "simulated") return c.mode === "FAKE" && c.active;
        if (filter === "retired") return !c.active;
        if (filter === "attention") return needsAttention(c);
        return true;
      })
      .filter((c) => {
        if (!needle) return true;
        return [c.name, c.baseUrl ?? "", c.omadacId ?? "", c.version ?? ""]
          .some((value) => value.toLowerCase().includes(needle));
      })
      .sort((a, b) => {
        // The default leads, then live before simulated, retired last — the order an
        // operator actually reasons about when something breaks.
        const weight = (c: ControllerRow) => (c.isDefault && c.active ? 0 : c.active ? 1 : 2);
        const byWeight = weight(a) - weight(b);
        if (byWeight !== 0) return byWeight;
        if (a.mode !== b.mode) return a.mode === "LIVE" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [rows, filter, query]);

  const matrix = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.flatMap((controller) =>
      controller.capabilities
        // The same search box filters both tabs so the toolbar never lies about the view.
        .filter(
          (capability) =>
            !needle ||
            capability.operation.toLowerCase().includes(needle) ||
            controller.name.toLowerCase().includes(needle),
        )
        .map((capability) => ({ controller, capability })),
    );
  }, [rows, query]);

  async function inspect(controller: ControllerRow) {
    setBusyId(controller.id);
    try {
      const result = await api.post<InspectionResponse>(`/admin/controllers/${controller.id}/inspect`);
      setInspection({ controller, result });
      await controllers.reload();
    } catch (err) {
      setFlash(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-4">
      <PageHero
        actions={
          <Button onPress={() => setFormTarget(null)} size="sm" type="button" variant="primary">
            <Plus className="size-4" />
            {t("admin.controllers.action.register")}
          </Button>
        }
        description={t("admin.controllers.description")}
        eyebrow={t("admin.controllers.eyebrow")}
        icon={<Router />}
        iconTone="teal"
        meta={
          <>
            <HeroPill icon={<Server className="size-3" />} onPress={() => applyFilter("all")}>
              {t("admin.controllers.hero.count", { count: rows.length })}
            </HeroPill>
            <HeroPill
              active={tab === "controllers" && filter === "live"}
              icon={<Activity className="size-3" />}
              onPress={() => applyFilter("live")}
              tone="accent"
            >
              {t("admin.controllers.hero.live", { count: stats.live })}
            </HeroPill>
            {stats.simulated > 0 ? (
              <HeroPill
                active={tab === "controllers" && filter === "simulated"}
                icon={<FlaskConical className="size-3" />}
                onPress={() => applyFilter("simulated")}
                tone="warning"
              >
                {t("admin.controllers.hero.simulated", { count: stats.simulated })}
              </HeroPill>
            ) : null}
            <HeroPill icon={<Star className="size-3" />} tone="success">
              {stats.defaultName
                ? t("admin.controllers.hero.default", { name: stats.defaultName })
                : t("admin.controllers.hero.noDefault")}
            </HeroPill>
            {stats.attention > 0 ? (
              <HeroPill
                active={tab === "controllers" && filter === "attention"}
                icon={<TriangleAlert className="size-3" />}
                onPress={() => applyFilter("attention")}
                tone="danger"
              >
                {t("admin.controllers.hero.attention", { count: stats.attention })}
              </HeroPill>
            ) : null}
          </>
        }
        title={t("admin.controllers.title")}
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

      <ResourceView resource={controllers}>
        {() => (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <AdvoKpi
                hint={t("admin.controllers.kpi.registeredHint", {
                  live: stats.live,
                  simulated: stats.simulated,
                })}
                icon={<Server />}
                iconTone="accent"
                label={t("admin.controllers.kpi.registered")}
                value={rows.length}
              />
              <AdvoKpi
                hint={
                  stats.lastChecked
                    ? t("admin.controllers.kpi.reachableHint", { when: formatDateTime(stats.lastChecked) })
                    : t("admin.controllers.kpi.reachableNever")
                }
                icon={<Wifi />}
                iconTone={stats.reachable > 0 ? "success" : "warning"}
                label={t("admin.controllers.kpi.reachable")}
                value={`${stats.reachable}/${stats.active}`}
              />
              <AdvoKpi
                hint={
                  stats.failing > 0
                    ? t("admin.controllers.kpi.sitesFailing", { count: stats.failing })
                    : t("admin.controllers.kpi.sitesHint", { devices: stats.devices })
                }
                icon={<Globe />}
                iconTone={stats.failing > 0 ? "warning" : "teal"}
                label={t("admin.controllers.kpi.sites")}
                value={stats.sites}
              />
              <AdvoKpi
                hint={
                  stats.coverageTotal > 0
                    ? t("admin.controllers.kpi.coverageHint", {
                        verified: stats.coverageVerified,
                        total: stats.coverageTotal,
                      })
                    : t("admin.controllers.kpi.coverageNone")
                }
                icon={<ShieldCheck />}
                iconTone={stats.coverageVerified > 0 ? "success" : "danger"}
                label={t("admin.controllers.kpi.coverage")}
                value={`${stats.coverageVerified}/${stats.coverageTotal}`}
              />
            </div>

            <div className="space-y-3 border-b border-[var(--advo-border)] pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-2">
                  <TabButton active={tab === "controllers"} icon={<Router className="size-3.5" />} onPress={() => setTab("controllers")}>
                    {t("admin.controllers.tab.controllers")}
                  </TabButton>
                  <TabButton active={tab === "matrix"} icon={<ListChecks className="size-3.5" />} onPress={() => setTab("matrix")}>
                    {t("admin.controllers.tab.matrix")}
                  </TabButton>
                </div>
                <label className="relative min-w-[220px] flex-1 sm:max-w-xs">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-advo-muted" />
                  <Input
                    aria-label={t("admin.controllers.search")}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("admin.controllers.search")}
                    value={query}
                    className="pl-9 pr-9"
                  />
                  {query ? (
                    <button
                      aria-label={t("admin.controllers.toolbar.clearSearch")}
                      className="absolute top-1/2 right-2.5 grid size-5 -translate-y-1/2 place-items-center rounded-full text-advo-muted transition-colors hover:bg-[var(--advo-blue-soft)] hover:text-advo-text"
                      onClick={() => setQuery("")}
                      type="button"
                    >
                      <X className="size-3.5" />
                    </button>
                  ) : null}
                </label>
              </div>
              {tab === "controllers" ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {FILTERS.map((key) => (
                    <FilterPill active={filter === key} key={key} onPress={() => setFilter(key)}>
                      {t(`admin.controllers.filter.${key}` as MessageKey)}
                    </FilterPill>
                  ))}
                  <span className="ms-auto text-[11px] font-semibold text-advo-muted tabular-nums">
                    {t("admin.controllers.toolbar.showing", { shown: visible.length, total: rows.length })}
                  </span>
                </div>
              ) : null}
            </div>

            {tab === "controllers" ? (
              visible.length === 0 ? (
                <EmptyControllers
                  filtered={rows.length > 0}
                  onRegister={() => setFormTarget(null)}
                  t={t}
                />
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  {visible.map((controller) => (
                    <ControllerCard
                      busy={busyId === controller.id}
                      controller={controller}
                      key={controller.id}
                      onDefault={() => setReasonTarget({ kind: "default", controller })}
                      onDelete={() => setReasonTarget({ kind: "delete", controller })}
                      onEdit={() => setFormTarget(controller)}
                      onEvidence={() => setEvidenceTarget(controller)}
                      onInspect={() => void inspect(controller)}
                      onToggleActive={() =>
                        setReasonTarget({
                          kind: controller.active ? "deactivate" : "reactivate",
                          controller,
                        })
                      }
                      t={t}
                    />
                  ))}
                </div>
              )
            ) : (
              <div className="rounded-card border border-[var(--advo-border)] bg-white p-4 shadow-advo-card sm:p-5">
                <SectionHeader
                  description={t("admin.controllers.matrix.description")}
                  icon={<ListChecks />}
                  iconTone="violet"
                  title={t("admin.controllers.matrix.title")}
                />
                <AdvoTable
                  empty={t("admin.controllers.matrix.empty")}
                  label={t("admin.controllers.matrix.title")}
                  rowKey={(row) => `${row.controller.id}-${row.capability.id}`}
                  rows={matrix}
                  columns={[
                    {
                      key: "c",
                      header: t("admin.controllers.matrix.controller"),
                      render: (row) => (
                        <div className="flex items-center gap-2">
                          <SoftIcon size="sm" tone={row.controller.mode === "LIVE" ? "accent" : "warning"}>
                            {row.controller.mode === "LIVE" ? <Server /> : <FlaskConical />}
                          </SoftIcon>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{row.controller.name}</p>
                            <p className="text-[11px] text-advo-muted">
                              {row.controller.isDefault ? t("admin.controllers.card.default") : ""}
                            </p>
                          </div>
                        </div>
                      ),
                    },
                    {
                      key: "o",
                      header: t("admin.controllers.matrix.operation"),
                      render: (row) => <span className="font-mono text-xs">{row.capability.operation}</span>,
                    },
                    {
                      key: "s",
                      header: t("admin.controllers.matrix.supported"),
                      render: (row) => (
                        <StatusChip tone={row.capability.supported ? "success" : "danger"}>
                          {row.capability.supported
                            ? t("admin.controllers.matrix.yes")
                            : t("admin.controllers.matrix.no")}
                        </StatusChip>
                      ),
                    },
                    {
                      key: "v",
                      header: t("admin.controllers.matrix.verified"),
                      render: (row) => (
                        <StatusChip tone={row.capability.verified ? "success" : "warning"}>
                          {row.capability.verified
                            ? t("admin.controllers.matrix.verifiedTag")
                            : t("admin.controllers.matrix.unverifiedTag")}
                        </StatusChip>
                      ),
                    },
                    {
                      key: "n",
                      header: t("admin.controllers.matrix.notes"),
                      render: (row) => (
                        <span className="text-xs text-advo-muted">
                          {row.capability.reason ?? row.capability.evidence?.slice(0, 120) ?? "—"}
                        </span>
                      ),
                    },
                    {
                      key: "u",
                      header: t("admin.controllers.matrix.updated"),
                      render: (row) => (
                        <span className="text-xs tabular-nums">{formatDateTime(row.capability.updatedAt)}</span>
                      ),
                    },
                  ]}
                />
              </div>
            )}
          </div>
        )}
      </ResourceView>

      <ControllerFormModal
        onClose={() => setFormTarget(undefined)}
        onSaved={async (message) => {
          await controllers.reload();
          setFlash(message);
        }}
        open={formTarget !== undefined}
        target={formTarget ?? null}
        t={t}
      />

      <EvidenceModal
        controller={evidenceTarget}
        knownOperations={matrix.map((row) => row.capability.operation)}
        onClose={() => setEvidenceTarget(null)}
        onSaved={async (message) => {
          await controllers.reload();
          setFlash(message);
        }}
        open={evidenceTarget !== null}
        t={t}
      />

      <InspectionDialog
        onClose={() => setInspection(null)}
        open={inspection !== null}
        payload={inspection}
        t={t}
      />

      <ReasonDialog
        labels={reasonLabelsFor(t, reasonTarget?.kind ?? null, reasonTarget?.controller.name ?? "")}
        onClose={() => setReasonTarget(null)}
        onSubmit={async (reason) => {
          if (!reasonTarget) return;
          const { controller, kind } = reasonTarget;
          const payload =
            kind === "default"
              ? { isDefault: true, reason }
              : kind === "deactivate"
                ? { active: false, reason }
                : kind === "reactivate"
                  ? { active: true, reason }
                  : { reason };

          if (kind === "delete") {
            // `api.del` cannot carry a body, and the reason has to reach the audit log.
            await api.request(`/admin/controllers/${controller.id}`, {
              method: "DELETE",
              body: JSON.stringify(payload),
            });
          } else {
            await api.post(`/admin/controllers/${controller.id}/flags`, payload);
          }
          await controllers.reload();
          const key: MessageKey =
            kind === "default"
              ? "admin.controllers.dialog.defaultSuccess"
              : kind === "deactivate"
                ? "admin.controllers.dialog.deactivateSuccess"
                : kind === "reactivate"
                  ? "admin.controllers.dialog.reactivateSuccess"
                  : "admin.controllers.dialog.deleteSuccess";
          setFlash(t(key, { name: controller.name }));
        }}
        open={reasonTarget !== null}
        summary={reasonTarget ? <ControllerSummary controller={reasonTarget.controller} t={t} /> : null}
        tone={reasonTarget?.kind === "delete" ? "danger" : "primary"}
        warning={
          reasonTarget?.kind === "deactivate" && reasonTarget.controller.isDefault
            ? defaultHandover
              ? t("admin.controllers.dialog.deactivateDefaultWarning", { name: defaultHandover })
              : t("admin.controllers.dialog.deactivateDefaultWarningLast")
            : null
        }
      />
    </div>
  );
}

/** A Controller that a mapping failed on, or one that looks fine but never proved itself. */
function needsAttention(controller: ControllerRow) {
  if (!controller.active) return false;
  if (controller.counts.sitesFailing > 0) return true;
  if (controller.healthStatus === "unreachable") return true;
  const { total, verified } = coverageOf(controller);
  return total === 0 || verified < total;
}

const HERO_PILL_TONES = {
  muted: "border border-[var(--advo-border)] bg-white/70 text-advo-muted",
  accent: "bg-advo-blue-soft text-advo-blue",
  warning: "bg-advo-warning-soft text-[#b45309]",
  success: "bg-advo-success-soft text-emerald-700",
  danger: "bg-advo-danger-soft text-[#b91c1c]",
} as const;

/** A hero summary chip. Becomes a one-tap filter when it is given an `onPress`. */
function HeroPill({
  active = false,
  children,
  icon,
  onPress,
  tone = "muted",
}: {
  active?: boolean;
  children: ReactNode;
  icon: ReactNode;
  onPress?: () => void;
  tone?: keyof typeof HERO_PILL_TONES;
}) {
  const className = [
    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums transition",
    HERO_PILL_TONES[tone],
    onPress ? "cursor-pointer hover:brightness-95" : "",
    active ? "ring-2 ring-advo-blue/40" : "",
  ].join(" ");
  if (!onPress) {
    return (
      <span className={className}>
        {icon}
        {children}
      </span>
    );
  }
  return (
    <button aria-pressed={active} className={className} onClick={onPress} type="button">
      {icon}
      {children}
    </button>
  );
}

function TabButton({
  active,
  children,
  icon,
  onPress,
}: {
  active: boolean;
  children: ReactNode;
  icon: ReactNode;
  onPress: () => void;
}) {
  return (
    <button
      className={[
        "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
        active
          ? "bg-advo-blue text-white shadow-advo-card"
          : "border border-[var(--advo-border)] bg-white text-advo-muted hover:text-advo-text",
      ].join(" ")}
      onClick={onPress}
      type="button"
    >
      {icon}
      {children}
    </button>
  );
}

function FilterPill({ active, children, onPress }: { active: boolean; children: ReactNode; onPress: () => void }) {
  return (
    <button
      className={[
        "rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase transition-colors",
        active
          ? "bg-advo-text text-white"
          : "border border-[var(--advo-border)] bg-white text-advo-muted hover:text-advo-text",
      ].join(" ")}
      onClick={onPress}
      type="button"
    >
      {children}
    </button>
  );
}

function EmptyControllers({ filtered, onRegister, t }: { filtered: boolean; onRegister: () => void; t: T }) {
  return (
    <Card className="flex flex-col items-center gap-3 p-10 text-center shadow-advo-card">
      <SoftIcon size="lg" tone={filtered ? "warning" : "accent"}>
        {filtered ? <Search /> : <Router />}
      </SoftIcon>
      <h3 className="text-base font-black text-advo-text">
        {filtered ? t("admin.controllers.empty.filtered") : t("admin.controllers.empty.title")}
      </h3>
      {filtered ? null : (
        <>
          <p className="max-w-lg text-sm text-advo-muted">{t("admin.controllers.empty.body")}</p>
          <Button onPress={onRegister} size="sm" type="button" variant="primary">
            <Plus className="size-4" />
            {t("admin.controllers.action.register")}
          </Button>
        </>
      )}
    </Card>
  );
}

function healthBadge(controller: ControllerRow, t: T) {
  if (controller.healthStatus === "reachable") {
    return {
      className: "bg-advo-success-soft text-[#166534]",
      icon: <CheckCircle2 className="size-3.5" />,
      label: t("admin.controllers.card.health.reachable"),
    };
  }
  if (controller.healthStatus === "unreachable") {
    return {
      className: "bg-advo-danger-soft text-[#b91c1c]",
      icon: <XCircle className="size-3.5" />,
      label: t("admin.controllers.card.health.unreachable"),
    };
  }
  return {
    className: "bg-advo-warning-soft text-[#b45309]",
    icon: <TriangleAlert className="size-3.5" />,
    label: t("admin.controllers.card.health.unknown"),
  };
}

function ControllerCard({
  busy,
  controller,
  onDefault,
  onDelete,
  onEdit,
  onEvidence,
  onInspect,
  onToggleActive,
  t,
}: {
  busy: boolean;
  controller: ControllerRow;
  onDefault: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onEvidence: () => void;
  onInspect: () => void;
  onToggleActive: () => void;
  t: T;
}) {
  const [showEvidence, setShowEvidence] = useState(false);
  const coverage = coverageOf(controller);
  const health = healthBadge(controller, t);
  const simulated = controller.mode === "FAKE";

  return (
    <Card className="group relative gap-0 overflow-hidden p-0 shadow-advo-card ring-1 ring-advo-border/70 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-advo-lift">
      <span
        aria-hidden="true"
        className={[
          "absolute inset-x-0 top-0 h-1",
          controller.active
            ? simulated
              ? "bg-gradient-to-r from-amber-400 to-advo-gold"
              : "bg-gradient-to-r from-advo-blue to-advo-teal"
            : "bg-[var(--advo-border)]",
        ].join(" ")}
      />

      <div className="space-y-4 p-5 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <SoftIcon size="lg" tone={simulated ? "warning" : "accent"}>
              {simulated ? <FlaskConical /> : <Server />}
            </SoftIcon>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="truncate text-base font-black text-advo-text">{controller.name}</h3>
                {controller.isDefault && controller.active ? (
                  <StatusChip tone="accent">{t("admin.controllers.card.default")}</StatusChip>
                ) : null}
                {!controller.active ? (
                  <StatusChip tone="default">{t("admin.controllers.card.retired")}</StatusChip>
                ) : simulated ? (
                  <StatusChip tone="warning">{t("admin.controllers.card.simulated")}</StatusChip>
                ) : (
                  <StatusChip tone="success">{t("admin.controllers.card.live")}</StatusChip>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold ${health.className}`}>
                  {health.icon}
                  {health.label}
                </span>
                {controller.lastHealthAt ? (
                  <span className="text-advo-muted tabular-nums">
                    {t("admin.controllers.card.health.checked", { when: formatDateTime(controller.lastHealthAt) })}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1 text-advo-muted">
                  <KeyRound className="size-3" />
                  {controller.hasCredentials
                    ? t("admin.controllers.card.credentials.stored")
                    : t("admin.controllers.card.credentials.none")}
                </span>
              </div>
            </div>
          </div>

          <Button
            className="shrink-0 text-advo-blue"
            isDisabled={busy}
            onPress={onInspect}
            size="sm"
            type="button"
            variant="outline"
          >
            <RefreshCw className={busy ? "size-3.5 animate-spin" : "size-3.5"} />
            {t("admin.controllers.action.inspect")}
          </Button>
        </div>

        {controller.lastHealthError ? (
          <Notice tone="danger">
            <span className="text-xs">{controller.lastHealthError}</span>
          </Notice>
        ) : null}
        {!controller.active ? (
          <Notice tone="warning">
            <span className="text-xs">{t("admin.controllers.card.retiredNote")}</span>
          </Notice>
        ) : controller.counts.sitesFailing > 0 ? (
          <Notice tone="warning">
            <span className="text-xs">
              {t("admin.controllers.card.failing", { count: controller.counts.sitesFailing })}
            </span>
          </Notice>
        ) : null}

        <dl className="grid grid-cols-2 gap-3 rounded-xl border border-[var(--advo-border)] bg-[var(--advo-blue-soft)]/40 p-3 lg:grid-cols-4 xl:grid-cols-2">
          <MetaCell label={t("admin.controllers.card.baseUrl")} value={controller.baseUrl ?? t("admin.controllers.card.notSet")} />
          <MetaCell label={t("admin.controllers.card.version")} value={controller.version ?? t("admin.controllers.card.notSet")} />
          <MetaCell label={t("admin.controllers.card.omadacId")} value={controller.omadacId ?? t("admin.controllers.card.notSet")} />
          <MetaCell label={t("admin.controllers.card.portalTime")} value={portalTimeLabel(t, controller.portalTimeSemantics)} />
        </dl>

        <div className="grid grid-cols-3 gap-3">
          <StatTile icon={<Globe className="size-3.5" />} label={t("admin.controllers.card.sites")} value={controller.counts.sites} />
          <StatTile icon={<Wifi className="size-3.5" />} label={t("admin.controllers.card.devices")} value={controller.counts.devices} />
          <StatTile
            icon={<Activity className="size-3.5" />}
            label={t("admin.controllers.card.registeredLabel")}
            value={formatDateTime(controller.createdAt)}
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-semibold text-advo-muted">{t("admin.controllers.card.coverage")}</span>
            <span className="font-bold tabular-nums">
              {t("admin.controllers.card.coverageValue", {
                verified: coverage.verified,
                total: coverage.total,
              })}
              {coverage.total > 0 ? ` · ${Math.round((coverage.verified / coverage.total) * 100)}%` : ""}
            </span>
          </div>
          <ProgressBar
            aria-label={t("admin.controllers.card.coverage")}
            color={coverage.total === 0 ? "danger" : coverage.verified === coverage.total ? "success" : "warning"}
            maxValue={Math.max(coverage.total, 1)}
            size="sm"
            value={coverage.verified}
          >
            <ProgressBar.Track>
              <ProgressBar.Fill />
            </ProgressBar.Track>
          </ProgressBar>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--advo-border)] pt-3">
          <Button onPress={onEvidence} size="sm" type="button" variant="outline">
            <ShieldCheck className="size-3.5" />
            {t("admin.controllers.action.evidence")}
          </Button>
          <Button onPress={onEdit} size="sm" type="button" variant="outline">
            <Pencil className="size-3.5" />
            {t("admin.controllers.action.edit")}
          </Button>
          <button
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-advo-muted transition-colors hover:bg-[var(--advo-blue-soft)] hover:text-advo-text"
            onClick={() => setShowEvidence((v) => !v)}
            type="button"
          >
            <ChevronDown className={`size-3.5 transition-transform ${showEvidence ? "rotate-180" : ""}`} />
            {showEvidence
              ? t("admin.controllers.action.hideEvidence")
              : t("admin.controllers.action.showEvidence")}
          </button>

          {/* State-changing and destructive actions sit apart, so they are never a mis-tap. */}
          <span className="ms-auto flex flex-wrap items-center gap-2 border-l border-[var(--advo-border)] ps-2">
            {controller.active && !controller.isDefault ? (
              <Button onPress={onDefault} size="sm" type="button" variant="outline">
                <Star className="size-3.5" />
                {t("admin.controllers.action.setDefault")}
              </Button>
            ) : null}
            <Button onPress={onToggleActive} size="sm" type="button" variant="outline">
              {controller.active ? <PowerOff className="size-3.5" /> : <Power className="size-3.5" />}
              {controller.active
                ? t("admin.controllers.action.deactivate")
                : t("admin.controllers.action.reactivate")}
            </Button>
            <Button isDisabled={controller.counts.sites > 0 || controller.counts.devices > 0} onPress={onDelete} size="sm" type="button" variant="danger-soft">
              <Trash2 className="size-3.5" />
              {t("admin.controllers.action.delete")}
            </Button>
          </span>
        </div>

        {showEvidence ? (
          <AdvoTable
            empty={t("admin.controllers.matrix.empty")}
            label={t("admin.controllers.action.showEvidence")}
            rowKey={(row) => row.id}
            rows={controller.capabilities}
            columns={[
              {
                key: "o",
                header: t("admin.controllers.matrix.operation"),
                render: (row) => <span className="font-mono text-xs">{row.operation}</span>,
              },
              {
                key: "s",
                header: t("admin.controllers.matrix.supported"),
                render: (row) => (
                  <StatusChip tone={row.supported ? "success" : "danger"}>
                    {row.supported ? t("admin.controllers.matrix.yes") : t("admin.controllers.matrix.no")}
                  </StatusChip>
                ),
              },
              {
                key: "v",
                header: t("admin.controllers.matrix.verified"),
                render: (row) => (
                  <StatusChip tone={row.verified ? "success" : "warning"}>
                    {row.verified
                      ? t("admin.controllers.matrix.verifiedTag")
                      : t("admin.controllers.matrix.unverifiedTag")}
                  </StatusChip>
                ),
              },
              {
                key: "r",
                header: t("admin.controllers.matrix.notes"),
                render: (row) => (
                  <span className="text-xs text-advo-muted">{row.reason ?? row.evidence?.slice(0, 120) ?? "—"}</span>
                ),
              },
            ]}
          />
        ) : null}
      </div>
    </Card>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold tracking-wider text-advo-muted uppercase">{label}</dt>
      <dd className="mt-0.5 truncate text-xs font-semibold text-advo-text" title={value}>
        {value}
      </dd>
    </div>
  );
}

function StatTile({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--advo-border)] bg-white p-2.5">
      <p className="flex items-center gap-1 text-[10px] font-bold tracking-wider text-advo-muted uppercase">
        {icon}
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-1 truncate text-sm font-black text-advo-text tabular-nums">{value}</p>
    </div>
  );
}

function ControllerSummary({ controller, t }: { controller: ControllerRow; t: T }) {
  return (
    <div className="rounded-xl border border-[var(--advo-border)] bg-[var(--advo-blue-soft)]/40 p-3">
      <p className="text-sm font-black text-advo-text">{controller.name}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div>
          <p className="font-bold text-advo-muted uppercase">{t("admin.controllers.form.mode")}</p>
          <p className="font-semibold">
            {controller.mode === "LIVE"
              ? t("admin.controllers.form.modeLive")
              : t("admin.controllers.form.modeSimulated")}
          </p>
        </div>
        <div>
          <p className="font-bold text-advo-muted uppercase">{t("admin.controllers.card.baseUrl")}</p>
          <p className="truncate font-semibold">{controller.baseUrl ?? t("admin.controllers.card.notSet")}</p>
        </div>
        <div>
          <p className="font-bold text-advo-muted uppercase">{t("admin.controllers.card.sites")}</p>
          <p className="font-semibold tabular-nums">{controller.counts.sites}</p>
        </div>
        <div>
          <p className="font-bold text-advo-muted uppercase">{t("admin.controllers.card.devices")}</p>
          <p className="font-semibold tabular-nums">{controller.counts.devices}</p>
        </div>
      </div>
    </div>
  );
}

/** The dialog must describe whichever action was picked, and only that one. */
function reasonLabelsFor(t: T, kind: ReasonKind | null, name: string): ReasonDialogLabels {
  const base = {
    tooShort: t("admin.controllers.dialog.reasonTooShort"),
    cancel: t("admin.controllers.dialog.cancel"),
    reasonPlaceholder: t("admin.controllers.dialog.reasonPlaceholder"),
    reasonHint: t("admin.controllers.dialog.reasonHint"),
  };
  if (kind === "deactivate") {
    return {
      ...base,
      title: t("admin.controllers.dialog.deactivateTitle", { name }),
      note: t("admin.controllers.dialog.deactivateNote"),
      reasonLabel: t("admin.controllers.dialog.deactivateReason"),
      confirm: t("admin.controllers.dialog.deactivateConfirm"),
    };
  }
  if (kind === "reactivate") {
    return {
      ...base,
      title: t("admin.controllers.dialog.reactivateTitle", { name }),
      note: t("admin.controllers.dialog.reactivateNote"),
      reasonLabel: t("admin.controllers.dialog.reactivateReason"),
      confirm: t("admin.controllers.dialog.reactivateConfirm"),
    };
  }
  if (kind === "delete") {
    return {
      ...base,
      title: t("admin.controllers.dialog.deleteTitle", { name }),
      note: t("admin.controllers.dialog.deleteNote"),
      reasonLabel: t("admin.controllers.dialog.deleteReason"),
      confirm: t("admin.controllers.dialog.deleteConfirm"),
    };
  }
  return {
    ...base,
    title: t("admin.controllers.dialog.defaultTitle", { name }),
    note: t("admin.controllers.dialog.defaultNote"),
    reasonLabel: t("admin.controllers.dialog.defaultReason"),
    confirm: t("admin.controllers.dialog.defaultConfirm"),
  };
}

/* ────────────────────────────── Register / edit ────────────────────────────── */

function ControllerFormModal({
  target,
  open,
  onClose,
  onSaved,
  t,
}: {
  target: ControllerRow | null;
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
  t: T;
}) {
  const overlay = useOverlayState({ isOpen: open, onOpenChange: (next) => (!next ? onClose() : undefined) });
  const editing = target !== null;
  // A live Controller that was inspected reports its own version, so prefill what we know.
  const [mode, setMode] = useState<"LIVE" | "FAKE">(target?.mode ?? "LIVE");
  const [makeDefault, setMakeDefault] = useState(target?.isDefault ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save(form: HTMLFormElement) {
    const values = formValues(form);
    if (!values.name || values.name.trim().length < 2) {
      setError(t("admin.controllers.form.error.name"));
      return;
    }
    if (mode === "LIVE") {
      if (!values.baseUrl || !/^https?:\/\/.+/i.test(values.baseUrl)) {
        setError(t("admin.controllers.form.error.baseUrl"));
        return;
      }
      if (!values.omadacId) {
        setError(t("admin.controllers.form.error.omadacId"));
        return;
      }
      if (!values.version) {
        setError(t("admin.controllers.form.error.version"));
        return;
      }
    }
    let openApiContract: unknown;
    if (values.openApiContract) {
      try {
        openApiContract = JSON.parse(values.openApiContract);
      } catch {
        setError(t("admin.controllers.form.error.contract"));
        return;
      }
    }

    const credentials =
      mode === "LIVE"
        ? {
            clientId: values.clientId,
            clientSecret: values.clientSecret,
            operatorUsername: values.operatorUsername,
            operatorPassword: values.operatorPassword,
            openApiContract,
          }
        : undefined;

    setPending(true);
    setError(null);
    try {
      const payload = {
        name: values.name,
        mode,
        baseUrl: mode === "LIVE" ? values.baseUrl : undefined,
        omadacId: mode === "LIVE" ? values.omadacId : undefined,
        version: mode === "LIVE" ? values.version : undefined,
        portalTimeSemantics: values.portalTimeSemantics || undefined,
        isDefault: makeDefault,
        credentials,
      };
      if (editing && target) {
        await api.put(`/admin/controllers/${target.id}`, payload);
      } else {
        await api.post("/admin/controllers", payload);
      }
      await onSaved(
        t(
          editing ? "admin.controllers.form.successEdit" : "admin.controllers.form.successCreate",
          { name: values.name },
        ),
      );
      form.reset();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal.Root state={overlay}>
      <Modal.Backdrop>
        <Modal.Container size="lg">
          <Modal.Dialog className="bg-white">
            <Modal.Header>
              <Modal.Heading className="text-base font-black text-advo-text">
                {editing && target
                  ? t("admin.controllers.form.titleEdit", { name: target.name })
                  : t("admin.controllers.form.titleCreate")}
              </Modal.Heading>
              <p className="mt-1 text-xs text-advo-muted">{t("admin.controllers.form.description")}</p>
            </Modal.Header>
            <Modal.Body>
              {/* Remounting on the target resets every uncontrolled field to the row's values. */}
              <form
                className="space-y-4"
                key={target?.id ?? "new"}
                onSubmit={(e) => {
                  e.preventDefault();
                  void save(e.currentTarget);
                }}
              >
                <div>
                  <Label>{t("admin.controllers.form.mode")}</Label>
                  <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                    <ModeOption
                      active={mode === "LIVE"}
                      hint={t("admin.controllers.form.modeLiveHint")}
                      icon={<Server className="size-4" />}
                      label={t("admin.controllers.form.modeLive")}
                      onPress={() => setMode("LIVE")}
                    />
                    <ModeOption
                      active={mode === "FAKE"}
                      hint={t("admin.controllers.form.modeSimulatedHint")}
                      icon={<FlaskConical className="size-4" />}
                      label={t("admin.controllers.form.modeSimulated")}
                      onPress={() => setMode("FAKE")}
                    />
                  </div>
                </div>

                {mode === "FAKE" ? (
                  <Notice tone="warning">
                    <span className="text-xs">{t("admin.controllers.form.simulatedWarning")}</span>
                  </Notice>
                ) : null}

                <Field
                  defaultValue={target?.name ?? ""}
                  hint={t("admin.controllers.form.nameHint")}
                  label={t("admin.controllers.form.name")}
                  name="name"
                  placeholder={t("admin.controllers.form.namePlaceholder")}
                  required
                />

                {mode === "LIVE" ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        defaultValue={target?.baseUrl ?? ""}
                        hint={t("admin.controllers.form.baseUrlHint")}
                        label={t("admin.controllers.form.baseUrl")}
                        name="baseUrl"
                        placeholder="https://omada.example.co.tz:8043"
                        required
                        type="url"
                      />
                      <Field
                        defaultValue={target?.omadacId ?? ""}
                        hint={t("admin.controllers.form.omadacIdHint")}
                        label={t("admin.controllers.form.omadacId")}
                        name="omadacId"
                        required
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        defaultValue={target?.version ?? ""}
                        hint={t("admin.controllers.form.versionHint")}
                        label={t("admin.controllers.form.version")}
                        name="version"
                        placeholder="6.0.0.x"
                        required
                      />
                      <div>
                        <Label htmlFor="f-portalTimeSemantics">{t("admin.controllers.form.portalTime")}</Label>
                        <AdvoSelect
                          defaultValue={target?.portalTimeSemantics ?? ""}
                          id="f-portalTimeSemantics"
                          name="portalTimeSemantics"
                        >
                          <option value="">—</option>
                          <option value="absolute_epoch">{t("admin.controllers.form.portalTimeAbsolute")}</option>
                          <option value="duration">{t("admin.controllers.form.portalTimeDuration")}</option>
                        </AdvoSelect>
                        <p className="mt-1 text-xs text-advo-muted">{t("admin.controllers.form.portalTimeHint")}</p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-[var(--advo-border)] p-4">
                      <p className="flex items-center gap-2 text-sm font-bold text-advo-text">
                        <KeyRound className="size-4 text-advo-blue" />
                        {t("admin.controllers.form.credentials")}
                      </p>
                      <p className="mt-0.5 text-xs text-advo-muted">{t("admin.controllers.form.credentialsHint")}</p>
                      <div className="mt-3 grid gap-4 sm:grid-cols-2">
                        <Field label={t("admin.controllers.form.clientId")} name="clientId" />
                        <Field
                          hint={t("admin.controllers.form.clientSecretHint")}
                          label={t("admin.controllers.form.clientSecret")}
                          name="clientSecret"
                          type="password"
                        />
                        <Field label={t("admin.controllers.form.operatorUsername")} name="operatorUsername" />
                        <Field
                          hint={t("admin.controllers.form.operatorPasswordHint")}
                          label={t("admin.controllers.form.operatorPassword")}
                          name="operatorPassword"
                          type="password"
                        />
                      </div>
                      <div className="mt-4">
                        <Label htmlFor="f-openApiContract">{t("admin.controllers.form.contract")}</Label>
                        <TextArea id="f-openApiContract" name="openApiContract" rows={4} />
                        <p className="mt-1 text-xs text-advo-muted">{t("admin.controllers.form.contractHint")}</p>
                      </div>
                    </div>
                  </>
                ) : null}

                <div className="flex items-start justify-between gap-3 rounded-xl border border-[var(--advo-border)] p-3">
                  <div>
                    <p className="text-sm font-semibold text-advo-text">{t("admin.controllers.form.makeDefault")}</p>
                    <p className="text-xs text-advo-muted">{t("admin.controllers.form.makeDefaultHint")}</p>
                  </div>
                  <Switch
                    aria-label={t("admin.controllers.form.makeDefault")}
                    isSelected={makeDefault}
                    onChange={setMakeDefault}
                    size="sm"
                  >
                    <Switch.Content>
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                      <span className="sr-only">{t("admin.controllers.form.makeDefault")}</span>
                    </Switch.Content>
                  </Switch>
                </div>

                {error ? <Notice tone="danger">{error}</Notice> : null}

                <div className="flex justify-end gap-2 border-t border-[var(--advo-border)] pt-4">
                  <Button isDisabled={pending} onPress={onClose} type="button" variant="outline">
                    {t("admin.controllers.form.cancel")}
                  </Button>
                  <Button isDisabled={pending} type="submit" variant="primary">
                    {pending
                      ? "…"
                      : editing
                        ? t("admin.controllers.form.submitEdit")
                        : t("admin.controllers.form.submitCreate")}
                  </Button>
                </div>
              </form>
            </Modal.Body>
            <Modal.CloseTrigger aria-label={t("admin.controllers.form.cancel")} />
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}

function ModeOption({
  active,
  hint,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  hint: string;
  icon: ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={[
        "flex items-start gap-3 rounded-xl border p-3 text-left transition-all",
        active
          ? "border-advo-blue bg-advo-blue-soft ring-1 ring-advo-blue"
          : "border-[var(--advo-border)] bg-white hover:border-advo-blue/50",
      ].join(" ")}
      onClick={onPress}
      type="button"
    >
      <SoftIcon size="sm" tone={active ? "accent" : "teal"}>{icon}</SoftIcon>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-advo-text">{label}</span>
        <span className="block text-xs text-advo-muted">{hint}</span>
      </span>
      {active ? <CheckCircle2 className="ms-auto size-4 shrink-0 text-advo-blue" /> : null}
    </button>
  );
}

/* ────────────────────────────── Capability evidence ────────────────────────────── */

function EvidenceModal({
  controller,
  knownOperations,
  open,
  onClose,
  onSaved,
  t,
}: {
  controller: ControllerRow | null;
  /** Operations already recorded anywhere, offered as suggestions instead of a hard list. */
  knownOperations: string[];
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
  t: T;
}) {
  const overlay = useOverlayState({ isOpen: open, onOpenChange: (next) => (!next ? onClose() : undefined) });
  const [supported, setSupported] = useState(true);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save(form: HTMLFormElement) {
    const values = formValues(form);
    if (!values.operation || values.operation.trim().length < 2) {
      setError(t("admin.controllers.evidence.error.operation"));
      return;
    }
    if (verified && !values.evidence) {
      setError(t("admin.controllers.evidence.error.notes"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.post(`/admin/controllers/${controller?.id}/capabilities`, {
        operation: values.operation,
        supported,
        verified,
        reason: values.reason,
        evidence: values.evidence,
      });
      await onSaved(t("admin.controllers.evidence.success", { operation: values.operation }));
      form.reset();
      setVerified(false);
      setSupported(true);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal.Root state={overlay}>
      <Modal.Backdrop>
        <Modal.Container size="lg">
          <Modal.Dialog className="bg-white">
            <Modal.Header>
              <Modal.Heading className="text-base font-black text-advo-text">
                {t("admin.controllers.evidence.title")}
              </Modal.Heading>
              <p className="mt-1 text-xs text-advo-muted">{t("admin.controllers.evidence.description")}</p>
            </Modal.Header>
            <Modal.Body>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save(e.currentTarget);
                }}
              >
                {controller ? <ControllerSummary controller={controller} t={t} /> : null}

                <Field
                  label={t("admin.controllers.evidence.operation")}
                  list="controller-operations"
                  name="operation"
                  placeholder={t("admin.controllers.evidence.operationPlaceholder")}
                  required
                />
                <datalist id="controller-operations">
                  {Array.from(new Set(knownOperations)).sort().map((operation) => (
                    <option key={operation} value={operation} />
                  ))}
                </datalist>

                <div className="grid gap-2 sm:grid-cols-2">
                  <ToggleRow
                    checked={supported}
                    description={t("admin.controllers.evidence.supportedHint")}
                    label={t("admin.controllers.evidence.supported")}
                    onChange={setSupported}
                  />
                  <ToggleRow
                    checked={verified}
                    description={t("admin.controllers.evidence.verifiedHint")}
                    label={t("admin.controllers.evidence.verified")}
                    onChange={setVerified}
                  />
                </div>

                <Field
                  label={t("admin.controllers.evidence.reason")}
                  name="reason"
                  placeholder={t("admin.controllers.evidence.reasonPlaceholder")}
                />

                <div>
                  <Label htmlFor="f-evidence">
                    {t("admin.controllers.evidence.notes")}
                    {verified ? <span className="text-[var(--advo-danger)]"> *</span> : null}
                  </Label>
                  <TextArea id="f-evidence" name="evidence" placeholder={t("admin.controllers.evidence.notesPlaceholder")} rows={3} />
                  <p className="mt-1 text-xs text-advo-muted">{t("admin.controllers.evidence.notesHint")}</p>
                </div>

                {controller && controller.capabilities.length > 0 ? (
                  <div>
                    <p className="mb-1.5 text-[11px] font-bold tracking-wider text-advo-muted uppercase">
                      {t("admin.controllers.evidence.existing")}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {controller.capabilities.map((capability) => (
                        <StatusChip key={capability.id} tone={capability.verified ? "success" : capability.supported ? "warning" : "danger"}>
                          {capability.operation}
                        </StatusChip>
                      ))}
                    </div>
                  </div>
                ) : null}

                {error ? <Notice tone="danger">{error}</Notice> : null}

                <div className="flex justify-end gap-2 border-t border-[var(--advo-border)] pt-4">
                  <Button isDisabled={pending} onPress={onClose} type="button" variant="outline">
                    {t("admin.controllers.form.cancel")}
                  </Button>
                  <Button isDisabled={pending} type="submit" variant="primary">
                    {pending ? "…" : t("admin.controllers.evidence.submit")}
                  </Button>
                </div>
              </form>
            </Modal.Body>
            <Modal.CloseTrigger aria-label={t("admin.controllers.form.cancel")} />
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}

function ToggleRow({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-[var(--advo-border)] p-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-advo-text">{label}</p>
        <p className="text-xs text-advo-muted">{description}</p>
      </div>
      <Switch aria-label={label} isSelected={checked} onChange={onChange} size="sm">
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <span className="sr-only">{label}</span>
        </Switch.Content>
      </Switch>
    </div>
  );
}

/* ────────────────────────────── Inspection ────────────────────────────── */

function InspectionDialog({
  payload,
  open,
  onClose,
  t,
}: {
  payload: { controller: ControllerRow; result: InspectionResponse } | null;
  open: boolean;
  onClose: () => void;
  t: T;
}) {
  const overlay = useOverlayState({ isOpen: open, onOpenChange: (next) => (!next ? onClose() : undefined) });
  const { inspection, capabilities, simulated } = payload?.result ?? {
    inspection: undefined,
    capabilities: {},
    simulated: false,
  };
  const reported = Object.entries(capabilities ?? {}).map(([operation, result]) => ({ operation, ...result }));

  return (
    <Modal.Root state={overlay}>
      <Modal.Backdrop>
        <Modal.Container size="lg">
          <Modal.Dialog className="bg-white">
            <Modal.Header>
              <Modal.Heading className="text-base font-black text-advo-text">
                {t("admin.controllers.inspect.title", { name: payload?.controller.name ?? "" })}
              </Modal.Heading>
              <p className="mt-1 text-xs text-advo-muted">{t("admin.controllers.inspect.description")}</p>
            </Modal.Header>
            <Modal.Body className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip tone={inspection?.reachable ? "success" : "danger"}>
                  {inspection?.reachable
                    ? t("admin.controllers.inspect.reachable")
                    : t("admin.controllers.inspect.unreachable")}
                </StatusChip>
                {simulated ? (
                  <StatusChip tone="warning">{t("admin.controllers.card.simulated")}</StatusChip>
                ) : null}
                {inspection?.type ? <StatusChip tone="accent">{inspection.type}</StatusChip> : null}
                {inspection?.version ? <StatusChip tone="default">{inspection.version}</StatusChip> : null}
                {inspection?.controllerId ? (
                  <span className="font-mono text-xs text-advo-muted">{inspection.controllerId}</span>
                ) : null}
              </div>

              {simulated ? (
                <Notice tone="warning">
                  <span className="text-xs">{t("admin.controllers.inspect.simulated")}</span>
                </Notice>
              ) : null}
              {inspection?.detail ? (
                <Notice tone={inspection.reachable ? "accent" : "danger"}>
                  <span className="text-xs">
                    <strong className="me-1">{t("admin.controllers.inspect.detail")}:</strong>
                    {inspection.detail}
                  </span>
                </Notice>
              ) : null}

              <div>
                <p className="mb-1.5 text-[11px] font-bold tracking-wider text-advo-muted uppercase">
                  {t("admin.controllers.inspect.capabilities")}
                </p>
                <AdvoTable
                  empty={t("admin.controllers.inspect.empty")}
                  label={t("admin.controllers.inspect.capabilities")}
                  rowKey={(row) => row.operation}
                  rows={reported}
                  columns={[
                    {
                      key: "o",
                      header: t("admin.controllers.matrix.operation"),
                      render: (row) => <span className="font-mono text-xs">{row.operation}</span>,
                    },
                    {
                      key: "s",
                      header: t("admin.controllers.matrix.supported"),
                      render: (row) => (
                        <StatusChip tone={row.supported ? "success" : "danger"}>
                          {row.supported ? t("admin.controllers.matrix.yes") : t("admin.controllers.matrix.no")}
                        </StatusChip>
                      ),
                    },
                    {
                      key: "v",
                      header: t("admin.controllers.matrix.verified"),
                      render: (row) => (
                        <StatusChip tone={row.verified ? "success" : "warning"}>
                          {row.verified
                            ? t("admin.controllers.matrix.verifiedTag")
                            : t("admin.controllers.matrix.unverifiedTag")}
                        </StatusChip>
                      ),
                    },
                    {
                      key: "n",
                      header: t("admin.controllers.matrix.notes"),
                      render: (row) => <span className="text-xs text-advo-muted">{row.reason ?? "—"}</span>,
                    },
                  ]}
                />
              </div>

              <div className="flex justify-end border-t border-[var(--advo-border)] pt-4">
                <Button onPress={onClose} type="button" variant="primary">
                  {t("admin.controllers.inspect.close")}
                </Button>
              </div>
            </Modal.Body>
            <Modal.CloseTrigger aria-label={t("admin.controllers.inspect.close")} />
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}
