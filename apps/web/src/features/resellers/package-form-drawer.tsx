"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, Drawer, useOverlayState } from "@heroui/react";
import { formatDuration, formatTzs } from "@advo/api-client";
import type { MessageKey, TranslateVars } from "@advo/i18n";
import { Notice } from "@advo/ui";
import { useI18n } from "@/lib/i18n";
import {
  Check,
  Clock,
  Database,
  Gauge,
  MapPin,
  Minus,
  Package as PackageIcon,
  Plus,
  Smartphone,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────
 * Draft model
 * ───────────────────────────────────────────────────────────────────────── */

/** The revision fields the form reads back when reopening an existing package. */
export type PackageRevisionDraft = {
  revision: number;
  name: string;
  priceTzs: string;
  durationSeconds: number;
  downloadKbps: number | null;
  uploadKbps: number | null;
  quotaType: string;
  quotaBytes: string | null;
  maxDevices: number;
};

export type PackageFormSite = { id: string; name: string; state: string };

/**
 * What the Controller at a site can actually enforce. The form reads this before
 * offering a cap, so a save never fails with a capability error the reseller
 * could not have predicted.
 */
export type PackageFormSiteOptions = {
  siteId: string;
  name: string;
  authorizeClient: boolean;
  speedLimits: boolean;
  totalQuota: boolean;
};

export type PackageQuotaType = "UNLIMITED" | "TOTAL";

export type PackageDraft = {
  name: string;
  priceTzs: string;
  /** A standard duration in seconds, or `"custom"` to read `customMinutes`. */
  duration: number | "custom";
  customMinutes: string;
  downloadMbps: string;
  uploadMbps: string;
  quotaType: PackageQuotaType;
  quotaGb: string;
  maxDevices: number;
  siteIds: string[];
};

/**
 * The standard durations the catalog offers, shortest first.
 *
 * A reseller thinks in a top-up ladder — 1h → 3h → 6h → 1d → 7d → 30d — so the
 * chips follow selling order rather than the size of the underlying seconds.
 * Keys, not labels: the option text resolves in the active language at render.
 */
export const DURATION_CHOICES = [
  { seconds: 3600, key: "reseller.packages.duration.1h" },
  { seconds: 10800, key: "reseller.packages.duration.3h" },
  { seconds: 21600, key: "reseller.packages.duration.6h" },
  { seconds: 86400, key: "reseller.packages.duration.1d" },
  { seconds: 604800, key: "reseller.packages.duration.7d" },
  { seconds: 2592000, key: "reseller.packages.duration.30d" },
] as const satisfies ReadonlyArray<{ seconds: number; key: MessageKey }>;
const QUOTA_TYPES = ["UNLIMITED", "TOTAL"] as const satisfies ReadonlyArray<PackageQuotaType>;

const QUOTA_LABEL_KEY: Record<PackageQuotaType, MessageKey> = {
  UNLIMITED: "reseller.packages.form.quotaType.unlimited",
  TOTAL: "reseller.packages.form.quotaType.total",
};

/** Caps a reseller reaches for most; one tap fills an editable speed profile. */
const SPEED_PRESETS = [2, 5, 10, 20] as const;

/** A blank draft, used when the drawer opens to create rather than edit. */
export function emptyDraft(): PackageDraft {
  return {
    name: "",
    priceTzs: "",
    duration: 3600,
    customMinutes: "",
    downloadMbps: "",
    uploadMbps: "",
    quotaType: "UNLIMITED",
    quotaGb: "",
    maxDevices: 1,
    siteIds: [],
  };
}

/** Seeds the draft from the revision being edited, keeping every field as text. */
export function draftFromRevision(revision: PackageRevisionDraft | null, assignedSiteIds: string[]): PackageDraft {
  if (!revision) return emptyDraft();
  const standard = DURATION_CHOICES.find((choice) => choice.seconds === revision.durationSeconds);
  // Rolling daily/monthly windows stopped being sellable: a revision written
  // before that is shown as a total cap of the same size, so editing it cannot
  // silently drop the data allowance the guests paid for.
  const quotaType: PackageQuotaType =
    revision.quotaType === "TOTAL" || revision.quotaType === "DAILY" || revision.quotaType === "MONTHLY"
      ? "TOTAL"
      : "UNLIMITED";
  return {
    name: revision.name,
    priceTzs: String(revision.priceTzs),
    // A duration outside the standard ladder is carried as custom minutes rather
    // than silently snapped to the nearest preset — the reseller chose it.
    duration: standard ? standard.seconds : "custom",
    customMinutes: standard ? "" : String(Math.round(revision.durationSeconds / 60)),
    downloadMbps: revision.downloadKbps ? String(revision.downloadKbps / 1024) : "",
    uploadMbps: revision.uploadKbps ? String(revision.uploadKbps / 1024) : "",
    quotaType,
    quotaGb:
      revision.quotaBytes && quotaType !== "UNLIMITED"
        ? String(Math.round((Number(revision.quotaBytes) / 1024 ** 3) * 10) / 10)
        : "",
    maxDevices: revision.maxDevices,
    siteIds: assignedSiteIds,
  };
}

/** The duration the draft resolves to, or `0` while a custom value is missing. */
export function durationSecondsOf(draft: PackageDraft): number {
  if (draft.duration !== "custom") return draft.duration;
  const minutes = Number(draft.customMinutes);
  return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : 0;
}

/**
 * The exact request body `POST/PUT /reseller/packages` expects.
 *
 * The server rejects a package whose `quotaBytes` disagrees with its
 * `quotaType` ("required for quota packages, omitted for UNLIMITED"), so the
 * shape is settled here rather than left to the caller: an unlimited package
 * can never carry a stray cap.
 */
export function packageBodyFromDraft(draft: PackageDraft) {
  const download = Number(draft.downloadMbps);
  const upload = Number(draft.uploadMbps);
  const gb = Number(draft.quotaGb);
  const capped = draft.quotaType !== "UNLIMITED";
  return {
    name: draft.name.trim(),
    priceTzs: draft.priceTzs,
    durationSeconds: durationSecondsOf(draft),
    downloadKbps: draft.downloadMbps && download > 0 ? Math.round(download * 1024) : undefined,
    uploadKbps: draft.uploadMbps && upload > 0 ? Math.round(upload * 1024) : undefined,
    quotaType: draft.quotaType,
    quotaBytes: capped && draft.quotaGb && gb > 0 ? String(Math.round(gb * 1024 ** 3)) : undefined,
    maxDevices: draft.maxDevices,
    siteIds: draft.siteIds,
  };
}

/**
 * What the sites chosen in the draft can actually enforce. `speedBlockedSites`
 * and `quotaBlockedSites` are already joined for display, because the blocker is
 * deliberately a plain message key plus vars.
 */
export type PackageDraftCapabilities = {
  authorizeClient: boolean;
  speedLimits: boolean;
  totalQuota: boolean;
  unreadySites: string;
  speedBlockedSites: string;
  quotaBlockedSites: string;
};

/**
 * Why the draft cannot be submitted yet, or `null` when it is complete.
 *
 * Returned as a message key so the caller translates it once, in place; the
 * form has no opinion about language. The capability checks mirror the server's
 * `enforcementGaps`, so the form explains a rejection before the request is sent.
 */
export function draftBlocker(
  draft: PackageDraft,
  caps?: PackageDraftCapabilities | null,
): { key: MessageKey; vars?: TranslateVars } | null {
  const price = Number(draft.priceTzs);
  const named = draft.name.trim().length >= 2;
  const priced = Number.isFinite(price) && price > 0;

  if (!named || !priced) return { key: "reseller.packages.form.summary.empty" };
  if (!/^\d{1,15}$/.test(draft.priceTzs.trim())) return { key: "reseller.packages.form.invalidPrice" };
  if (price < 500) return { key: "reseller.packages.form.belowMinimum" };
  const duration = durationSecondsOf(draft);
  if (duration < 60) return { key: "reseller.packages.form.noDuration" };
  if (duration > 366 * 86400) return { key: "reseller.packages.form.durationTooLong" };
  if (caps && !caps.authorizeClient) {
    return { key: "reseller.packages.form.capability.siteNotReady", vars: { sites: caps.unreadySites } };
  }
  const speeds = [draft.downloadMbps, draft.uploadMbps]
    .filter((value) => value.trim() !== "")
    .map((value) => Number(value) * 1024);
  if (speeds.some((kbps) => !Number.isFinite(kbps) || kbps < 64)) {
    return { key: "reseller.packages.form.speedTooLow" };
  }
  if (speeds.some((kbps) => kbps > 10_000_000)) {
    return { key: "reseller.packages.form.speedTooHigh" };
  }
  if (draft.quotaType !== "UNLIMITED" && !(Number(draft.quotaGb) > 0)) {
    return { key: "reseller.packages.form.section.dataHint" };
  }
  if ((draft.downloadMbps || draft.uploadMbps) && caps && !caps.speedLimits) {
    return { key: "reseller.packages.form.capability.speedUnsupported", vars: { sites: caps.speedBlockedSites } };
  }
  if (draft.quotaType !== "UNLIMITED" && caps && !caps.totalQuota) {
    return { key: "reseller.packages.form.capability.quotaUnsupported", vars: { sites: caps.quotaBlockedSites } };
  }
  return null;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Drawer
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * The package form, as a right-hand popup.
 *
 * Fields are grouped into the questions a reseller answers in order
 * (basics → duration → speed → data → devices → sites), each stating why it is
 * being asked instead of showing a bare label.
 */
export function PackageFormDrawer({
  open,
  editingName,
  editingRevision,
  initialDraft,
  sites,
  siteOptions,
  siteOptionsError,
  sitesError,
  sitesLoading,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  open: boolean;
  /** Present when editing; drives the header, eyebrow and revision badge. */
  editingName?: string | null;
  editingRevision?: PackageRevisionDraft | null;
  initialDraft: PackageDraft;
  sites: PackageFormSite[];
  /** Per-site enforcement, from `GET /reseller/package-options`. */
  siteOptions: PackageFormSiteOptions[];
  siteOptionsError: string | null;
  sitesError: string | null;
  sitesLoading: boolean;
  pending: boolean;
  error: string | null;
  onSubmit: (draft: PackageDraft) => void;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const overlay = useOverlayState({ isOpen: open, onOpenChange: (next) => (!next ? onClose() : undefined) });
  const [draft, setDraft] = useState<PackageDraft>(initialDraft);

  // Re-seed whenever the drawer opens or the row being edited changes, so a
  // cancelled edit can never leak into the next one.
  useEffect(() => {
    if (open) setDraft(initialDraft);
  }, [open, initialDraft]);

  const editing = Boolean(editingName);
  const patch = (next: Partial<PackageDraft>) => setDraft((current) => ({ ...current, ...next }));

  const seconds = durationSecondsOf(draft);
  const price = Number(draft.priceTzs);
  const priceValid = Number.isFinite(price) && price > 0;
  const capped = draft.quotaType !== "UNLIMITED";

  /**
   * Enforcement only matters at the sites that will sell the package. With none
   * selected there is nothing to enforce yet, so the form stays open and says
   * plainly that the package is invisible until it is assigned.
   */
  const caps = useMemo<PackageDraftCapabilities>(() => {
    const scope = new Set(draft.siteIds);
    const evaluated = siteOptions.filter((option) => scope.has(option.siteId));
    const blocked = (supports: (option: PackageFormSiteOptions) => boolean) =>
      evaluated.filter((option) => !supports(option)).map((option) => option.name);
    const unready = blocked((option) => option.authorizeClient);
    const speedBlocked = blocked((option) => option.speedLimits);
    const quotaBlocked = blocked((option) => option.totalQuota);
    return {
      authorizeClient: unready.length === 0,
      speedLimits: speedBlocked.length === 0,
      totalQuota: quotaBlocked.length === 0,
      unreadySites: unready.join(", "),
      speedBlockedSites: speedBlocked.join(", "),
      quotaBlockedSites: quotaBlocked.join(", "),
    };
  }, [draft.siteIds, siteOptions]);

  const blocker = draftBlocker(draft, caps);
  const allSelected = sites.length > 0 && draft.siteIds.length === sites.length;
  const selectedCount = draft.siteIds.length;

  const toggleSite = (siteId: string) =>
    patch({
      siteIds: draft.siteIds.includes(siteId)
        ? draft.siteIds.filter((id) => id !== siteId)
        : [...draft.siteIds, siteId],
    });

  return (
    <Drawer.Root state={overlay}>
      <Drawer.Backdrop>
        <Drawer.Content placement="right">
          <Drawer.Dialog className="w-full max-w-none bg-white p-0 sm:w-[600px] sm:max-w-[94vw] xl:w-[680px]">
            {/* ── Header ── */}
            <Drawer.Header className="relative border-b border-[var(--advo-border)] bg-gradient-to-br from-white via-white to-[var(--advo-blue-soft)] px-6 py-5">
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-advo-blue via-advo-gold to-advo-orange"
              />
              <div className="flex items-start gap-3.5 pr-10">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-advo-blue text-white shadow-advo-card">
                  <PackageIcon className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold tracking-wider text-advo-blue uppercase">
                    {editing ? t("reseller.packages.form.eyebrow.edit") : t("reseller.packages.form.eyebrow.create")}
                  </p>
                  <Drawer.Heading className="mt-0.5 truncate text-base font-black text-advo-text">
                    {editing
                      ? t("reseller.packages.form.editTitle", {
                          name: editingName ?? "",
                          revision: (editingRevision?.revision ?? 0) + 1,
                        })
                      : t("reseller.packages.form.createTitle")}
                  </Drawer.Heading>
                  <p className="mt-0.5 text-xs text-advo-muted">
                    {editing ? t("reseller.packages.form.editHint") : t("reseller.packages.form.createHint")}
                  </p>
                </div>
              </div>
            </Drawer.Header>

            {/* ── Body ── */}
            <Drawer.Body className="mx-0 mt-0 space-y-5 overflow-y-auto bg-[var(--advo-page)] px-6 py-6">
              {/* 1 · Basics */}
              <Section
                index={1}
                icon={<PackageIcon />}
                title={t("reseller.packages.form.section.basics")}
                hint={t("reseller.packages.form.section.basicsHint")}
              >
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                  <LabeledInput
                    autoFocus
                    label={t("reseller.packages.form.name")}
                    onChange={(value) => patch({ name: value })}
                    placeholder={t("reseller.packages.form.namePlaceholder")}
                    value={draft.name}
                  />
                  <LabeledInput
                    label={t("reseller.packages.form.price")}
                    min={500}
                    onChange={(value) => patch({ priceTzs: value })}
                    placeholder="2000"
                    type="number"
                    value={draft.priceTzs}
                  />
                </div>
                <p
                  className={`mt-2 text-[11px] ${
                    priceValid && price < 500 ? "font-bold text-[var(--advo-danger)]" : "text-advo-muted"
                  }`}
                >
                  {t("reseller.packages.form.priceHint")}
                </p>
              </Section>

              {/* 2 · Duration */}
              <Section
                index={2}
                icon={<Clock />}
                title={t("reseller.packages.form.section.duration")}
                hint={t("reseller.packages.form.section.durationHint")}
              >
                <div className="flex flex-wrap gap-2">
                  {DURATION_CHOICES.map((choice) => (
                    <PresetChip
                      active={draft.duration === choice.seconds}
                      key={choice.seconds}
                      label={t(choice.key)}
                      onClick={() => patch({ duration: choice.seconds, customMinutes: "" })}
                    />
                  ))}
                  <PresetChip
                    active={draft.duration === "custom"}
                    label={t("reseller.packages.form.preset.custom")}
                    onClick={() => patch({ duration: "custom" })}
                    title={t("reseller.packages.form.preset.customHint")}
                  />
                </div>
                {draft.duration === "custom" ? (
                  <div className="mt-3 max-w-[220px]">
                    <LabeledInput
                      label={t("reseller.packages.form.customMinutes")}
                      min={1}
                      onChange={(value) => patch({ customMinutes: value })}
                      placeholder="90"
                      type="number"
                      value={draft.customMinutes}
                    />
                  </div>
                ) : null}
              </Section>

              {/* 3 · Speed */}
              <Section
                index={3}
                icon={<Gauge />}
                title={t("reseller.packages.form.section.speed")}
                hint={t("reseller.packages.form.section.speedHint")}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold tracking-wider text-advo-muted uppercase">
                    {t("reseller.packages.form.speed.presetHint")}
                  </span>
                  {SPEED_PRESETS.map((mbps) => (
                    <PresetChip
                      active={draft.downloadMbps === String(mbps)}
                      key={mbps}
                      label={`${mbps} Mbps`}
                      // One tap sets the symmetrical profile most hotspots sell;
                      // upload stays editable for asymmetric uplinks.
                      onClick={() =>
                        patch({ downloadMbps: String(mbps), uploadMbps: draft.uploadMbps || String(mbps) })
                      }
                    />
                  ))}
                </div>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <LabeledInput
                    adornment="↓"
                    label={t("reseller.packages.form.download")}
                    min={0.1}
                    onChange={(value) => patch({ downloadMbps: value })}
                    placeholder={t("reseller.packages.form.downloadPlaceholder")}
                    step={0.1}
                    type="number"
                    value={draft.downloadMbps}
                  />
                  <LabeledInput
                    adornment="↑"
                    label={t("reseller.packages.form.upload")}
                    min={0.1}
                    onChange={(value) => patch({ uploadMbps: value })}
                    placeholder={t("reseller.packages.form.uploadPlaceholder")}
                    step={0.1}
                    type="number"
                    value={draft.uploadMbps}
                  />
                </div>
                {!caps.speedLimits ? (
                  <p className="mt-2 text-[11px] font-semibold text-[var(--advo-danger)]" role="alert">
                    {t("reseller.packages.form.capability.speedHint", { sites: caps.speedBlockedSites })}
                  </p>
                ) : null}
              </Section>

              {/* 4 · Data quota */}
              <Section
                index={4}
                icon={<Database />}
                title={t("reseller.packages.form.section.data")}
                hint={t("reseller.packages.form.section.dataHint")}
              >
                <div className="flex flex-wrap gap-2">
                  {QUOTA_TYPES.map((type) => (
                    <PresetChip
                      active={draft.quotaType === type}
                      disabled={type === "TOTAL" && !caps.totalQuota}
                      key={type}
                      label={t(QUOTA_LABEL_KEY[type])}
                      onClick={() => patch({ quotaType: type, quotaGb: type === "UNLIMITED" ? "" : draft.quotaGb })}
                    />
                  ))}
                </div>
                {!caps.totalQuota ? (
                  <p className="mt-2 text-[11px] font-semibold text-[var(--advo-danger)]" role="alert">
                    {t("reseller.packages.form.capability.quotaHint", { sites: caps.quotaBlockedSites })}
                  </p>
                ) : null}
                {/* The cap field exists only when the policy uses it, so an
                    unlimited package can never submit a stray quotaBytes. */}
                {capped ? (
                  <div className="mt-3 max-w-[240px]">
                    <LabeledInput
                      label={t("reseller.packages.form.quotaGb")}
                      min={0.1}
                      onChange={(value) => patch({ quotaGb: value })}
                      placeholder={t("reseller.packages.form.quotaGbPlaceholder")}
                      step={0.1}
                      type="number"
                      value={draft.quotaGb}
                    />
                  </div>
                ) : null}
              </Section>

              {/* 5 · Devices */}
              <Section
                index={5}
                icon={<Smartphone />}
                title={t("reseller.packages.form.section.devices")}
                hint={t("reseller.packages.form.section.devicesHint")}
              >
                <div className="flex items-center gap-3">
                  <StepperButton
                    disabled={draft.maxDevices <= 1}
                    label={t("reseller.packages.form.devices.decrease")}
                    onClick={() => patch({ maxDevices: Math.max(1, draft.maxDevices - 1) })}
                  >
                    <Minus className="size-4" />
                  </StepperButton>
                  <span className="min-w-[9.5rem] text-center text-sm font-bold text-advo-text">
                    {draft.maxDevices === 1
                      ? t("reseller.packages.form.devices.one")
                      : t("reseller.packages.form.devices.many", { count: draft.maxDevices })}
                  </span>
                  <StepperButton
                    disabled={draft.maxDevices >= 10}
                    label={t("reseller.packages.form.devices.increase")}
                    onClick={() => patch({ maxDevices: Math.min(10, draft.maxDevices + 1) })}
                  >
                    <Plus className="size-4" />
                  </StepperButton>
                </div>
              </Section>

              {/* 6 · Sites */}
              <Section
                index={6}
                icon={<MapPin />}
                title={t("reseller.packages.form.section.sites")}
                hint={t("reseller.packages.form.section.sitesHint")}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-advo-muted">
                    {sites.length === 0
                      ? t("reseller.packages.form.sitesEmpty")
                      : t("reseller.packages.form.sites.selectedCount", {
                          selected: selectedCount,
                          total: sites.length,
                        })}
                  </p>
                  {sites.length > 0 ? (
                    <button
                      className="text-[11px] font-bold text-advo-blue hover:underline"
                      onClick={() => patch({ siteIds: allSelected ? [] : sites.map((site) => site.id) })}
                      type="button"
                    >
                      {allSelected
                        ? t("reseller.packages.form.sites.clear")
                        : t("reseller.packages.form.sites.selectAll")}
                    </button>
                  ) : null}
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {sites.map((site) => {
                    const checked = draft.siteIds.includes(site.id);
                    return (
                      <button
                        aria-pressed={checked}
                        className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition ${
                          checked
                            ? "border-advo-blue bg-[var(--advo-blue-soft)] shadow-advo-field"
                            : "border-[var(--advo-border)] bg-white hover:border-advo-blue/50"
                        }`}
                        key={site.id}
                        onClick={() => toggleSite(site.id)}
                        type="button"
                      >
                        <span
                          className={`grid size-5 shrink-0 place-items-center rounded-md border transition ${
                            checked
                              ? "border-advo-blue bg-advo-blue text-white"
                              : "border-slate-300 bg-white text-transparent"
                          }`}
                        >
                          <Check className="size-3" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-bold text-advo-text">{site.name}</span>
                          <span className="block text-[10px] font-semibold text-advo-muted">{site.state}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {!caps.authorizeClient ? (
                  <p className="mt-3 text-xs font-semibold text-[var(--advo-danger)]" role="alert">
                    {t("reseller.packages.form.capability.siteNotReady", { sites: caps.unreadySites })}
                  </p>
                ) : null}
                {selectedCount === 0 && sites.length > 0 ? (
                  <p className="mt-3 text-[11px] font-semibold text-amber-700">
                    {t("reseller.packages.form.sitesNoneSelected")}
                  </p>
                ) : null}

                {sitesError ? (
                  <p className="mt-3 text-xs font-semibold text-[var(--advo-danger)]" role="alert">
                    {t("reseller.packages.form.sitesLoadError", { reason: sitesError })}
                  </p>
                ) : siteOptionsError ? (
                  <p className="mt-3 text-xs font-semibold text-[var(--advo-danger)]" role="alert">
                    {t("reseller.packages.form.capability.optionsLoadError", { reason: siteOptionsError })}
                  </p>
                ) : sitesLoading && sites.length === 0 ? (
                  <p className="mt-3 text-xs text-advo-muted">{t("reseller.packages.form.sitesLoading")}</p>
                ) : null}
              </Section>

              {error ? <Notice tone="danger">{error}</Notice> : null}
            </Drawer.Body>

            {/* ── Footer ── */}
            <Drawer.Footer className="flex flex-col gap-3 border-t border-[var(--advo-border)] bg-white px-6 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold tracking-wider text-advo-muted uppercase">
                    {t("reseller.packages.form.summary.title")}
                  </p>
                  <p className="mt-0.5 truncate text-xs font-semibold text-advo-text">
                    {blocker
                      ? t(blocker.key, blocker.vars)
                      : [
                          formatTzs(draft.priceTzs),
                          formatDuration(seconds, locale),
                          capped ? `${draft.quotaGb} GB` : t("reseller.packages.card.unlimitedData"),
                          draft.maxDevices === 1
                            ? t("reseller.packages.form.devices.one")
                            : t("reseller.packages.form.devices.many", { count: draft.maxDevices }),
                        ].join(" · ")}
                  </p>
                </div>
                {editing && editingRevision ? (
                  <span className="shrink-0 rounded-full bg-[var(--advo-gold-soft)] px-2.5 py-1 text-[10px] font-bold text-advo-gold">
                    {t("reseller.packages.form.summary.revision", { revision: editingRevision.revision + 1 })}
                  </span>
                ) : null}
              </div>

              <div className="flex items-center gap-2.5">
                <Button className="flex-1" onPress={onClose} type="button" variant="outline">
                  {t("reseller.packages.form.cancel")}
                </Button>
                <Button
                  className="flex-1"
                  isDisabled={pending || blocker !== null}
                  onPress={() => onSubmit(draft)}
                  type="button"
                  variant="primary"
                >
                  {pending
                    ? t("reseller.packages.form.save")
                    : editing
                      ? t("reseller.packages.form.saveRevision")
                      : t("reseller.packages.form.create")}
                </Button>
              </div>
            </Drawer.Footer>

            <Drawer.CloseTrigger aria-label={t("reseller.packages.form.close")} />
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer.Root>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Small pieces
 * ───────────────────────────────────────────────────────────────────────── */

/** One numbered step of the form: a title, the reason it is asked, then fields. */
function Section({
  index,
  icon,
  title,
  hint,
  children,
}: {
  index: number;
  icon: ReactNode;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--advo-border)] bg-white p-4 shadow-advo-card">
      <header className="mb-3 flex items-start gap-2.5">
        <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-[var(--advo-surface-soft)] text-[10px] font-black text-advo-muted">
          {index}
        </span>
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-xs font-bold text-advo-text">
            <span className="text-advo-blue [&_svg]:size-3.5">{icon}</span>
            {title}
          </h3>
          <p className="mt-0.5 text-[11px] text-advo-muted">{hint}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

/** A tappable preset — the primary way a duration, quota policy or speed is chosen. */
function PresetChip({
  active,
  disabled = false,
  label,
  title,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
        disabled
          ? "cursor-not-allowed border-[var(--advo-border)] bg-[var(--advo-surface-soft)] text-slate-400"
          : active
            ? "border-advo-blue bg-advo-blue text-white shadow-advo-field"
            : "border-[var(--advo-border)] bg-white text-advo-text hover:border-advo-blue hover:text-advo-blue"
      }`}
      disabled={disabled}
      onClick={onClick}
      title={title}
      type="button"
    >
      {label}
    </button>
  );
}

function StepperButton({
  children,
  label,
  disabled,
  onClick,
}: {
  children: ReactNode;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="grid size-9 place-items-center rounded-xl border border-[var(--advo-border)] bg-white text-advo-text shadow-advo-field transition hover:border-advo-blue hover:text-advo-blue disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

/**
 * A labelled input styled to the dashboard rather than the raw HeroUI field, so
 * the popup keeps one visual language from header to footer.
 */
function LabeledInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  min,
  step,
  adornment,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number";
  placeholder?: string;
  min?: number;
  step?: number;
  /** A non-interactive marker such as ↓ / ↑ naming the field's direction. */
  adornment?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold text-advo-text">{label}</span>
      <span className="relative mt-1 block">
        {adornment ? (
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs font-bold text-advo-muted">
            {adornment}
          </span>
        ) : null}
        <input
          autoFocus={autoFocus}
          className={`w-full rounded-field border border-[var(--advo-border)] bg-white py-2.5 text-sm font-semibold text-advo-text shadow-advo-field outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-advo-blue focus:ring-2 focus:ring-advo-blue/15 ${
            adornment ? "pr-3 pl-7" : "px-3"
          }`}
          min={min}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          step={step}
          type={type}
          value={value}
        />
      </span>
    </label>
  );
}
