"use client";

import { useState } from "react";
import { Card } from "@heroui/react";
import { StatusChip, statusTone } from "@advo/ui";
import { ActionButton } from "@/features/common/actions";
import { ResourceView } from "@/features/common/components";
import { api } from "@/lib/api";
import { useI18n, type I18n } from "@/lib/i18n";
import { formValues, useAction, useResource } from "@/lib/hooks";
import {
  Wifi,
  Plus,
  Radio,
  ExternalLink,
  Copy,
  Check,
  Cpu,
  MapPin,
  AlertTriangle,
  Search,
  X,
  Activity,
  type LucideIcon,
} from "lucide-react";

type SiteRow = {
  id: string;
  name: string;
  slug: string;
  state: string;
  location: string | null;
  portalTitle: string | null;
  portalMessage: string | null;
  createdAt: string;
  mapping: { state: string; lastError: string | null; controller: { name: string; mode: string } } | null;
  _count: { devices: number };
};

const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL ?? "http://localhost:3001";

/**
 * Enum → message key. The API's enum values are the wire vocabulary; these maps
 * are the only place that knows how each value reads for a human, and each
 * lookup falls back to a de-underscored value so a new enum never renders raw.
 */
const SITE_STATE_KEYS: Record<string, [label: string, help: string]> = {
  REQUESTED: ["site.state.REQUESTED", "site.help.REQUESTED"],
  PROVISIONING: ["site.state.PROVISIONING", "site.help.PROVISIONING"],
  AWAITING_DEVICE: ["site.state.AWAITING_DEVICE", "site.help.AWAITING_DEVICE"],
  READY: ["site.state.READY", "site.help.READY"],
  FAILED: ["site.state.FAILED", "site.help.FAILED"],
  NEEDS_REVIEW: ["site.state.NEEDS_REVIEW", "site.help.NEEDS_REVIEW"],
};

function siteStateLabel(t: I18n["t"], state: string): string {
  const keys = SITE_STATE_KEYS[state];
  if (keys) return t(keys[0] as "site.state.READY");
  return state.replace(/_/g, " ").toLowerCase();
}

function siteStateHelp(t: I18n["t"], state: string): string {
  const keys = SITE_STATE_KEYS[state];
  return keys ? t(keys[1] as "site.help.READY") : siteStateLabel(t, state);
}

/** A site only needs a human when provisioning failed or a human must approve it. */
function needsAttention(site: SiteRow): boolean {
  return site.state === "FAILED" || site.state === "NEEDS_REVIEW" || site.mapping?.state === "FAILED";
}

export function ResellerSitesScreen() {
  const { t } = useI18n();
  const sites = useResource<SiteRow[]>("/reseller/sites");
  // The reseller's registered business name is the default name for a new site.
  const overview = useResource<{ reseller: { businessName: string } }>("/reseller/overview");
  const businessName = overview.data?.reseller.businessName ?? "";

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "attention">("all");

  const createSite = useAction(async (form: HTMLFormElement) => {
    await api.post("/reseller/sites", formValues(form));
    form.reset();
    setShowCreateForm(false);
  }, sites.reload);

  function copyToClipboard(text: string, id: string) {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const siteList = sites.data || [];

  const attentionCount = siteList.filter(needsAttention).length;
  const readyCount = siteList.filter((site) => site.state === "READY").length;
  const term = query.trim().toLowerCase();
  const visibleSites = siteList.filter((site) => {
    if (filter === "attention" && !needsAttention(site)) return false;
    if (!term) return true;
    return (
      site.name.toLowerCase().includes(term) ||
      (site.location ?? "").toLowerCase().includes(term) ||
      site.slug.toLowerCase().includes(term)
    );
  });

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-advo-blue to-advo-blue-hover text-white shadow-sm">
            <Wifi className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-black tracking-tight text-advo-text sm:text-xl">
              {t("nav.sites")}
            </h1>
            <p className="truncate text-[11px] text-advo-muted">{t("reseller.sites.subtitle")}</p>
          </div>
          <HealthPill attentionCount={attentionCount} t={t} />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            className="inline-flex items-center gap-1.5 rounded-xl bg-advo-blue px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-advo-blue-hover active:scale-[0.98]"
            onClick={() => setShowCreateForm((open) => !open)}
            style={{ boxShadow: "0 2px 8px rgba(27, 94, 164, 0.3)" }}
            type="button"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{t("reseller.sites.action.register")}</span>
          </button>
        </div>
      </div>

      {/* ── KPI tiles ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          hint={t("reseller.sites.kpi.sitesHint")}
          icon={Wifi}
          label={t("reseller.sites.kpi.sites")}
          testId="kpi-sites"
          tone="blue"
          value={siteList.length}
        />
        <StatTile
          hint={t("reseller.sites.kpi.readyHint")}
          icon={Activity}
          label={t("reseller.sites.kpi.ready")}
          testId="kpi-ready"
          tone="emerald"
          value={readyCount}
        />
        <StatTile
          hint={t("reseller.sites.kpi.attentionHint")}
          icon={AlertTriangle}
          label={t("reseller.sites.kpi.attention")}
          testId="kpi-attention"
          tone="amber"
          value={attentionCount}
        />
      </div>

      {showCreateForm ? (
        <Card className="border-advo-blue/30 p-5">
          <FormHeading
            icon={Plus}
            onClose={() => setShowCreateForm(false)}
            t={t}
            title={t("reseller.sites.create.title")}
          />

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void createSite.run(event.currentTarget);
            }}
          >
            {createSite.error ? <InlineAlert>{createSite.error}</InlineAlert> : null}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <TextField
                defaultValue={businessName}
                hint={t("reseller.sites.businessDefaultHint")}
                id="create-site-name"
                key={businessName || "site-name"}
                label={t("reseller.sites.field.name")}
                name="name"
                placeholder={t("reseller.sites.field.namePlaceholder")}
                required
              />
              <TextField
                id="create-site-location"
                label={t("reseller.sites.field.location")}
                name="location"
                placeholder={t("reseller.sites.field.locationPlaceholder")}
              />
              <TextField
                id="create-site-portal-title"
                label={t("reseller.sites.field.portalTitle")}
                name="portalTitle"
                placeholder={t("reseller.sites.field.portalTitlePlaceholder")}
              />
              <TextField
                id="create-site-portal-message"
                label={t("reseller.sites.field.portalMessage")}
                name="portalMessage"
                placeholder={t("reseller.sites.field.portalMessagePlaceholder")}
              />
            </div>

            <FormActions
              onCancel={() => setShowCreateForm(false)}
              pending={createSite.pending}
              pendingLabel={t("reseller.sites.create.pending")}
              submitLabel={t("reseller.sites.create.submit")}
              t={t}
            />
          </form>
        </Card>
      ) : null}

      {/* ── Sites ── */}
      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-black tracking-tight text-advo-text">
            {t("reseller.sites.registered.title")}
            <span className="ml-1.5 font-bold text-advo-muted">
              {t("reseller.sites.registered.count", { count: siteList.length })}
            </span>
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-advo-muted" />
              <input
                aria-label={t("reseller.sites.search.placeholder")}
                className="w-full rounded-xl border border-advo-border bg-white py-1.5 pl-8 pr-7 text-xs font-medium text-advo-text transition placeholder:text-advo-muted focus:border-advo-blue focus:outline-none sm:w-56"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("reseller.sites.search.placeholder")}
                type="search"
                value={query}
              />
              {query ? (
                <button
                  aria-label={t("reseller.sites.search.clear")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-advo-muted transition hover:bg-slate-100 hover:text-advo-text"
                  onClick={() => setQuery("")}
                  type="button"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </div>

            <div
              aria-label={t("reseller.sites.filter.all")}
              className="inline-flex items-center gap-0.5 rounded-xl border border-advo-border bg-white p-0.5"
              role="group"
            >
              {(["all", "attention"] as const).map((key) => {
                const active = filter === key;
                return (
                  <button
                    aria-pressed={active}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                      active ? "bg-advo-blue text-white shadow-xs" : "text-advo-muted hover:text-advo-text"
                    }`}
                    key={key}
                    onClick={() => setFilter(key)}
                    type="button"
                  >
                    {key === "attention" ? <AlertTriangle className="h-3 w-3" /> : null}
                    {key === "all" ? t("reseller.sites.filter.all") : t("reseller.sites.filter.attention")}
                    {key === "attention" && attentionCount > 0 ? (
                      <span className="rounded-full bg-white/25 px-1 text-[10px]">{attentionCount}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <ResourceView resource={sites}>
          {(rows) =>
            rows.length === 0 ? (
              <EmptyCard
                body={t("reseller.sites.empty.body")}
                cta={t("reseller.sites.empty.cta")}
                icon={Wifi}
                onAction={() => setShowCreateForm(true)}
                title={t("reseller.sites.empty.title")}
              />
            ) : visibleSites.length === 0 ? (
              <Card className="p-6 text-center text-xs text-advo-muted">
                {t("reseller.sites.search.noMatch", { query })}
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visibleSites.map((site) => (
                  <SiteCard
                    copied={copiedId === site.id}
                    key={site.id}
                    onCopy={() => copyToClipboard(`${PORTAL_URL}/${site.slug}`, site.id)}
                    onReload={sites.reload}
                    site={site}
                    t={t}
                  />
                ))}
              </div>
            )
          }
        </ResourceView>
      </section>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Presentational pieces
 * ───────────────────────────────────────────────────────────────────────────*/

const TILE_TONES = {
  blue: {
    bar: "from-advo-blue to-advo-blue-hover",
    icon: "bg-advo-blue/10 text-advo-blue",
  },
  emerald: {
    bar: "from-emerald-500 to-emerald-400",
    icon: "bg-emerald-50 text-emerald-600",
  },
  amber: {
    bar: "from-advo-gold to-advo-orange",
    icon: "bg-amber-50 text-advo-gold",
  },
} as const;

/**
 * KPI tile. The number is the hero and the hint is one short line — the long
 * explanatory sentence this used to carry is gone, because the tile next to it
 * already implied it.
 */
function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  testId,
}: {
  label: string;
  value: number;
  hint: string;
  icon: LucideIcon;
  tone: keyof typeof TILE_TONES;
  testId: string;
}) {
  const palette = TILE_TONES[tone];
  return (
    <Card className="relative overflow-hidden p-4" data-testid={testId}>
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${palette.bar}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-bold uppercase tracking-wider text-advo-muted">{label}</p>
          <p className="mt-1 text-3xl font-black leading-none tracking-tight text-advo-text">{value}</p>
        </div>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${palette.icon}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 truncate text-[11px] font-semibold text-advo-muted">{hint}</p>
    </Card>
  );
}

/** One-line health summary next to the page title. */
function HealthPill({ attentionCount, t }: { attentionCount: number; t: I18n["t"] }) {
  const healthy = attentionCount === 0;
  return (
    <span
      className={`hidden shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold sm:inline-flex ${
        healthy
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-amber-200 bg-amber-50 text-amber-700"
      }`}
    >
      {healthy ? (
        <Activity className="h-3 w-3" />
      ) : (
        <AlertTriangle className="h-3 w-3" />
      )}
      {healthy
        ? t("reseller.sites.health.healthy")
        : t("reseller.sites.health.attention", { count: attentionCount })}
    </span>
  );
}

/**
 * A site card. The status help line only appears when the site is *not* ready —
 * "Ready to use" under a chip that already says "Ready" was pure noise — so a
 * healthy grid stays quiet and only the sites needing action speak up.
 */
function SiteCard({
  site,
  t,
  copied,
  onCopy,
  onReload,
}: {
  site: SiteRow;
  t: I18n["t"];
  copied: boolean;
  onCopy: () => void;
  onReload: () => void | Promise<void>;
}) {
  const attention = needsAttention(site);
  const ready = site.state === "READY";
  const portalUrl = `${PORTAL_URL}/${site.slug}`;

  return (
    <Card className="flex flex-col p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
              ready ? "bg-emerald-50 text-emerald-600" : attention ? "bg-red-50 text-red-600" : "bg-advo-blue/10 text-advo-blue"
            }`}
          >
            <Wifi className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-advo-text" title={site.name}>
              {site.name}
            </h3>
            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-advo-muted">
              <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
              <span className="truncate">{site.location || t("reseller.sites.noLocation")}</span>
            </p>
          </div>
        </div>
        <StatusChip tone={statusTone(site.state)}>{siteStateLabel(t, site.state)}</StatusChip>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-advo-border/60 bg-advo-page px-2.5 py-2">
          <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
            <Cpu className="h-2.5 w-2.5" />
            {t("reseller.sites.controller")}
          </p>
          <p className="mt-0.5 truncate text-[11px] font-bold text-advo-text" title={site.mapping?.controller.name ?? "Default"}>
            {site.mapping?.controller.name || "Default"}
          </p>
        </div>
        <div className="rounded-xl border border-advo-border/60 bg-advo-page px-2.5 py-2">
          <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
            <Radio className="h-2.5 w-2.5" />
            {t("reseller.sites.devicesConnected")}
          </p>
          <p className="mt-0.5 text-[11px] font-bold text-advo-text">
            {t("reseller.sites.devicesCount", { count: site._count.devices })}
          </p>
        </div>
      </div>

      {/* Progressive disclosure: only alert the operator when there is something to do. */}
      {!ready ? (
        <p
          className={`mt-2 flex items-start gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-medium ${
            attention ? "bg-red-50 text-red-700" : "bg-advo-page text-advo-muted"
          }`}
        >
          {attention ? <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> : null}
          <span>{siteStateHelp(t, site.state)}</span>
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-1.5 border-t border-advo-border/60 pt-3">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-xl border border-advo-border bg-slate-50 px-2.5 py-1.5">
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-advo-text select-all" title={portalUrl}>
            /{site.slug}
          </span>
          <button
            aria-label={copied ? t("reseller.sites.copy.copied") : t("reseller.sites.copy.label")}
            className="shrink-0 rounded-lg p-1 text-advo-muted transition hover:bg-white hover:text-advo-text"
            onClick={onCopy}
            title={t("reseller.sites.copy.title")}
            type="button"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <a
            aria-label={t("reseller.sites.copy.openLabel")}
            className="shrink-0 rounded-lg p-1 text-advo-blue transition hover:bg-white"
            href={portalUrl}
            rel="noreferrer"
            target="_blank"
            title={t("reseller.sites.copy.openTitle")}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        {attention ? (
          <ActionButton onDone={onReload} onRun={() => api.post(`/reseller/sites/${site.id}/reprovision`)} variant="secondary">
            {t("reseller.sites.reprovision")}
          </ActionButton>
        ) : null}
      </div>
    </Card>
  );
}

function EmptyCard({
  icon: Icon,
  title,
  body,
  cta,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  cta: string;
  onAction: () => void;
}) {
  return (
    <Card className="p-8 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-advo-blue/10 text-advo-blue">
        <Icon className="h-6 w-6" />
      </span>
      <h3 className="mt-3 text-sm font-bold text-advo-text">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-xs text-advo-muted">{body}</p>
      <button
        className="mt-4 rounded-xl bg-advo-blue px-4 py-2 text-xs font-bold text-white transition hover:bg-advo-blue-hover"
        onClick={onAction}
        type="button"
      >
        {cta}
      </button>
    </Card>
  );
}

function FormHeading({
  title,
  icon: Icon,
  iconClass = "text-advo-blue",
  onClose,
  t,
}: {
  title: string;
  icon: LucideIcon;
  iconClass?: string;
  onClose: () => void;
  t: I18n["t"];
}) {
  return (
    <div className="mb-4 flex items-center justify-between border-b border-advo-border pb-3">
      <h2 className="flex items-center gap-2 text-sm font-black text-advo-text">
        <Icon className={`h-4 w-4 ${iconClass}`} />
        {title}
      </h2>
      <button
        className="rounded-lg px-2 py-1 text-xs font-bold text-advo-muted transition hover:bg-slate-100 hover:text-advo-text"
        onClick={onClose}
        type="button"
      >
        {t("reseller.sites.close")}
      </button>
    </div>
  );
}

function TextField({
  id,
  name,
  label,
  placeholder,
  required,
  mono,
  uppercase,
  defaultValue,
  hint,
}: {
  id: string;
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  mono?: boolean;
  uppercase?: boolean;
  defaultValue?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-bold text-advo-text" htmlFor={id}>
        {label}
      </label>
      <input
        className={`w-full rounded-field border border-advo-border bg-advo-page px-3.5 py-2.5 text-xs text-advo-text transition placeholder:text-advo-muted focus:border-advo-blue focus:bg-white focus:outline-none ${
          mono ? "font-mono font-bold" : "font-medium"
        } ${uppercase ? "uppercase" : ""}`}
        defaultValue={defaultValue}
        id={id}
        name={name}
        placeholder={placeholder}
        required={required}
        type="text"
      />
      {hint ? <p className="text-[10px] text-advo-muted">{hint}</p> : null}
    </div>
  );
}

function FormActions({
  onCancel,
  submitLabel,
  pendingLabel,
  pending,
  tone = "blue",
  t,
}: {
  onCancel: () => void;
  submitLabel: string;
  pendingLabel: string;
  pending: boolean;
  tone?: "blue" | "gold";
  t: I18n["t"];
}) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button
        className="rounded-xl border border-advo-border px-4 py-2 text-xs font-bold text-advo-muted transition hover:bg-slate-50"
        onClick={onCancel}
        type="button"
      >
        {t("common.cancel")}
      </button>
      <button
        className={`rounded-xl px-5 py-2 text-xs font-bold shadow-sm transition disabled:opacity-60 ${
          tone === "gold" ? "bg-advo-gold text-slate-900 hover:bg-advo-gold-hover" : "bg-advo-blue text-white hover:bg-advo-blue-hover"
        }`}
        disabled={pending}
        type="submit"
      >
        {pending ? pendingLabel : submitLabel}
      </button>
    </div>
  );
}

function InlineAlert({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-600" role="alert">
      {children}
    </div>
  );
}
