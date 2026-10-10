"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Card } from "@heroui/react";
import {
  HEX_COLOR_REGEX,
  MIN_BRAND_CONTRAST,
  PACKAGE_LAYOUTS,
  PORTAL_COLOR_PRESETS,
  PORTAL_PREVIEW_MESSAGE,
  PORTAL_PREVIEW_READY,
  VISIBILITY_KEYS,
  canHideAllSponsored,
  contrastRatio,
  placementOf,
  preferenceOf,
  resolveVisibility,
  type PackageCardStyle,
  type PortalPreviewAppearance,
  type ResellerEntitlementsView,
  type SitePortalPreferenceInput,
  type SitePortalStateView,
  type VisibilityKey,
  type VisibilityPreferences,
} from "@advo/contracts";
import { ApiError, formatDateTime, formatTzs } from "@advo/api-client";
import {
  Notice,
  StatusChip,
  type PortalCardLayout,
} from "@advo/ui";
import { Field, PageHero, ResourceView, SectionHeader } from "@/features/common/components";
import { BackgroundUploader, LogoUploader } from "./logo-uploader";
import { api, errorDetails, type ErrorDetail } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAction, useResource } from "@/lib/hooks";
import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  Columns3,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Inbox,
  Languages,
  Layers,
  Lock,
  Palette,
  RefreshCw,
  Rows3,
  Save,
  Smartphone,
  Sparkles,
  Type as TypeIcon,
  WifiOff,
} from "lucide-react";

/**
 * Where the guest portal is served. `NEXT_PUBLIC_PORTAL_URL` is inlined at build
 * time, matching how `sites.tsx` and `overview.tsx` link to a site's portal.
 */
const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL ?? "http://localhost:3001";

/* ─────────────────────────────────────────────────────────────────────────
 * Row shapes
 * ───────────────────────────────────────────────────────────────────────── */

type SiteOption = {
  id: string;
  name: string;
  /** Path segment the guest portal serves this site at: `{PORTAL_URL}/{slug}`. */
  slug: string;
  state: string;
  location: string | null;
  portalTitle: string | null;
  portalMessage: string | null;
};

type Revision = {
  name: string;
  priceTzs: string;
  durationSeconds: number;
  quotaType: string;
};

type PackageRow = {
  id: string;
  name: string;
  status: string;
  currentRevision: Revision | null;
  assignments: Array<{ site: { id: string; name: string } }>;
};

/**
 * Which preference field stores each placement's choice.
 *
 * The catalog key is namespaced (`ads.banner`) while the stored preference is not
 * (`banner`), because the column predates the catalog. This is the one place that
 * translation lives, so the two spellings cannot drift.
 */
const PREFERENCE_KEY: Record<VisibilityKey, keyof VisibilityPreferences> = {
  "ads.banner": "banner",
  "ads.explore": "explore",
  "discovery.promote_business": "promote_business",
  "discovery.platform_link": "platform_link",
  "discovery.jobs": "jobs",
};

/** The per-site appearance draft the reseller edits before saving. */
type AppearanceDraft = {
  primaryColor: string;
  accentColor: string;
  /**
   * Page background colour. Empty means "keep the template's paper colour", which
   * is deliberately different from an explicit near-white: a reseller who never
   * touches it should not silently store a colour they did not choose.
   */
  backgroundColor: string;
  /** Reviewed combination the colours started from, or "" once hand-edited. */
  themePreset: string;
  logoUrl: string;
  backgroundUrl: string;
  showPlatformBadge: boolean;
  packageStyle: PackageCardStyle;
  packageLayout: PortalCardLayout;
  packageOrder: string[];
  visibility: VisibilityPreferences;
  defaultLocale: "en" | "sw";
};

type Tab = "visibility" | "branding" | "packages" | "copy" | "promotions";

/** The two guest screens the designer's preview can stand on. */
type PreviewStage = "packages" | "connected";

/* ─────────────────────────────────────────────────────────────────────────
 * Screen
 * ───────────────────────────────────────────────────────────────────────── */

export function ResellerCaptivePortalScreen() {
  const { t } = useI18n();
  const entitlements = useResource<ResellerEntitlementsView>("/reseller/entitlements");
  const sites = useResource<SiteOption[]>("/reseller/sites");
  const packages = useResource<PackageRow[]>("/reseller/packages");

  const [siteId, setSiteId] = useState("");
  /**
   * Set the moment the reseller picks a site from the list themselves.
   *
   * The designer opens on a site that has something to sell, which means it may
   * move the selection once the packages arrive. That must never happen to a
   * reseller who has already chosen: they would be designing one site's page
   * while the preview showed another's.
   */
  const sitePickedByUser = useRef(false);
  const [tab, setTab] = useState<Tab>("visibility");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<AppearanceDraft | null>(null);
  const [saved, setSaved] = useState(false);
  const [visibilitySectionOpen, setVisibilitySectionOpen] = useState(false);
  /**
   * Bumped on every successful save.
   *
   * The preview is an `iframe` of the real portal, so it holds the page it loaded
   * until something makes it load again. Without this, pressing *Save design*
   * changed the database and left the phone showing the previous design — which
   * is indistinguishable from the save not working.
   */
  const [previewRevision, setPreviewRevision] = useState(0);
  /** The violation list a rejected save came back with, so the reason is shown verbatim. */
  const [violations, setViolations] = useState<ErrorDetail[]>([]);
  const lastError = useRef<ApiError | null>(null);

  const portalState = useResource<SitePortalStateView>(siteId ? `/reseller/sites/${siteId}/portal-preferences` : null);
  const site = useMemo(() => (sites.data ?? []).find((s) => s.id === siteId) ?? null, [sites.data, siteId]);

  /**
   * Every package the reseller can actually sell — a draft has no revision, so a
   * portal built on it would have a price with nothing behind it.
   */
  const sellablePackages = useMemo(() => (packages.data ?? []).filter((p) => p.currentRevision), [packages.data]);

  /** The sites that already have something to sell, named by id. */
  const sitesWithPackages = useMemo(() => {
    const assigned = new Set<string>();
    for (const pkg of sellablePackages) {
      for (const a of pkg.assignments) assigned.add(a.site.id);
    }
    return assigned;
  }, [sellablePackages]);

  // Default to the first site so the editor has something to load.
  useEffect(() => {
    if (!siteId && sites.data && sites.data.length > 0) setSiteId(sites.data[0].id);
  }, [sites.data, siteId]);

  /**
   * Whether the site the designer opened on already carries the reseller's work.
   *
   * A saved logo, background or colour is proof that this is the site they have
   * been building, so it must not be taken away from them for having no packages
   * yet. Only a site that is still untouched is a candidate for the auto-pick
   * below, which is the case the correction exists for: a reseller who priced
   * packages for their second site and lands on a blank first one.
   */
  const currentSiteHasBranding = useMemo(() => {
    const branding = portalState.data?.preference.branding;
    if (!branding) return false;
    return Boolean(
      branding.logo_url ||
        branding.background_url ||
        branding.primary_color ||
        branding.accent_color ||
        branding.background_color,
    );
  }, [portalState.data]);

  /**
   * Then move to a site that has something to sell, once we know which those are.
   *
   * This is a one-time correction, and it yields on two things: the site the
   * reseller picked themselves, and the site that already holds their design.
   * Silently switching a configured site would load someone else's colours into
   * the preview and read as the reseller's own changes having vanished.
   */
  useEffect(() => {
    if (sitePickedByUser.current || !siteId || packages.loading || portalState.loading) return;
    if (sitesWithPackages.size === 0 || sitesWithPackages.has(siteId)) return;
    // The current site's saved design is only known once its preferences have
    // answered, so an unloaded or failed request means we do not move at all.
    if (!portalState.data || currentSiteHasBranding) return;
    const preferred = (sites.data ?? []).find((candidate) => sitesWithPackages.has(candidate.id));
    if (preferred) setSiteId(preferred.id);
  }, [siteId, sites.data, sitesWithPackages, packages.loading, portalState.loading, portalState.data, currentSiteHasBranding]);

  // Load the selected site's saved appearance into the editor.
  const state = portalState.data;
  useEffect(() => {
    if (!state) return;
    const preference = state.preference;
    setDraft({
      primaryColor: preference.branding.primary_color ?? state.entitlements.branding.defaultPrimaryColor,
      accentColor: preference.branding.accent_color ?? state.entitlements.branding.defaultAccentColor,
      backgroundColor: preference.branding.background_color ?? "",
      themePreset: preference.branding.theme_preset ?? "",
      logoUrl: preference.branding.logo_url ?? "",
      backgroundUrl: preference.branding.background_url ?? "",
      showPlatformBadge: preference.branding.show_platform_badge ?? true,
      packageStyle: preference.packageStyle ?? state.entitlements.packageCards.defaultStyle,
      packageLayout: preference.packageLayout ?? state.entitlements.packageCards.defaultLayout,
      packageOrder: preference.packageOrder ?? [],
      visibility: preference.visibility ?? {},
      defaultLocale: preference.branding.default_locale ?? "en",
    });
    setSaved(false);
    setViolations([]);
  }, [state]);

  useEffect(() => {
    if (!site) return;
    setTitle(site.portalTitle ?? "");
    setMessage(site.portalMessage ?? "");
  }, [site]);

  /** The permissions in force. `null` means nothing grants anything yet. */
  const view: ResellerEntitlementsView | null = entitlements.data ?? state?.entitlements ?? null;
  const features = view?.features;

  /**
   * Saves the page copy and the appearance in one action.
   *
   * Only fields the plan allows are sent: the backend refuses the whole patch if a
   * locked field is included, so sending a disabled colour would discard the
   * changes that *were* allowed. `preferenceViolation` maps a refusal to
   * `403 FEATURE_LOCKED_BY_PLAN` with every violation attached.
   */
  const save = useAction(async () => {
    if (!siteId || !view || !features || !draft) throw new Error(t("reseller.portal.pickSite"));

    const branding: NonNullable<SitePortalPreferenceInput["branding"]> = {};
    if (draft.defaultLocale) {
      branding.default_locale = draft.defaultLocale;
    }
    if (features.branding.colors_edit) {
      branding.primary_color = draft.primaryColor;
      branding.accent_color = draft.accentColor;
      // An empty value is sent as "" so the backend clears the stored colour
      // instead of the reseller being unable to go back to the template paper.
      branding.background_color = draft.backgroundColor;
      branding.theme_preset = draft.themePreset;
    }
    if (features.branding.logo_upload) branding.logo_url = draft.logoUrl.trim();
    // Clearing a background is always allowed; only setting one needs the plan.
    if (features.branding.background_upload || !draft.backgroundUrl) branding.background_url = draft.backgroundUrl.trim();
    // Showing the badge is always allowed; only hiding it needs the permission.
    if (draft.showPlatformBadge || features.branding.platform_badge_removable) {
      branding.show_platform_badge = draft.showPlatformBadge;
    }

    // Locked placements keep whatever the reseller had: they are not sent at all.
    const visibility: VisibilityPreferences = {};
    for (const key of VISIBILITY_KEYS) {
      const policy = placementOf(features, key);
      if (policy.mode !== "OPTIONAL") continue;
      const preference = preferenceOf(draft.visibility, key);
      if (preference !== undefined) visibility[PREFERENCE_KEY[key]] = preference;
    }

    const payload: SitePortalPreferenceInput = {
      branding,
      package_cards: { style: draft.packageStyle, layout: draft.packageLayout },
      visibility,
    };
    // Ordering is only stored when the plan grants it; otherwise omitting the key
    // keeps the previous order instead of silently clearing it.
    if (features.packages.order_edit) payload.package_order = draft.packageOrder;

    setViolations([]);
    try {
      await api.put(`/reseller/sites/${siteId}`, {
        portalTitle: title.trim(),
        portalMessage: message.trim(),
      });
      await api.patch(`/reseller/sites/${siteId}/portal-preferences`, payload);
    } catch (error) {
      lastError.current = error instanceof ApiError ? error : null;
      throw error;
    }
  }, async () => {
    setSaved(true);
    setPreviewRevision((revision) => revision + 1);
    await portalState.reload();
  });

  // Surface the machine-readable violations alongside the human message. Derived
  // rather than appended to, so a new failure can never leave the previous
  // failure's violations on screen.
  useEffect(() => {
    setViolations(save.error ? errorDetails(lastError.current) : []);
  }, [save.error]);

  /** The bulk "hide everything" action, applied server-side in one transaction. */
  const hideAll = useAction(async () => {
    if (!siteId) throw new Error(t("reseller.portal.pickSite"));
    await api.patch(`/reseller/sites/${siteId}/portal-preferences`, { hide_all_sponsored: true });
  }, async () => {
    setSaved(true);
    setPreviewRevision((revision) => revision + 1);
    await portalState.reload();
  });

  function patchDraft(patch: Partial<AppearanceDraft>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
    setSaved(false);
  }

  /** Sets one placement's choice, keyed by the catalog key. */
  function setPlacementPreference(key: VisibilityKey, value: boolean) {
    setDraft((prev) => (prev ? { ...prev, visibility: { ...prev.visibility, [PREFERENCE_KEY[key]]: value } } : prev));
    setSaved(false);
  }

  function movePackage(id: string, delta: number) {
    setDraft((prev) => {
      if (!prev) return prev;
      const order = [...prev.packageOrder];
      const index = order.indexOf(id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= order.length) return prev;
      [order[index], order[target]] = [order[target], order[index]];
      return { ...prev, packageOrder: order };
    });
    setSaved(false);
  }

  /** Packages sold at this site, falling back to everything so the preview is never bare. */
  const assignedPackages = useMemo(
    () => (siteId ? sellablePackages.filter((p) => p.assignments.some((a) => a.site.id === siteId)) : []),
    [sellablePackages, siteId],
  );
  const usingFallback = assignedPackages.length === 0 && sellablePackages.length > 0;
  /**
   * Nothing sellable exists anywhere, so no preview of any site can show a
   * package — the portal's own "no packages are available" line is all there is.
   * Only claimed once the request has answered: `data` stays undefined on failure,
   * and "we could not load your packages" must not be reported as "you have none".
   */
  const noPackagesAtAll = packages.data !== undefined && sellablePackages.length === 0;

  /** Where each placement stands for this site right now. */
  const placements = useMemo(() => {
    if (!features) return [];
    return VISIBILITY_KEYS.map((key) => {
      const policy = placementOf(features, key);
      const decision = resolveVisibility(policy.mode, preferenceOf(draft?.visibility ?? {}, key), policy.default_visible);
      return { ...decision, key };
    });
  }, [features, draft?.visibility]);

  /**
   * The draft appearance the preview frame paints on top of the saved design.
   *
   * Every field is gated by the same plan feature the matching control is, so a
   * locked control cannot leak its value into the preview — and the preview shows
   * a reseller exactly what their plan lets them change, nothing more.
   */
  const previewAppearance = useMemo<PortalPreviewAppearance | null>(() => {
    if (!draft) return null;
    const colors = features?.branding.colors_edit
      ? {
          primary: draft.primaryColor,
          accent: draft.accentColor,
          ...(draft.backgroundColor ? { background: draft.backgroundColor } : {}),
          ...(draft.themePreset ? { preset: draft.themePreset } : {}),
        }
      : undefined;

    const visibility: VisibilityPreferences = {
      banner: placements.find((p) => p.key === "ads.banner")?.visible ?? draft.visibility.banner,
      explore: placements.find((p) => p.key === "ads.explore")?.visible ?? draft.visibility.explore,
      promote_business: placements.find((p) => p.key === "discovery.promote_business")?.visible ?? draft.visibility.promote_business,
      platform_link: placements.find((p) => p.key === "discovery.platform_link")?.visible ?? draft.visibility.platform_link,
      jobs: placements.find((p) => p.key === "discovery.jobs")?.visible ?? draft.visibility.jobs,
    };

    return {
      ...(colors ? { colors } : {}),
      ...(features?.branding.background_upload || draft.backgroundUrl
        ? { backgroundUrl: draft.backgroundUrl.trim() || null }
        : {}),
      ...(features?.branding.logo_upload ? { logoUrl: draft.logoUrl.trim() || null } : {}),
      cardStyle: draft.packageStyle,
      cardLayout: draft.packageLayout,
      showPlatformBadge: features?.branding.platform_badge_removable
        ? draft.showPlatformBadge
        : true,
      visibility,
      defaultLocale: draft.defaultLocale,
    };
  }, [draft, features, placements]);

  /** Applies the stored order, keeping unordered packages in their catalog position. */
  const orderedPackages = useMemo(() => {
    const list = assignedPackages.length > 0 ? assignedPackages : sellablePackages;
    const order = draft?.packageOrder ?? [];
    return [...list].sort((a, b) => {
      const ai = order.indexOf(a.id);
      const bi = order.indexOf(b.id);
      return (ai < 0 ? order.length + list.indexOf(a) : ai) - (bi < 0 ? order.length + list.indexOf(b) : bi);
    });
  }, [assignedPackages, sellablePackages, draft?.packageOrder]);

  const noPlan = view?.plan === null || view === null;
  /**
   * Distinct from `noPlan`: entitlements have finished loading and there really
   * is no plan, so the reseller needs a paid plan or a trial before the server
   * will accept a site (and therefore a portal) at all.
   */
  const planMissing = view !== null && view.plan === null;

  /** Shared styling for the one call-to-action the "no site / no plan" states offer. */
  const emptyStateCtaClass =
    "mt-4 inline-block rounded-xl bg-advo-blue px-5 py-2.5 text-xs font-bold text-white shadow-sm";

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHero
        actions={
          <Button
            isDisabled={save.pending || hideAll.pending || !siteId || noPlan}
            onPress={() => void save.run()}
            type="button"
            variant="primary"
          >
            <Save className="size-3.5" />
            {save.pending ? t("reseller.portal.saving") : t("reseller.portal.save")}
          </Button>
        }
        description={t("reseller.portal.subtitle")}
        eyebrow={t("reseller.portal.badge")}
        icon={<Palette />}
        iconTone="accent"
        title={t("reseller.portal.title")}
      />

      {saved ? <Notice tone="success">{t("reseller.portal.saved")}</Notice> : null}
      {save.error ? (
        <Notice tone="danger">
          <span className="block font-bold">{save.error}</span>
          {violations.length > 0 ? (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
              {violations.map((violation, index) => (
                // The index is part of the key on purpose. Its label is a field
                // name or placement key that the API may legitimately repeat, and
                // this list is a static snapshot of one response that never
                // reorders, so position is a stable identity here.
                <li key={`${index}:${violation.label}`}>
                  {violation.label ? (
                    <>
                      <span className="font-mono font-bold">{violation.label}</span> — {violation.message}
                    </>
                  ) : (
                    violation.message
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </Notice>
      ) : null}
      {hideAll.error ? <Notice tone="danger">{hideAll.error}</Notice> : null}
      {entitlements.error ? <Notice tone="danger">{entitlements.error.message}</Notice> : null}

      {/*
       * No plan is the real reason the designer is inert: a site (and therefore a
       * portal) cannot be created without an active plan or trial, and the server
       * refuses every preference write. Say so and point at the way out.
       */}
      {planMissing ? (
        <Notice tone="warning">
          <span className="block font-bold">{t("reseller.portal.noPlan.title")}</span>
          <span className="mt-0.5 block">{t("reseller.portal.noPlan.body")}</span>
          <Link className="mt-1.5 inline-flex font-bold underline" href="/reseller/subscription">
            {t("reseller.portal.noPlan.cta")}
          </Link>
        </Notice>
      ) : null}

      <ResourceView resource={sites}>
        {(siteRows) =>
          siteRows.length === 0 ? (
            <Card className="p-8 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-advo-blue/10 text-advo-blue">
                <Palette className="h-6 w-6" />
              </span>
              <p className="mt-3 text-sm text-advo-muted">
                {planMissing ? t("reseller.portal.noPlan.body") : t("reseller.portal.noSites")}
              </p>
              {planMissing ? (
                <Link className={emptyStateCtaClass} href="/reseller/subscription">
                  {t("reseller.portal.noPlan.cta")}
                </Link>
              ) : (
                <Link className={emptyStateCtaClass} href="/reseller/sites">
                  {t("reseller.portal.noSites.cta")}
                </Link>
              )}
            </Card>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
              {/* ── Controls ── */}
              <div className="space-y-4">
                <Card className="grid gap-4 p-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-bold text-advo-text">{t("reseller.portal.site")}</span>
                    <select
                      className="mt-1 w-full rounded-field border border-advo-border bg-advo-page px-3.5 py-2.5 text-xs font-bold text-advo-text focus:border-advo-blue focus:bg-white focus:outline-none"
                      onChange={(event) => {
                        // From here on the selection is the reseller's; the auto-pick stands down.
                        sitePickedByUser.current = true;
                        setSiteId(event.target.value);
                      }}
                      value={siteId}
                    >
                      <option value="">{t("reseller.portal.sitePlaceholder")}</option>
                      {siteRows.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <PlanSummary entitlements={view} />
                </Card>

                {view && view.overLimit.length > 0 ? (
                  <Notice tone="warning">{t("reseller.portal.plan.overLimit", { count: view.overLimit.length })}</Notice>
                ) : null}

                {/* Tabs */}
                <div className="flex flex-wrap items-center gap-0.5 rounded-xl border border-advo-border bg-white p-0.5">
                  {(["visibility", "branding", "packages", "copy", "promotions"] as const).map((id) => {
                    const active = tab === id;
                    return (
                      <button
                        className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition ${
                          active ? "bg-advo-blue text-white shadow-xs" : "text-advo-muted hover:text-advo-text"
                        }`}
                        key={id}
                        onClick={() => setTab(id)}
                        type="button"
                      >
                        {t(`reseller.portal.tab.${id}`)}
                      </button>
                    );
                  })}
                </div>

                {!draft ? (
                  <Card className="p-6 text-center text-xs text-advo-muted">
                    {portalState.loading ? t("reseller.portal.loading") : t("reseller.portal.pickSite")}
                  </Card>
                ) : null}

                {/* ── Visibility ── */}
                {draft && tab === "visibility" && features ? (
                  <div className="space-y-4">
                    <Card className="overflow-hidden p-0 border border-advo-border transition-all shadow-sm">
                      <button
                        type="button"
                        onClick={() => setVisibilitySectionOpen((open) => !open)}
                        className="w-full p-4 flex items-center justify-between gap-3 text-left transition hover:bg-advo-surface-soft/60 focus:outline-none"
                        aria-expanded={visibilitySectionOpen}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600 shadow-sm ring-1 ring-amber-500/20">
                            <Eye className="size-5" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-bold text-advo-text">
                                {t("reseller.portal.visibility.title")}
                              </h3>
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                {t("reseller.portal.visibility.activeCount", {
                                  active: placements.filter((p) => p.visible).length,
                                  total: placements.length,
                                })}
                              </span>
                            </div>
                            <p className="text-xs text-advo-muted line-clamp-1 mt-0.5">
                              {t("reseller.portal.visibility.hint")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-semibold text-advo-muted hidden sm:inline">
                            {visibilitySectionOpen ? t("reseller.portal.visibility.collapse") : t("reseller.portal.visibility.expand")}
                          </span>
                          <span className={`grid size-8 place-items-center rounded-lg border border-advo-border bg-white text-advo-muted transition-transform duration-200 shadow-xs ${visibilitySectionOpen ? "rotate-180 text-advo-blue border-advo-blue/30" : ""}`}>
                            <ChevronDown className="size-4" />
                          </span>
                        </div>
                      </button>

                      {visibilitySectionOpen ? (
                        <div className="border-t border-advo-border/60 p-4 pt-3 space-y-4 bg-gradient-to-b from-advo-surface-soft/30 to-transparent">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs text-advo-muted">
                              {t("reseller.portal.visibility.hint")}
                            </p>
                            <div className="flex items-center gap-2">
                              <Button
                                isDisabled={!canHideAllSponsored(features) || hideAll.pending}
                                onPress={() => void hideAll.run()}
                                size="sm"
                                type="button"
                                variant="outline"
                                className="text-[11px] h-7 px-2.5"
                              >
                                <EyeOff className="size-3" />
                                {t("reseller.portal.hideAll")}
                              </Button>
                              <Button
                                onPress={() => {
                                  const next: VisibilityPreferences = { ...draft.visibility };
                                  for (const key of VISIBILITY_KEYS) {
                                    if (placementOf(features, key).mode === "OPTIONAL") next[PREFERENCE_KEY[key]] = true;
                                  }
                                  patchDraft({ visibility: next });
                                }}
                                size="sm"
                                type="button"
                                variant="outline"
                                className="text-[11px] h-7 px-2.5"
                              >
                                <Eye className="size-3" />
                                {t("reseller.portal.showAllowed")}
                              </Button>
                            </div>
                          </div>

                          <ul className="space-y-2">
                            {placements.map((placement) => (
                              <PlacementControl
                                decision={placement}
                                key={placement.key}
                                onChange={(value) => setPlacementPreference(placement.key, value)}
                                planName={view?.plan?.name ?? t("reseller.portal.plan.none")}
                              />
                            ))}
                          </ul>

                          <div className="rounded-xl border border-advo-border/80 bg-advo-surface-soft/60 p-3 flex flex-wrap items-center justify-between gap-2">
                            <StatusChip tone={canHideAllSponsored(features) ? "success" : "warning"}>
                              {canHideAllSponsored(features)
                                ? t("reseller.portal.hideAllAvailable")
                                : t("reseller.portal.hideAllUnavailable")}
                            </StatusChip>
                            <p className="text-[11px] text-advo-muted">{t("reseller.portal.upsell")}</p>
                          </div>
                        </div>
                      ) : null}
                    </Card>
                  </div>
                ) : null}

                {/* ── Branding ── */}
                {draft && tab === "branding" && features ? (
                  <>
                    <Card className="gap-3 p-4">
                      <SectionHeader
                        icon={<ImageIcon />}
                        iconTone="teal"
                        title={t("reseller.portal.branding.logo")}
                      />
                      {features.branding.logo_upload ? (
                        <LogoUploader
                          onChangeUrl={(url) => patchDraft({ logoUrl: url })}
                          onClear={() => patchDraft({ logoUrl: "" })}
                          onUploaded={(logo) => patchDraft({ logoUrl: logo.url })}
                          value={draft.logoUrl}
                        />
                      ) : (
                        <LockedNote
                          planName={view?.plan?.name ?? t("reseller.portal.plan.none")}
                          reason={t("reseller.portal.branding.logoLocked")}
                        />
                      )}
                    </Card>

                    <Card className="gap-4 p-4">
                      <SectionHeader
                        description={t("reseller.portal.branding.presetsHint")}
                        icon={<Palette />}
                        iconTone="accent"
                        title={t("reseller.portal.branding.presets")}
                      />
                      {features.branding.colors_edit ? (
                        <>
                          {/* Reviewed combinations first: one tap gives a portal that is
                              known to be readable, before any hex is typed. */}
                          <div className="grid gap-2 sm:grid-cols-2">
                            {PORTAL_COLOR_PRESETS.map((preset) => {
                              const active = draft.themePreset === preset.key;
                              return (
                                <button
                                  aria-pressed={active}
                                  className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition ${
                                    active ? "border-advo-blue bg-advo-blue/5" : "border-[var(--advo-border)] bg-white hover:border-advo-blue/40"
                                  }`}
                                  key={preset.key}
                                  onClick={() =>
                                    patchDraft({
                                      themePreset: preset.key,
                                      primaryColor: preset.primary,
                                      accentColor: preset.accent,
                                      backgroundColor: preset.background,
                                    })
                                  }
                                  type="button"
                                >
                                  <span className="flex shrink-0 -space-x-1">
                                    {[preset.primary, preset.accent, preset.background].map((color) => (
                                      <span
                                        className="size-5 rounded-full ring-2 ring-white"
                                        key={color}
                                        style={{ background: color }}
                                      />
                                    ))}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-advo-text">{preset.name}</span>
                                  {active ? <CheckCircle2 className="size-3.5 shrink-0 text-advo-blue" /> : null}
                                </button>
                              );
                            })}
                          </div>

                          <div className="border-t border-[var(--advo-border)] pt-3">
                            <p className="mb-2 text-[11px] font-bold tracking-wider text-advo-muted uppercase">
                              {t("reseller.portal.branding.customColors")}
                            </p>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <ColorField
                                label={t("reseller.portal.primary")}
                                onChange={(hex) => patchDraft({ primaryColor: hex, themePreset: "" })}
                                value={draft.primaryColor}
                              />
                              <ColorField
                                label={t("reseller.portal.accent")}
                                onChange={(hex) => patchDraft({ accentColor: hex, themePreset: "" })}
                                value={draft.accentColor}
                              />
                              <ColorField
                                label={t("reseller.portal.branding.pageColor")}
                                onChange={(hex) => patchDraft({ backgroundColor: hex, themePreset: "" })}
                                onClear={draft.backgroundColor ? () => patchDraft({ backgroundColor: "", themePreset: "" }) : undefined}
                                value={draft.backgroundColor || "#f8f9fb"}
                              />
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <LockedNote
                            planName={view?.plan?.name ?? t("reseller.portal.plan.none")}
                            reason={t("reseller.portal.branding.colorsLocked")}
                          />
                          <div className="grid gap-3 sm:grid-cols-2">
                            <ColorSwatch label={t("reseller.portal.primary")} value={features.branding.default_primary_color} />
                            <ColorSwatch label={t("reseller.portal.accent")} value={features.branding.default_accent_color} />
                          </div>
                        </>
                      )}
                    </Card>

                    <Card className="gap-3 p-4">
                      <SectionHeader
                        description={t("reseller.portal.branding.backgroundHint")}
                        icon={<ImageIcon />}
                        iconTone="teal"
                        title={t("reseller.portal.branding.background")}
                      />
                      {features.branding.background_upload ? (
                        <BackgroundUploader
                          onChangeUrl={(url) => patchDraft({ backgroundUrl: url })}
                          onClear={() => patchDraft({ backgroundUrl: "" })}
                          onUploaded={(asset) => patchDraft({ backgroundUrl: asset.url })}
                          value={draft.backgroundUrl}
                        />
                      ) : (
                        <LockedNote
                          planName={view?.plan?.name ?? t("reseller.portal.plan.none")}
                          reason={t("reseller.portal.branding.backgroundLocked")}
                        />
                      )}
                    </Card>

                    <Card className="gap-3 p-4">
                      <SectionHeader icon={<BadgeCheck />} iconTone="gold" title={t("reseller.portal.branding.badge")} />
                      {features.branding.platform_badge_removable ? (
                        <label className="flex items-center gap-2.5 rounded-xl border border-[var(--advo-border)] bg-white px-3.5 py-2.5 text-xs font-semibold text-advo-text">
                          <input
                            checked={draft.showPlatformBadge}
                            className="h-4 w-4 accent-[var(--advo-blue)]"
                            onChange={(event) => patchDraft({ showPlatformBadge: event.target.checked })}
                            type="checkbox"
                          />
                          {t("reseller.portal.branding.badgeShow")}
                        </label>
                      ) : (
                        <LockedNote
                          planName={view?.plan?.name ?? t("reseller.portal.plan.none")}
                          reason={t("reseller.portal.branding.badgeLocked")}
                        />
                      )}
                    </Card>
                  </>
                ) : null}

                {/* ── Packages ── */}
                {draft && tab === "packages" && features ? (
                  <>
                    <Card className="gap-3 p-4">
                      <SectionHeader
                        description={t("reseller.portal.packages.styleHint")}
                        icon={<Layers />}
                        iconTone="teal"
                        title={t("reseller.portal.packages.style")}
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {features.package_cards.allowed_styles.map((style) => {
                          const active = draft.packageStyle === style;
                          return (
                            <button
                              aria-pressed={active}
                              className={`rounded-full px-3.5 py-1.5 text-[11px] font-bold transition-colors ${
                                active ? "bg-advo-blue text-white" : "bg-advo-surface-soft text-advo-muted hover:text-advo-blue"
                              }`}
                              key={style}
                              onClick={() => patchDraft({ packageStyle: style })}
                              type="button"
                            >
                              {t(`admin.plans.style.${style}`)}
                            </button>
                          );
                        })}
                      </div>
                      {features.package_cards.allowed_styles.length === 1 ? (
                        <p className="text-[11px] text-advo-muted">
                          {t("reseller.portal.packages.styleLocked", {
                            style: t(`admin.plans.style.${features.package_cards.allowed_styles[0]}`),
                          })}
                        </p>
                      ) : null}
                    </Card>

                    {/* Arrangement is a separate axis from the look: the same card
                        can be one full-width column, grid, hero-spotlight, compact rows,
                        or swipe carousel. */}
                    <Card className="gap-3.5 p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <SectionHeader
                          description={t("reseller.portal.packages.layoutHint")}
                          icon={draft.packageLayout === "list" || draft.packageLayout === "compact" ? <Rows3 /> : <Columns3 />}
                          iconTone="accent"
                          title={t("reseller.portal.packages.layout")}
                        />
                        <span className="rounded-full bg-advo-blue/10 px-2.5 py-1 text-[10px] font-bold text-advo-blue">
                          {t(`admin.plans.layout.${draft.packageLayout}`)}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {PACKAGE_LAYOUTS.map((layout) => {
                          const allowed = features.package_cards.allowed_layouts.includes(layout);
                          const active = draft.packageLayout === layout;
                          return (
                            <button
                              aria-pressed={active}
                              className={`group relative flex flex-col items-center gap-2 rounded-xl border p-2.5 text-center text-[11px] font-bold transition-all duration-200 ${
                                active
                                  ? "border-advo-blue bg-advo-blue/5 text-advo-blue shadow-sm ring-1 ring-advo-blue/30"
                                  : "border-[var(--advo-border)] bg-white text-advo-muted hover:border-advo-blue/40 hover:bg-slate-50/50"
                              } ${allowed ? "" : "cursor-not-allowed opacity-50"}`}
                              disabled={!allowed}
                              key={layout}
                              onClick={() => patchDraft({ packageLayout: layout })}
                              title={allowed ? undefined : t("reseller.portal.packages.layoutLocked", { layout: t(`admin.plans.layout.${layout}`) })}
                              type="button"
                            >
                              <div className={`w-full transition-transform duration-200 ${active ? "scale-[1.02]" : "group-hover:scale-[1.01]"}`}>
                                <LayoutGlyph layout={layout} />
                              </div>
                              <span className="line-clamp-1 text-[11px] font-bold tracking-tight">
                                {t(`admin.plans.layout.${layout}`)}
                              </span>
                              {active ? (
                                <span className="absolute top-1 right-1 size-1.5 rounded-full bg-advo-blue ring-2 ring-white" />
                              ) : null}
                            </button>
                          );
                        })}
                      </div>

                      {features.package_cards.allowed_layouts.length === 1 ? (
                        <p className="text-[11px] text-advo-muted">
                          {t("reseller.portal.packages.layoutLocked", {
                            layout: t(`admin.plans.layout.${features.package_cards.allowed_layouts[0]}`),
                          })}
                        </p>
                      ) : null}
                    </Card>

                    <Card className="gap-3 p-4">
                      <SectionHeader
                        description={t("reseller.portal.packages.orderHint")}
                        icon={<ArrowUp />}
                        iconTone="accent"
                        title={t("reseller.portal.packages.order")}
                      />
                      {!features.packages.order_edit ? (
                        <LockedNote
                          planName={view?.plan?.name ?? t("reseller.portal.plan.none")}
                          reason={t("reseller.portal.packages.orderLocked")}
                        />
                      ) : orderedPackages.length === 0 ? (
                        <p className="text-[11px] text-advo-muted">{t("reseller.portal.packages.empty")}</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {orderedPackages.map((row, index) => (
                            <li
                              className="flex items-center gap-3 rounded-xl border border-[var(--advo-border)] bg-advo-surface-soft/50 px-3 py-2"
                              key={row.id}
                            >
                              <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-white font-mono text-[10px] font-bold text-advo-muted ring-1 ring-advo-border">
                                {index + 1}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-bold text-advo-text">{row.name}</span>
                                <span className="block text-[10px] text-advo-muted tabular-nums">
                                  {formatTzs(row.currentRevision?.priceTzs ?? "0")}
                                </span>
                              </span>
                              <IconButton
                                disabled={index === 0}
                                label={t("reseller.portal.moveUp")}
                                onClick={() => movePackage(row.id, -1)}
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </IconButton>
                              <IconButton
                                disabled={index === orderedPackages.length - 1}
                                label={t("reseller.portal.moveDown")}
                                onClick={() => movePackage(row.id, 1)}
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </IconButton>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Card>
                  </>
                ) : null}

                {/* ── Page text & Language ── */}
                {tab === "copy" && draft ? (
                  <>
                    <Card className="gap-3 p-4">
                      <SectionHeader
                        description={t("reseller.portal.language.hint")}
                        icon={<Languages className="h-4 w-4" />}
                        iconTone="violet"
                        title={t("reseller.portal.language.title")}
                      />
                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
                            draft.defaultLocale === "en"
                              ? "border-advo-blue bg-advo-blue/5 ring-1 ring-advo-blue"
                              : "border-advo-border bg-white hover:border-advo-blue/40"
                          }`}
                          onClick={() => patchDraft({ defaultLocale: "en" })}
                          type="button"
                        >
                          <div
                            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black ${
                              draft.defaultLocale === "en"
                                ? "bg-advo-blue text-white shadow-xs"
                                : "bg-advo-page text-advo-muted"
                            }`}
                          >
                            EN
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-advo-text">
                              {t("reseller.portal.language.en")}
                            </p>
                            <p className="text-[11px] text-advo-muted">
                              {t("reseller.portal.language.enDesc")}
                            </p>
                          </div>
                        </button>
                        <button
                          className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
                            draft.defaultLocale === "sw"
                              ? "border-advo-blue bg-advo-blue/5 ring-1 ring-advo-blue"
                              : "border-advo-border bg-white hover:border-advo-blue/40"
                          }`}
                          onClick={() => patchDraft({ defaultLocale: "sw" })}
                          type="button"
                        >
                          <div
                            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black ${
                              draft.defaultLocale === "sw"
                                ? "bg-advo-blue text-white shadow-xs"
                                : "bg-advo-page text-advo-muted"
                            }`}
                          >
                            SW
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-advo-text">
                              {t("reseller.portal.language.sw")}
                            </p>
                            <p className="text-[11px] text-advo-muted">
                              {t("reseller.portal.language.swDesc")}
                            </p>
                          </div>
                        </button>
                      </div>
                    </Card>

                    <Card className="gap-3 p-4">
                      <SectionHeader icon={<TypeIcon />} iconTone="teal" title={t("reseller.portal.content.title")} />
                      <Field
                        hint={t("reseller.sites.field.portalTitleHint")}
                        label={t("reseller.sites.field.portalTitle")}
                        maxLength={80}
                        name="portalTitle"
                        onChange={(event) => {
                          setTitle(event.target.value);
                          setSaved(false);
                        }}
                        placeholder={t("reseller.sites.field.portalTitlePlaceholder")}
                        value={title}
                      />
                      <label className="block">
                        <span className="text-xs font-bold text-advo-text">{t("reseller.sites.field.portalMessage")}</span>
                        <textarea
                          className="mt-1 w-full rounded-field border border-advo-border bg-advo-page px-3.5 py-2.5 text-xs font-medium text-advo-text transition placeholder:text-advo-muted focus:border-advo-blue focus:bg-white focus:outline-none"
                          maxLength={280}
                          onChange={(event) => {
                            setMessage(event.target.value);
                            setSaved(false);
                          }}
                          placeholder={t("reseller.sites.field.portalMessagePlaceholder")}
                          rows={3}
                          value={message}
                        />
                        <span className="block text-right text-[10px] text-advo-muted tabular-nums">{message.length}/280</span>
                      </label>
                    </Card>
                  </>
                ) : null}

                {tab === "promotions" ? <PromotionRequestsTab siteId={siteId} /> : null}
              </div>

              {/* ── Live preview ── */}
              <div className="space-y-3 lg:sticky lg:top-4 lg:h-fit">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-advo-blue" />
                    <div>
                      <p className="text-sm font-bold text-advo-text">{t("reseller.portal.preview.title")}</p>
                      <p className="text-[11px] text-advo-muted">{t("reseller.portal.preview.hint")}</p>
                    </div>
                  </div>
                  {draft ? (
                    <div
                      aria-label={t("reseller.portal.language.title")}
                      className="flex items-center gap-0.5 rounded-full border border-advo-border bg-white p-0.5 shadow-xs"
                      role="group"
                    >
                      <button
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                          draft.defaultLocale === "en"
                            ? "bg-advo-blue text-white shadow-xs"
                            : "text-advo-muted hover:text-advo-text"
                        }`}
                        onClick={() => patchDraft({ defaultLocale: "en" })}
                        type="button"
                      >
                        EN
                      </button>
                      <button
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                          draft.defaultLocale === "sw"
                            ? "bg-advo-blue text-white shadow-xs"
                            : "text-advo-muted hover:text-advo-text"
                        }`}
                        onClick={() => patchDraft({ defaultLocale: "sw" })}
                        type="button"
                      >
                        SW
                      </button>
                    </div>
                  ) : null}
                </div>

                {usingFallback ? <Notice tone="default">{t("reseller.portal.preview.fallback")}</Notice> : null}

                <LivePortalPreview
                  appearance={previewAppearance}
                  hasNothingToSell={noPackagesAtAll}
                  revision={previewRevision}
                  site={site}
                />

                {/* The phone collapses hidden placements, so this list says why. */}
                {features ? (
                  <Card className="gap-2 p-3.5">
                    <p className="text-[10px] font-bold tracking-wider text-advo-muted uppercase">
                      {t("reseller.portal.preview.slots")}
                    </p>
                    <ul className="space-y-1">
                      {placements.map((placement) => (
                        <li className="flex items-center justify-between gap-2 text-[11px]" key={placement.key}>
                          <span className="truncate font-semibold text-advo-text">
                            {t(`admin.plans.placement.${placement.key}`)}
                          </span>
                          <StatusChip tone={placement.visible ? "success" : "default"}>
                            {placement.visible ? t("reseller.portal.visible") : t("reseller.portal.hidden")}
                          </StatusChip>
                        </li>
                      ))}
                    </ul>
                    {view ? (
                      <p className="border-t border-[var(--advo-border)] pt-2 font-mono text-[10px] text-advo-muted">
                        {t("reseller.portal.revision", { revision: view.configRevision.slice(0, 12) })}
                      </p>
                    ) : null}
                  </Card>
                ) : null}
              </div>
            </div>
          )
        }
      </ResourceView>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Plan summary
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * What the reseller's plan grants, in their own words.
 *
 * The plan name is shown but nothing branches on it: every number and lock below
 * comes from the resolved feature keys, so renaming a plan changes only this label.
 */
function PlanSummary({ entitlements }: { entitlements: ResellerEntitlementsView | null }) {
  const { t } = useI18n();

  if (!entitlements || entitlements.plan === null) {
    return (
      <div className="rounded-xl border border-dashed border-advo-border px-3.5 py-2.5">
        <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-advo-muted uppercase">
          <Lock className="size-3" />
          {t("reseller.portal.plan.title")}
        </p>
        <p className="mt-0.5 text-xs font-bold text-advo-text">{t("reseller.portal.plan.none")}</p>
        <p className="mt-0.5 text-[10px] text-advo-muted">{t("reseller.portal.plan.noneHint")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--advo-border)] bg-gradient-to-br from-white to-[var(--advo-blue-soft)] px-3.5 py-2.5">
      <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-advo-muted uppercase">
        <Sparkles className="size-3" />
        {t("reseller.portal.plan.title")}
      </p>
      <p className="mt-0.5 flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-bold text-advo-text">
          {t("reseller.portal.plan.version", { name: entitlements.plan.name, version: entitlements.plan.version })}
        </span>
        {entitlements.plan.commercialPromise === "ad_free" ? (
          <StatusChip tone="accent">{t("reseller.portal.plan.adFree")}</StatusChip>
        ) : null}
        <StatusChip tone={entitlements.plan.lifecycle === "PUBLISHED" ? "success" : "warning"}>
          {entitlements.plan.lifecycle}
        </StatusChip>
      </p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <PlanLimit label={t("reseller.portal.limit.sites")} value={entitlements.limits.sites} />
        <PlanLimit label={t("reseller.portal.limit.devices")} value={entitlements.limits.devices} />
        <PlanLimit label={t("reseller.portal.limit.packages")} value={entitlements.limits.wifiPackagesPerSite} />
      </div>
    </div>
  );
}

/** One plan cap, showing "Unlimited" rather than the stored `null`. */
function PlanLimit({ label, value }: { label: string; value: number | null }) {
  const { t } = useI18n();
  return (
    <span className="text-[10px] text-advo-muted">
      {label}:{" "}
      <strong className="font-bold text-advo-text tabular-nums">
        {value ?? t("reseller.portal.limit.unlimited")}
      </strong>
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Placement control
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * One placement, with its lock reason when the plan has the final say.
 *
 * The UI refuses the edit *before* the request: `canEdit` is `false` for both
 * REQUIRED and DISABLED, and the reason names the mode, so a reseller never has to
 * guess why a switch will not move. The backend enforces the same rule regardless.
 */
function PlacementControl({
  decision,
  planName,
  onChange,
}: {
  decision: { key: VisibilityKey; visible: boolean; canEdit: boolean; lock: "REQUIRED" | "DISABLED" | null };
  planName: string;
  onChange: (value: boolean) => void;
}) {
  const { t } = useI18n();
  const locked = !decision.canEdit;

  return (
    <li
      className={`flex flex-wrap items-center gap-3 rounded-xl border px-3.5 py-2.5 ${
        locked ? "border-dashed border-advo-border bg-advo-surface-soft/40" : "border-[var(--advo-border)] bg-white"
      }`}
    >
      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${decision.visible ? "bg-advo-success-soft text-emerald-700" : "bg-advo-surface-soft text-advo-muted"}`}>
        {decision.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-bold text-advo-text">{t(`admin.plans.placement.${decision.key}`)}</span>
        <span className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-advo-muted">
            {locked
              ? decision.lock === "REQUIRED"
                ? t("reseller.portal.plan.required", { plan: planName })
                : t("reseller.portal.plan.disabled", { plan: planName })
              : t("admin.plans.mode.OPTIONAL.hint")}
          </span>
          {locked ? (
            <StatusChip tone={decision.lock === "REQUIRED" ? "accent" : "default"}>
              <span className="inline-flex items-center gap-1">
                <Lock className="size-2.5" />
                {t("reseller.portal.locked")}
              </span>
            </StatusChip>
          ) : null}
        </span>
      </span>
      {locked ? (
        <StatusChip tone={decision.visible ? "success" : "default"} size="md">
          {decision.visible ? t("reseller.portal.visible") : t("reseller.portal.hidden")}
        </StatusChip>
      ) : (
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[11px] font-semibold text-advo-text">
          <input
            checked={decision.visible}
            className="h-4 w-4 accent-[var(--advo-blue)]"
            onChange={(event) => onChange(event.target.checked)}
            type="checkbox"
          />
          {decision.visible ? t("reseller.portal.visible") : t("reseller.portal.hidden")}
        </label>
      )}
    </li>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Live portal preview
 * ───────────────────────────────────────────────────────────────────────── */

/** The two pages a guest can actually be on, in the order they reach them. */
const PREVIEW_SCREENS: PreviewStage[] = ["packages", "connected"];

/**
 * The site's real portal, embedded.
 *
 * This panel loads the guest app's own page for the selected site instead of
 * rebuilding it. A rebuild drifts: it renders whatever the designer remembers the
 * portal looking like, and the one thing a reseller checking their own portal
 * must not be shown is a convincing approximation of it.
 *
 * The frame renders the *saved* design, so **Save design** is still what
 * publishes a change. Two things stop that from reading as a broken control:
 *
 *   1. The draft appearance is posted into the frame as it is edited, and the
 *      portal paints it on top of the saved theme. Colours, the background photo,
 *      the logo, the card style and the layout all appear while the reseller is
 *      still choosing them — the preview is live without anything being saved.
 *   2. A successful save reloads the frame, so the page a guest would get is what
 *      the panel shows the moment it is published, not the design from before.
 *
 * The Connected screen needs a real paid session on the device. With no active
 * order the portal would have nothing to show, so in preview it renders the same
 * connected experience a paying guest gets, from this site's own businesses,
 * jobs and promotion packages, behind a "this is a preview" note.
 *
 * When there is no package to sell, there is nothing to embed either, and the
 * panel says so instead of filling the phone with the portal's own empty state —
 * a working designer must not be made to look like a broken one.
 */
function LivePortalPreview({
  appearance,
  hasNothingToSell,
  revision,
  site,
}: {
  /** The draft appearance to paint over the saved design as it is edited. */
  appearance: PortalPreviewAppearance | null;
  /** No sellable package exists at any site, so no preview can show a package. */
  hasNothingToSell: boolean;
  /** Incremented by a successful save; reloading an unchanged `src` does nothing. */
  revision: number;
  site: SiteOption | null;
}) {
  const { t } = useI18n();
  const [screen, setScreen] = useState<PreviewStage>("packages");
  const [copied, setCopied] = useState(false);
  /** The reload button's own counter; the saved-design revision arrives as a prop. */
  const [manualReload, setManualReload] = useState(0);
  /** The visible URL, so the copy fallback has something to select. */
  const urlRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  /**
   * What the frame loads, which is not always what Copy and Open give.
   *
   * `preview=1` marks the embed as the designer's own view: the portal then
   * paints the draft appearance, opens the real payment dialog but refuses to
   * transact, and shows the connected experience from this site's own content
   * instead of a session it does not have. Copy and Open stay clean because they
   * are for a real phone.
   */
  const base = site ? `${PORTAL_URL}/${site.slug}` : "";
  const url = screen === "connected" ? `${base}/status` : base;
  const frameUrl = `${url}${url.includes("?") ? "&" : "?"}preview=1`;

  /** Pushes the current draft into the frame; a no-op before it has loaded. */
  const postAppearance = useCallback(() => {
    if (!appearance) return;
    frameRef.current?.contentWindow?.postMessage(
      { type: PORTAL_PREVIEW_MESSAGE, appearance },
      "*",
    );
  }, [appearance]);

  // Every draft edit repaints the frame. Nothing is saved, and nothing reloads:
  // a colour being dragged stays a message, not a page load.
  useEffect(() => {
    postAppearance();
  }, [postAppearance, screen, revision, manualReload]);

  // The frame asks for the draft once it is listening, which is what makes an
  // edit made before the iframe finished loading survive.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const type = (event.data as { type?: unknown } | null)?.type;
      if (type === PORTAL_PREVIEW_READY) postAppearance();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [postAppearance]);

  // "Copied" is a receipt, not a state the button should hold forever.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!site) {
    return (
      <Card className="p-4">
        <p className="text-xs text-advo-muted">{t("reseller.portal.live.noSite")}</p>
      </Card>
    );
  }

  if (hasNothingToSell) {
    return (
      <Card className="gap-3 p-4">
        <p className="text-xs leading-relaxed text-advo-muted">{t("reseller.portal.preview.noPackages")}</p>
        <Link
          className="mt-1 inline-block rounded-xl bg-advo-blue px-4 py-2 text-center text-xs font-semibold text-white shadow transition hover:bg-advo-blue-hover"
          href="/reseller/packages"
        >
          {t("reseller.packages.empty.cta")}
        </Link>
      </Card>
    );
  }

  async function copy() {
    // The async Clipboard API needs a secure context (HTTPS or localhost) and a
    // user gesture. A reseller on the dashboard over plain HTTP would get a
    // rejection here, so a hidden textarea is the second attempt rather than
    // letting the button do nothing at all.
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      return;
    } catch {
      // Fall through to the legacy path.
    }

    const textarea = document.createElement("textarea");
    textarea.value = url;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const legacyCopyWorked = document.execCommand("copy");
    textarea.remove();

    if (legacyCopyWorked) {
      setCopied(true);
      return;
    }

    // Last resort: leave the URL selected so ⌘/Ctrl+C finishes the job. Silence
    // would be the one outcome that leaves the reseller with nothing.
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(urlRef.current ?? document.body);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  return (
    <Card className="gap-3 p-3.5">
      {/* The screens sit above the frame: they are controls over the preview, not
          something a guest would ever see inside the portal. */}
      <div className="flex items-center gap-1 rounded-full border border-advo-border bg-advo-surface-soft p-1">
        {PREVIEW_SCREENS.map((candidate) => (
          <button
            aria-pressed={screen === candidate}
            className={`flex-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition ${
              screen === candidate ? "bg-white text-advo-text shadow-sm" : "text-advo-muted hover:text-advo-text"
            }`}
            key={candidate}
            onClick={() => setScreen(candidate)}
            type="button"
          >
            {t(`reseller.portal.preview.stage.${candidate}`)}
          </button>
        ))}
      </div>

      <p className="px-1 text-[10px] text-advo-muted">{t("reseller.portal.preview.stageHint")}</p>

      <div className="mx-auto w-full max-w-[360px] overflow-hidden rounded-[26px] border border-advo-border bg-white shadow-[0_18px_44px_-24px_rgba(15,23,42,0.45)]">
        <iframe
          className="block h-[620px] w-full border-0"
          key={`${frameUrl}-${revision}-${manualReload}`}
          onLoad={postAppearance}
          ref={frameRef}
          src={frameUrl}
          title={t("reseller.portal.live.frame", { name: site.name })}
        />
      </div>

      {/* The URL, with the two things a reseller does with it: open it on a phone
          that is on the network, or copy it somewhere else. */}
      <div className="flex items-center gap-1.5">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-advo-border bg-advo-surface-soft px-2.5 py-1.5 font-mono text-[10px] text-advo-text" ref={urlRef}>
          {url}
        </code>
        <button
          className="shrink-0 rounded-lg border border-advo-border px-2 py-1.5 text-[10px] font-bold text-advo-text transition hover:border-advo-blue"
          onClick={() => void copy()}
          type="button"
        >
          {copied ? t("reseller.portal.live.copied") : t("reseller.portal.live.copy")}
        </button>
        <a
          className="shrink-0 rounded-lg border border-advo-border px-2 py-1.5 text-[10px] font-bold text-advo-text transition hover:border-advo-blue"
          href={url}
          rel="noreferrer"
          target="_blank"
        >
          {t("reseller.portal.live.open")}
        </a>
        <button
          aria-label={t("reseller.portal.live.reload")}
          className="shrink-0 rounded-lg border border-advo-border p-1.5 text-advo-muted transition hover:border-advo-blue hover:text-advo-text"
          onClick={() => setManualReload((count) => count + 1)}
          type="button"
        >
          <RefreshCw className="size-3.5" />
        </button>
      </div>

      <p className="px-1 text-[10px] leading-relaxed text-advo-muted">
        {t("reseller.portal.live.savedOnly")}
      </p>
      {/* The frame is a visit, not a guest: it has no WiFi context, so the one
          thing it cannot do is take money. Said here so the disabled Pay button
          inside is not read as something being broken. */}
      <p className="px-1 text-[10px] leading-relaxed text-advo-muted">
        {t("reseller.portal.live.previewNote")}
      </p>
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Promotion requests (unchanged feature, trimmed presentation)
 * ───────────────────────────────────────────────────────────────────────── */

type PromotionRow = {
  id: string;
  siteId: string;
  packageCode: string;
  fullName: string;
  mobile: string;
  email: string | null;
  business: string;
  location: string;
  description: string;
  offer: string;
  state: "NEW" | "CONTACTED" | "WON" | "DECLINED";
  createdAt: string;
};

const PROMOTION_STATES = ["NEW", "CONTACTED", "WON", "DECLINED"] as const;

function PromotionRequestsTab({ siteId }: { siteId: string }) {
  const { t } = useI18n();
  const requests = useResource<PromotionRow[]>("/reseller/promotions");
  const update = useAction(
    async (promotionId: string, state: PromotionRow["state"]) => {
      await api.post(`/reseller/promotions/${promotionId}/state`, { state });
    },
    async () => {
      await requests.reload();
    },
  );

  const rows = useMemo(() => (requests.data ?? []).filter((row) => !siteId || row.siteId === siteId), [requests.data, siteId]);

  return (
    <Card className="gap-3 p-4">
      <SectionHeader icon={<Inbox />} iconTone="accent" title={t("reseller.portal.promotions.title")} />
      <p className="text-[11px] text-advo-muted">{t("reseller.portal.promotions.hint")}</p>
      {update.error ? <Notice tone="danger">{update.error}</Notice> : null}
      {rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-advo-muted">{t("reseller.portal.promotions.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li className="rounded-xl border border-advo-border p-3" key={row.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-advo-text">{row.business}</p>
                  <p className="text-[11px] text-advo-muted">
                    {row.fullName} · {row.mobile}
                    {row.email ? ` · ${row.email}` : ""}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-advo-blue/10 px-2 py-0.5 text-[10px] font-bold text-advo-blue">
                  {row.packageCode}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-advo-muted">{row.location}</p>
              <p className="mt-1 text-[11px] text-advo-text">{row.description}</p>
              <p className="mt-0.5 text-[11px] font-semibold text-advo-muted">{row.offer}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <span className="text-[10px] text-advo-muted">
                  {t("reseller.portal.promotions.col.received")}: {formatDateTime(row.createdAt)}
                </span>
                <div className="ms-auto flex flex-wrap gap-1">
                  {PROMOTION_STATES.map((state) => (
                    <button
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${
                        row.state === state ? "bg-advo-blue text-white" : "border border-advo-border text-advo-muted hover:text-advo-text"
                      }`}
                      disabled={update.pending || row.state === state}
                      key={state}
                      onClick={() => void update.run(row.id, state)}
                      type="button"
                    >
                      {t(`reseller.portal.promotions.state.${state}`)}
                    </button>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Shared controls
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * A miniature of the arrangement a layout produces.
 */
function LayoutGlyph({ layout }: { layout: PortalCardLayout }) {
  if (layout === "list") {
    return (
      <span aria-hidden className="flex h-7 w-full flex-col justify-center gap-1 rounded-md bg-black/[0.04] p-1.5">
        <span className="h-1 rounded-[2px] bg-current opacity-80" />
        <span className="h-1 rounded-[2px] bg-current opacity-80" />
        <span className="h-1 rounded-[2px] bg-current opacity-80" />
      </span>
    );
  }
  if (layout === "grid-2") {
    return (
      <span aria-hidden className="grid h-7 w-full grid-cols-2 gap-1 rounded-md bg-black/[0.04] p-1">
        <span className="rounded-[2px] bg-current opacity-80" />
        <span className="rounded-[2px] bg-current opacity-80" />
        <span className="rounded-[2px] bg-current opacity-80" />
        <span className="rounded-[2px] bg-current opacity-80" />
      </span>
    );
  }
  if (layout === "grid-3") {
    return (
      <span aria-hidden className="grid h-7 w-full grid-cols-3 gap-0.5 rounded-md bg-black/[0.04] p-1">
        <span className="rounded-[2px] bg-current opacity-80" />
        <span className="rounded-[2px] bg-current opacity-80" />
        <span className="rounded-[2px] bg-current opacity-80" />
        <span className="rounded-[2px] bg-current opacity-60" />
        <span className="rounded-[2px] bg-current opacity-60" />
        <span className="rounded-[2px] bg-current opacity-60" />
      </span>
    );
  }
  if (layout === "featured") {
    return (
      <span aria-hidden className="grid h-7 w-full grid-cols-2 gap-1 rounded-md bg-black/[0.04] p-1">
        <span className="col-span-2 h-2.5 rounded-[2px] bg-current opacity-95" />
        <span className="h-2 rounded-[2px] bg-current opacity-60" />
        <span className="h-2 rounded-[2px] bg-current opacity-60" />
      </span>
    );
  }
  if (layout === "compact") {
    return (
      <span aria-hidden className="flex h-7 w-full flex-col justify-center gap-0.5 rounded-md bg-black/[0.04] p-1">
        <span className="h-0.5 rounded-[1px] bg-current opacity-80" />
        <span className="h-0.5 rounded-[1px] bg-current opacity-80" />
        <span className="h-0.5 rounded-[1px] bg-current opacity-80" />
        <span className="h-0.5 rounded-[1px] bg-current opacity-80" />
      </span>
    );
  }
  if (layout === "carousel") {
    return (
      <span aria-hidden className="flex h-7 w-full items-center gap-1 overflow-hidden rounded-md bg-black/[0.04] p-1">
        <span className="h-full w-3/5 shrink-0 rounded-[2px] bg-current opacity-90" />
        <span className="h-full w-1/2 shrink-0 rounded-[2px] bg-current opacity-40" />
      </span>
    );
  }
  return null;
}

/** A control the plan does not grant, with the reason and the plan that set it. */
function LockedNote({ reason, planName }: { reason: string; planName: string }) {
  const { t } = useI18n();
  return (
    <p className="flex items-start gap-2 rounded-xl border border-dashed border-advo-border bg-advo-surface-soft/50 px-3.5 py-2.5 text-[11px] font-semibold text-advo-muted">
      <Lock className="mt-0.5 size-3.5 shrink-0" />
      <span>
        {reason}
        <span className="mt-0.5 block font-normal">
          {t("reseller.portal.lockedBy", { plan: planName })}
        </span>
      </span>
    </p>
  );
}

/** A colour the plan fixes, shown without an editable control. */
function ColorSwatch({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-advo-border bg-white px-3 py-2">
      <span className="min-w-0">
        <span className="block truncate text-xs font-bold text-advo-text">{label}</span>
        <span className="block font-mono text-[11px] text-advo-muted uppercase">{value}</span>
      </span>
      <span
        aria-hidden="true"
        className="block h-8 w-10 shrink-0 rounded-lg border border-black/10"
        style={{ background: value }}
      />
    </div>
  );
}

/**
 * A brand colour with a live contrast verdict.
 *
 * The portal puts white text on the brand colour, so anything under the shared 3:1
 * floor would ship an unreadable "Buy" button. The check uses the same
 * `contrastRatio` the backend validates with, so the two cannot disagree.
 */
function ColorField({ label, value, onChange, onClear }: { label: string; value: string; onChange: (hex: string) => void; onClear?: () => void }) {
  const { t } = useI18n();
  const [text, setText] = useState(value);

  useEffect(() => setText(value), [value]);

  const ratio = contrastRatio(value, "#ffffff");
  const ok = ratio >= MIN_BRAND_CONTRAST;

  return (
    <div className="rounded-xl border border-[var(--advo-border)] bg-white px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-bold tracking-wider text-advo-muted uppercase">{label}</p>
        {/* Only offered when there is something to undo, so the default state
            does not carry a control that does nothing. Clearing sends an empty
            value, which is how the backend is told to drop the stored colour. */}
        {onClear ? (
          <button className="shrink-0 text-[10px] font-bold text-advo-blue underline-offset-2 hover:underline" onClick={onClear} type="button">
            {t("reseller.portal.branding.colorReset")}
          </button>
        ) : null}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          aria-label={label}
          className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-[var(--advo-border)] bg-white p-0.5"
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          type="color"
          value={value}
        />
        <input
          aria-label={`${label} hex`}
          className="w-full rounded-field bg-field px-2.5 py-1.5 font-mono text-xs text-field-foreground shadow-field outline-none"
          onChange={(event) => {
            const next = event.target.value.trim();
            setText(next);
            if (HEX_COLOR_REGEX.test(next)) onChange(next.toUpperCase());
          }}
          spellCheck={false}
          value={text}
        />
      </div>
      <p className={`mt-1 text-[11px] font-semibold ${ok ? "text-emerald-700" : "text-[#b45309]"}`}>
        {ok
          ? t("reseller.portal.branding.contrast", { ratio: ratio.toFixed(1) })
          : t("reseller.portal.branding.contrastFail", { min: MIN_BRAND_CONTRAST })}
      </p>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={label}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-advo-border text-advo-muted transition hover:border-advo-blue hover:text-advo-blue disabled:cursor-default disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}
