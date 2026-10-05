"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card } from "@heroui/react";
import {
  DEFAULT_PORTAL_CONTENT,
  DEFAULT_PORTAL_THEME,
  PORTAL_CONTENT_STARTER,
  portalContentWithDefaults,
  portalThemeWithDefaults,
  type PortalAdvert,
  type PortalBusiness,
  type PortalContent,
  type PortalTheme,
} from "@advo/contracts";
import { formatDateTime, formatDuration, formatTzs } from "@advo/api-client";
import { Notice } from "@advo/ui";
import { PageHero, ResourceView } from "@/features/common/components";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAction, useResource } from "@/lib/hooks";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Inbox,
  Megaphone,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Smartphone,
  Store,
  Trash2,
  Type as TypeIcon,
  Wifi,
  WifiOff,
} from "lucide-react";

type SiteOption = {
  id: string;
  name: string;
  state: string;
  portalTitle: string | null;
  portalMessage: string | null;
  portalTheme: unknown;
  portalContent: unknown;
};

type DesignerTab = "design" | "adverts" | "businesses" | "promotions";

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

/** Ready-made looks. Names are design labels, so they stay untranslated. */
const PRESETS: Array<{ id: string; name: string; theme: PortalTheme }> = [
  {
    id: "classic",
    name: "Classic",
    theme: { preset: "classic", primary: "#1b5ea4", accent: "#fba102", background: "#f5f7fb", surface: "#ffffff", text: "#0f172a", radius: 16, buttonStyle: "solid" },
  },
  {
    id: "sunset",
    name: "Sunset",
    theme: { preset: "sunset", primary: "#e06838", accent: "#f6ad55", background: "#fff7f3", surface: "#ffffff", text: "#3a2418", radius: 20, buttonStyle: "gradient" },
  },
  {
    id: "midnight",
    name: "Midnight",
    theme: { preset: "midnight", primary: "#38bdf8", accent: "#a78bfa", background: "#0b1120", surface: "#16203a", text: "#e2e8f0", radius: 18, buttonStyle: "gradient" },
  },
  {
    id: "mint",
    name: "Mint",
    theme: { preset: "mint", primary: "#0f9d7a", accent: "#34d399", background: "#f0fdf9", surface: "#ffffff", text: "#0b2e26", radius: 14, buttonStyle: "solid" },
  },
  {
    id: "royal",
    name: "Royal",
    theme: { preset: "royal", primary: "#6d28d9", accent: "#ec4899", background: "#faf5ff", surface: "#ffffff", text: "#2e1065", radius: 22, buttonStyle: "gradient" },
  },
  {
    id: "graphite",
    name: "Graphite",
    theme: { preset: "graphite", primary: "#111827", accent: "#f59e0b", background: "#f3f4f6", surface: "#ffffff", text: "#111827", radius: 12, buttonStyle: "outline" },
  },
];

const BUTTON_STYLES = ["solid", "gradient", "outline"] as const;

function buttonFill(theme: PortalTheme, radiusOverride?: number): React.CSSProperties {
  const radius = radiusOverride ?? theme.radius;
  if (theme.buttonStyle === "gradient") {
    return { background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.accent} 100%)`, color: "#ffffff", borderRadius: radius };
  }
  if (theme.buttonStyle === "outline") {
    return { background: "transparent", border: `2px solid ${theme.primary}`, color: theme.primary, borderRadius: radius };
  }
  return { background: theme.primary, color: "#ffffff", borderRadius: radius };
}

/** Price chip always uses the brand gradient so it reads as a price tag. */
function priceChip(theme: PortalTheme): React.CSSProperties {
  return {
    background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.accent} 100%)`,
    color: "#ffffff",
    borderRadius: Math.min(theme.radius, 14),
  };
}

export function ResellerCaptivePortalScreen() {
  const { t } = useI18n();
  const sites = useResource<SiteOption[]>("/reseller/sites");
  const packages = useResource<PackageRow[]>("/reseller/packages");

  const [siteId, setSiteId] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [theme, setTheme] = useState<PortalTheme>(DEFAULT_PORTAL_THEME);
  const [content, setContent] = useState<PortalContent>(DEFAULT_PORTAL_CONTENT);
  const [tab, setTab] = useState<DesignerTab>("design");
  const [previewMode, setPreviewMode] = useState<"welcome" | "connected">("welcome");
  const [saved, setSaved] = useState(false);

  const site = useMemo(() => (sites.data ?? []).find((s) => s.id === siteId) ?? null, [sites.data, siteId]);

  // Default to the first site so the preview is populated on arrival.
  useEffect(() => {
    if (!siteId && sites.data && sites.data.length > 0) setSiteId(sites.data[0].id);
  }, [sites.data, siteId]);

  // Load the selected site's saved design into the editor.
  useEffect(() => {
    if (!site) return;
    setTitle(site.portalTitle ?? site.name);
    setMessage(site.portalMessage ?? "");
    setTheme(portalThemeWithDefaults(site.portalTheme));
    // Match what the guest actually sees: an unconfigured site serves the starter
    // content, so the designer must open on that same content rather than a blank slate.
    setContent(site.portalContent ? portalContentWithDefaults(site.portalContent) : PORTAL_CONTENT_STARTER);
    setSaved(false);
  }, [site]);

  const save = useAction(
    async () => {
      if (!siteId) throw new Error("Pick a site first");
      await api.put(`/reseller/sites/${siteId}`, {
        portalTitle: title.trim(),
        portalMessage: message.trim(),
        portalTheme: theme,
        portalContent: content,
      });
    },
    async () => {
      setSaved(true);
      await sites.reload();
    },
  );

  function patchTheme(patch: Partial<PortalTheme>) {
    setTheme((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  }

  function patchContent(patch: Partial<PortalContent>) {
    setContent((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  }

  function moveAdvert(index: number, delta: number) {
    setContent((prev) => {
      const next = [...prev.adverts];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, adverts: next };
    });
    setSaved(false);
  }

  function moveBusiness(index: number, delta: number) {
    setContent((prev) => {
      const next = [...prev.businesses];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, businesses: next };
    });
    setSaved(false);
  }

  // Packages sold at this site; fall back to everything so the preview is never bare.
  const assignedPackages = useMemo(() => {
    const all = (packages.data ?? []).filter((p) => p.currentRevision);
    if (!siteId) return [];
    return all.filter((p) => p.assignments.some((a) => a.site.id === siteId));
  }, [packages.data, siteId]);
  const previewPackages = assignedPackages.length
    ? assignedPackages
    : (packages.data ?? []).filter((p) => p.currentRevision);
  const usingFallback = assignedPackages.length === 0 && previewPackages.length > 0;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHero
        actions={
          <div className="flex items-center gap-2">
            <Button
              onPress={() => {
                setTheme(DEFAULT_PORTAL_THEME);
                setSaved(false);
              }}
              type="button"
              variant="outline"
            >
              <RotateCcw className="size-3.5" />
              {t("reseller.portal.reset")}
            </Button>
            <Button
              isDisabled={save.pending || !siteId}
              onPress={() => void save.run()}
              type="button"
              variant="primary"
            >
              {saved ? <Check className="size-3.5" /> : <Save className="size-3.5" />}
              {saved ? t("reseller.portal.saved") : save.pending ? t("reseller.portal.saving") : t("reseller.portal.save")}
            </Button>
          </div>
        }
        description={t("reseller.portal.subtitle")}
        eyebrow={t("reseller.portal.badge")}
        icon={<Palette />}
        iconTone="accent"
        title={t("reseller.portal.title")}
      />

      {save.error ? <Notice tone="danger">{save.error}</Notice> : null}

      <ResourceView resource={sites}>
        {(siteRows) =>
          siteRows.length === 0 ? (
            <Card className="p-8 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-advo-blue/10 text-advo-blue">
                <Palette className="h-6 w-6" />
              </span>
              <p className="mt-3 text-sm text-advo-muted">{t("reseller.portal.noSites")}</p>
            </Card>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
              {/* ── Controls ── */}
              <div className="space-y-4">
                {/* Site */}
                <Card className="space-y-2 p-4">
                  <label className="text-xs font-bold text-advo-text" htmlFor="portal-site">
                    {t("reseller.portal.site")}
                  </label>
                  <select
                    className="w-full rounded-field border border-advo-border bg-advo-page px-3.5 py-2.5 text-xs font-bold text-advo-text transition focus:border-advo-blue focus:bg-white focus:outline-none"
                    id="portal-site"
                    onChange={(event) => setSiteId(event.target.value)}
                    value={siteId}
                  >
                    <option value="">{t("reseller.portal.sitePlaceholder")}</option>
                    {siteRows.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Card>

                {/* Tabs */}
                <div className="inline-flex w-full items-center gap-0.5 rounded-xl border border-advo-border bg-white p-0.5">
                  {(["design", "adverts", "businesses", "promotions"] as const).map((id) => {
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
                        {t(`reseller.portal.tab.${id}` as "reseller.portal.tab.design")}
                      </button>
                    );
                  })}
                </div>

                {tab === "design" ? (
                  <>
                {/* Presets */}
                <Card className="space-y-3 p-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-advo-gold" />
                    <div>
                      <p className="text-sm font-bold text-advo-text">{t("reseller.portal.preset.title")}</p>
                      <p className="text-[11px] text-advo-muted">{t("reseller.portal.preset.hint")}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {PRESETS.map((preset) => {
                      const active = theme.preset === preset.id;
                      return (
                        <button
                          className={`group flex items-center gap-2 rounded-xl border p-2 text-start transition ${
                            active ? "border-advo-blue ring-2 ring-advo-blue/20" : "border-advo-border hover:border-advo-blue/40"
                          }`}
                          key={preset.id}
                          onClick={() => {
                            setTheme(preset.theme);
                            setSaved(false);
                          }}
                          type="button"
                        >
                          <span
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[9px] font-black text-white"
                            style={{ background: `linear-gradient(135deg, ${preset.theme.primary}, ${preset.theme.accent})` }}
                          >
                            Aa
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-bold text-advo-text">{preset.name}</span>
                            <span className="block size-3 rounded-full border border-black/10" style={{ background: preset.theme.surface }} />
                          </span>
                          {active ? <Check className="ms-auto h-3.5 w-3.5 shrink-0 text-advo-blue" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </Card>

                {/* Colours */}
                <Card className="space-y-3 p-4">
                  <div className="flex items-center gap-2">
                    <Palette className="h-4 w-4 text-advo-blue" />
                    <p className="text-sm font-bold text-advo-text">{t("reseller.portal.colors.title")}</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <ColorField label={t("reseller.portal.primary")} onChange={(v) => patchTheme({ primary: v })} value={theme.primary} />
                    <ColorField label={t("reseller.portal.accent")} onChange={(v) => patchTheme({ accent: v })} value={theme.accent} />
                    <ColorField label={t("reseller.portal.background")} onChange={(v) => patchTheme({ background: v })} value={theme.background} />
                    <ColorField label={t("reseller.portal.surface")} onChange={(v) => patchTheme({ surface: v })} value={theme.surface} />
                    <ColorField label={t("reseller.portal.text")} onChange={(v) => patchTheme({ text: v })} value={theme.text} />
                  </div>
                </Card>

                {/* Button + radius */}
                <Card className="space-y-4 p-4">
                  <div className="flex items-center gap-2">
                    <Store className="h-4 w-4 text-advo-blue" />
                    <p className="text-sm font-bold text-advo-text">{t("reseller.portal.button.title")}</p>
                  </div>
                  <div className="inline-flex w-full items-center gap-0.5 rounded-xl border border-advo-border bg-white p-0.5">
                    {BUTTON_STYLES.map((style) => {
                      const active = theme.buttonStyle === style;
                      return (
                        <button
                          className={`flex-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${
                            active ? "bg-advo-blue text-white shadow-xs" : "text-advo-muted hover:text-advo-text"
                          }`}
                          key={style}
                          onClick={() => patchTheme({ buttonStyle: style })}
                          type="button"
                        >
                          {t(`reseller.portal.button.${style}` as "reseller.portal.button.solid")}
                        </button>
                      );
                    })}
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-advo-text" htmlFor="portal-radius">
                        {t("reseller.portal.radius")}
                      </label>
                      <span className="rounded-md bg-advo-page px-1.5 py-0.5 font-mono text-[11px] text-advo-muted">{theme.radius}px</span>
                    </div>
                    <input
                      className="mt-2 w-full accent-advo-blue"
                      id="portal-radius"
                      max={28}
                      min={0}
                      onChange={(event) => patchTheme({ radius: Number(event.target.value) })}
                      type="range"
                      value={theme.radius}
                    />
                  </div>
                </Card>

                {/* Content */}
                <Card className="space-y-3 p-4">
                  <div className="flex items-center gap-2">
                    <TypeIcon className="h-4 w-4 text-advo-blue" />
                    <p className="text-sm font-bold text-advo-text">{t("reseller.portal.content.title")}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-advo-text" htmlFor="portal-title">
                      {t("reseller.sites.field.portalTitle")}
                    </label>
                    <input
                      className="w-full rounded-field border border-advo-border bg-advo-page px-3.5 py-2.5 text-xs font-medium text-advo-text transition placeholder:text-advo-muted focus:border-advo-blue focus:bg-white focus:outline-none"
                      id="portal-title"
                      maxLength={80}
                      onChange={(event) => {
                        setTitle(event.target.value);
                        setSaved(false);
                      }}
                      placeholder={t("reseller.sites.field.portalTitlePlaceholder")}
                      value={title}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-advo-text" htmlFor="portal-message">
                      {t("reseller.sites.field.portalMessage")}
                    </label>
                    <textarea
                      className="w-full rounded-field border border-advo-border bg-advo-page px-3.5 py-2.5 text-xs font-medium text-advo-text transition placeholder:text-advo-muted focus:border-advo-blue focus:bg-white focus:outline-none"
                      id="portal-message"
                      maxLength={280}
                      onChange={(event) => {
                        setMessage(event.target.value);
                        setSaved(false);
                      }}
                      placeholder={t("reseller.sites.field.portalMessagePlaceholder")}
                      rows={3}
                      value={message}
                    />
                    <p className="text-right text-[10px] text-advo-muted">{message.length}/280</p>
                  </div>
                  <p className="text-[11px] text-advo-muted">{t("reseller.portal.saveHint")}</p>
                </Card>
                  </>
                ) : null}

                {tab === "adverts" ? (
                  <AdvertsEditor content={content} onChange={patchContent} onMove={moveAdvert} />
                ) : null}

                {tab === "businesses" ? (
                  <BusinessesEditor content={content} onChange={patchContent} onMove={moveBusiness} />
                ) : null}

                {tab === "promotions" ? <PromotionRequestsTab siteId={siteId} /> : null}
              </div>

              {/* ── Live preview ── */}
              <div className="space-y-3 lg:sticky lg:top-4 lg:h-fit">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-advo-blue" />
                  <div>
                    <p className="text-sm font-bold text-advo-text">{t("reseller.portal.preview.title")}</p>
                    <p className="text-[11px] text-advo-muted">{t("reseller.portal.preview.hint")}</p>
                  </div>
                </div>

                {usingFallback ? (
                  <Notice tone="default">{t("reseller.portal.preview.fallback")}</Notice>
                ) : null}

                <div className="inline-flex w-full items-center gap-0.5 rounded-xl border border-advo-border bg-white p-0.5">
                  {(["welcome", "connected"] as const).map((mode) => {
                    const active = previewMode === mode;
                    return (
                      <button
                        className={`flex-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${
                          active ? "bg-advo-blue text-white shadow-xs" : "text-advo-muted hover:text-advo-text"
                        }`}
                        key={mode}
                        onClick={() => setPreviewMode(mode)}
                        type="button"
                      >
                        {mode === "welcome" ? t("portal.stage.connect") : t("portal.stage.connected")}
                      </button>
                    );
                  })}
                </div>

                <PhonePreview
                  business={site?.name ?? ""}
                  buyLabel={t("reseller.portal.preview.buy")}
                  content={content}
                  emptyLabel={t("reseller.portal.preview.noPackages")}
                  message={message}
                  mode={previewMode}
                  packages={previewPackages}
                  theme={theme}
                  title={title || site?.name || ""}
                />
              </div>
            </div>
          )
        }
      </ResourceView>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Controls
 * ───────────────────────────────────────────────────────────────────────────*/

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-advo-border bg-white px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-xs font-bold text-advo-text">{label}</p>
        <p className="font-mono text-[11px] uppercase text-advo-muted">{value}</p>
      </div>
      <label className="relative shrink-0 cursor-pointer">
        <span
          aria-hidden="true"
          className="block h-9 w-11 rounded-lg border border-black/10 shadow-inner"
          style={{ background: value }}
        />
        <input
          aria-label={label}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          onChange={(event) => onChange(event.target.value)}
          type="color"
          value={value}
        />
      </label>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * iPhone preview
 * ───────────────────────────────────────────────────────────────────────────*/

function PhonePreview({
  theme,
  title,
  business,
  message,
  packages,
  emptyLabel,
  buyLabel,
  content,
  mode,
}: {
  theme: PortalTheme;
  title: string;
  business: string;
  message: string;
  packages: PackageRow[];
  emptyLabel: string;
  buyLabel: string;
  content: PortalContent;
  mode: "welcome" | "connected";
}) {
  const dark = isDark(theme.background);
  const muted = dark ? "rgba(255,255,255,0.6)" : "rgba(15,23,42,0.55)";
  const adverts = content.adverts.slice(0, Math.max(1, content.advertCount));
  const primaryAdvert = adverts[0];

  return (
    <div className="mx-auto w-full max-w-[340px]">
      {/* Phone shell */}
      <div className="relative rounded-[2.75rem] border border-black/20 bg-[#0a0a0a] p-2.5 shadow-[0_24px_60px_-20px_rgba(15,23,42,0.5)]">
        <div
          className="relative overflow-hidden rounded-[2.25rem]"
          style={{ background: theme.background, color: theme.text }}
        >
          {/* Notch */}
          <div className="absolute left-1/2 top-0 z-20 h-5 w-28 -translate-x-1/2 rounded-b-2xl bg-[#0a0a0a]" />
          {/* Status bar */}
          <div className="flex items-center justify-between px-4 pb-1 pt-2 text-[10px] font-bold" style={{ color: theme.text }}>
            <span>9:41</span>
            <span className="flex items-center gap-1.5">
              <span className="flex items-end gap-0.5" aria-hidden="true">
                {[5, 8, 11, 14].map((h) => (
                  <span key={h} className="w-[2.5px] rounded-sm" style={{ height: h, background: theme.text }} />
                ))}
              </span>
              <Wifi className="h-3 w-3" />
              <span className="inline-block h-2.5 w-5 rounded-[3px] border" style={{ borderColor: theme.text }} />
            </span>
          </div>

          {/* Screen content */}
          <div className="max-h-[560px] space-y-3 overflow-y-auto px-4 pb-8 pt-3">
            <header className="space-y-0.5">
              <h3 className="text-xl font-black leading-tight tracking-tight">{title}</h3>
              {business ? <p className="text-xs" style={{ color: muted }}>{business}</p> : null}
            </header>

            {mode === "connected" ? (
              <>
                <div
                  className="relative overflow-hidden rounded-2xl p-3 text-white"
                  style={{ backgroundImage: `linear-gradient(160deg, ${theme.primary}, #06122b)` }}
                >
                  <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-green-500 text-lg font-black">✓</div>
                  <p className="mt-1 text-center text-sm font-black">You&apos;re connected!</p>
                  <div className="mt-2 rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-[10px]">
                    {packages[0]?.currentRevision?.name ?? "WiFi pass"}
                  </div>
                  <button className="mt-2 w-full rounded-lg py-1.5 text-[11px] font-black" style={buttonFill(theme)} type="button">
                    Browse the internet
                  </button>
                  <p className="mt-3 text-[10px] font-black uppercase tracking-wide text-amber-300">Explore…</p>
                  <div className="mt-1.5 flex gap-1.5 overflow-hidden">
                    {content.businesses.slice(0, 3).map((biz) => (
                      <div className="w-[46%] shrink-0 overflow-hidden rounded-lg border border-white/15 bg-white/10" key={biz.id}>
                        <div className="grid h-8 place-items-center text-lg" style={{ background: `linear-gradient(135deg, ${biz.color}, #06122b)` }}>
                          {biz.glyph}
                        </div>
                        <p className="truncate px-1 py-0.5 text-[8px] font-bold">{biz.name}</p>
                      </div>
                    ))}
                    {content.businesses.length === 0 ? (
                      <span className="text-[9px] text-white/60">Add businesses in the Businesses tab.</span>
                    ) : null}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <span className="rounded-lg border border-white/25 bg-white/5 py-1.5 text-center text-[9px] font-black">▤ Jobs &amp; Opportunities</span>
                    <span className="rounded-lg border border-white/25 bg-white/5 py-1.5 text-center text-[9px] font-black">⌁ Promote</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                {primaryAdvert ? (
                  <div
                    className="relative h-[120px] overflow-hidden rounded-2xl p-3 text-white"
                    style={{ backgroundImage: `linear-gradient(120deg, ${primaryAdvert.color}, #061d48)` }}
                  >
                    <span className="absolute right-2 top-2 rounded-full bg-black/35 px-1.5 py-0.5 text-[8px] font-bold uppercase">Advert</span>
                    <strong className="mt-6 block text-sm font-black leading-tight">{primaryAdvert.title}</strong>
                    {primaryAdvert.copy ? <p className="mt-0.5 text-[10px] text-white/85">{primaryAdvert.copy}</p> : null}
                    <span className="absolute bottom-2 left-3 text-[9px] font-bold text-white/90">
                      1 / {adverts.length || 1}
                    </span>
                  </div>
                ) : null}

                {message ? (
                  <p className="text-xs leading-5" style={{ color: muted }}>
                    {message}
                  </p>
                ) : null}

                <p className="pt-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: muted }}>
                  {packages.length > 0 ? "Choose a package" : ""}
                </p>

                {packages.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-xl border border-dashed p-3 text-xs" style={{ borderColor: muted, color: muted }}>
                    <WifiOff className="h-4 w-4" />
                    {emptyLabel}
                  </div>
                ) : (
                  packages.slice(0, 3).map((pkg) => {
                    const rev = pkg.currentRevision!;
                    return (
                      <div
                        className="p-3 shadow-sm"
                        key={pkg.id}
                        style={{ background: theme.surface, borderRadius: theme.radius, color: theme.text }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold">{rev.name}</p>
                            <p className="text-[11px]" style={{ color: muted }}>
                              {formatDuration(rev.durationSeconds)} · {rev.quotaType === "UNLIMITED" ? "Unlimited" : "Data capped"}
                            </p>
                          </div>
                          <span className="shrink-0 whitespace-nowrap px-2 py-0.5 text-sm font-black" style={priceChip(theme)}>
                            {formatTzs(rev.priceTzs)}
                          </span>
                        </div>
                        <button className="mt-2.5 w-full py-2 text-xs font-black" style={buttonFill(theme)} type="button">
                          {buyLabel}
                        </button>
                      </div>
                    );
                  })
                )}
              </>
            )}

            <p className="pt-2 text-center text-[10px]" style={{ color: muted }}>
              Advo TZ
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** True when a hex colour is dark enough to need light text. */
function isDark(hex: string): boolean {
  const value = hex.replace("#", "");
  if (value.length !== 6) return false;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  // Rec. 601 luma
  return (r * 299 + g * 587 + b * 114) / 1000 < 140;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Adverts editor
 * ───────────────────────────────────────────────────────────────────────────*/

const DEFAULT_ADVERT_COLOR = "#117dcc";
const DEFAULT_BUSINESS_COLOR = "#294f9e";

function AdvertsEditor({
  content,
  onChange,
  onMove,
}: {
  content: PortalContent;
  onChange: (patch: Partial<PortalContent>) => void;
  onMove: (index: number, delta: number) => void;
}) {
  const { t } = useI18n();

  function update(index: number, patch: Partial<PortalAdvert>) {
    onChange({ adverts: content.adverts.map((ad, i) => (i === index ? { ...ad, ...patch } : ad)) });
  }

  const shown = Math.min(content.advertCount, content.adverts.length);

  return (
    <>
      <Card className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-advo-blue" />
          <div>
            <p className="text-sm font-bold text-advo-text">{t("reseller.portal.adverts.title")}</p>
            <p className="text-[11px] text-advo-muted">{t("reseller.portal.adverts.hint")}</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-advo-text" htmlFor="advert-count">
                {t("reseller.portal.adverts.count")}
              </label>
              <span className="rounded-md bg-advo-page px-1.5 py-0.5 font-mono text-[11px] text-advo-muted">{shown}/{content.adverts.length}</span>
            </div>
            <input
              className="mt-2 w-full accent-advo-blue"
              id="advert-count"
              max={Math.max(1, content.adverts.length)}
              min={0}
              onChange={(event) => onChange({ advertCount: Number(event.target.value) })}
              type="range"
              value={Math.min(content.advertCount, content.adverts.length)}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-advo-text" htmlFor="advert-interval">
              {t("reseller.portal.adverts.interval")}
            </label>
            <select
              className="mt-1.5 w-full rounded-field border border-advo-border bg-advo-page px-3 py-2 text-xs font-bold text-advo-text focus:border-advo-blue focus:bg-white focus:outline-none"
              id="advert-interval"
              onChange={(event) => onChange({ advertIntervalMs: Number(event.target.value) })}
              value={content.advertIntervalMs}
            >
              {[3000, 4500, 6000, 8000, 10000].map((ms) => (
                <option key={ms} value={ms}>
                  {t("reseller.portal.adverts.seconds", { seconds: ms / 1000 })}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {content.adverts.map((advert, index) => (
        <Card className="space-y-3 p-4" key={index}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-advo-text">{t("reseller.portal.adverts.banner", { n: index + 1 })}</p>
            <div className="flex items-center gap-1">
              <IconButton disabled={index === 0} label={t("reseller.portal.moveUp")} onClick={() => onMove(index, -1)}>
                <ArrowUp className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton disabled={index === content.adverts.length - 1} label={t("reseller.portal.moveDown")} onClick={() => onMove(index, 1)}>
                <ArrowDown className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton label={t("reseller.portal.remove")} onClick={() => onChange({ adverts: content.adverts.filter((_, i) => i !== index) })}>
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-advo-text">{t("reseller.portal.adverts.headline")}</label>
            <input
              className="w-full rounded-field border border-advo-border bg-advo-page px-3.5 py-2.5 text-xs font-medium text-advo-text focus:border-advo-blue focus:bg-white focus:outline-none"
              maxLength={60}
              onChange={(event) => update(index, { title: event.target.value })}
              value={advert.title}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-advo-text">{t("reseller.portal.adverts.copy")}</label>
            <input
              className="w-full rounded-field border border-advo-border bg-advo-page px-3.5 py-2.5 text-xs font-medium text-advo-text focus:border-advo-blue focus:bg-white focus:outline-none"
              maxLength={90}
              onChange={(event) => update(index, { copy: event.target.value })}
              value={advert.copy}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <ColorField label={t("reseller.portal.adverts.color")} onChange={(v) => update(index, { color: v })} value={advert.color} />
            <div className="space-y-1">
              <label className="text-xs font-bold text-advo-text">{t("reseller.portal.adverts.imageUrl")}</label>
              <input
                className="w-full rounded-field border border-advo-border bg-advo-page px-3.5 py-2.5 text-xs font-medium text-advo-text focus:border-advo-blue focus:bg-white focus:outline-none"
                onChange={(event) => update(index, { imageUrl: event.target.value || undefined })}
                placeholder="https://…"
                value={advert.imageUrl ?? ""}
              />
            </div>
          </div>
        </Card>
      ))}

      <Button
        className="w-full"
        onPress={() => onChange({ adverts: [...content.adverts, { title: "", copy: "", color: DEFAULT_ADVERT_COLOR }] })}
        type="button"
        variant="outline"
      >
        <Plus className="size-3.5" />
        {t("reseller.portal.adverts.add")}
      </Button>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Businesses editor
 * ───────────────────────────────────────────────────────────────────────────*/

function BusinessesEditor({
  content,
  onChange,
  onMove,
}: {
  content: PortalContent;
  onChange: (patch: Partial<PortalContent>) => void;
  onMove: (index: number, delta: number) => void;
}) {
  const { t } = useI18n();

  function update(index: number, patch: Partial<PortalBusiness>) {
    onChange({ businesses: content.businesses.map((b, i) => (i === index ? { ...b, ...patch } : b)) });
  }

  return (
    <>
      <Card className="space-y-2 p-4">
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-advo-blue" />
          <div>
            <p className="text-sm font-bold text-advo-text">{t("reseller.portal.businesses.title")}</p>
            <p className="text-[11px] text-advo-muted">{t("reseller.portal.businesses.hint")}</p>
          </div>
        </div>
        {content.businesses.length === 0 ? <p className="text-[11px] text-advo-muted">{t("reseller.portal.businesses.empty")}</p> : null}
      </Card>

      {content.businesses.map((business, index) => (
        <Card className="space-y-3 p-4" key={business.id}>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span
                className="grid h-8 w-8 place-items-center rounded-lg text-base text-white"
                style={{ background: `linear-gradient(135deg, ${business.color}, #06122b)` }}
              >
                {business.glyph || "◆"}
              </span>
              <span className="truncate text-sm font-bold text-advo-text">{business.name || "—"}</span>
            </span>
            <div className="flex items-center gap-1">
              <IconButton disabled={index === 0} label={t("reseller.portal.moveUp")} onClick={() => onMove(index, -1)}>
                <ArrowUp className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton disabled={index === content.businesses.length - 1} label={t("reseller.portal.moveDown")} onClick={() => onMove(index, 1)}>
                <ArrowDown className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton label={t("reseller.portal.remove")} onClick={() => onChange({ businesses: content.businesses.filter((_, i) => i !== index) })}>
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <TextField label={t("reseller.portal.businesses.name")} maxLength={50} onChange={(v) => update(index, { name: v })} value={business.name} />
            <TextField label={t("reseller.portal.businesses.category")} maxLength={40} onChange={(v) => update(index, { category: v })} value={business.category} />
            <TextField label={t("reseller.portal.businesses.glyph")} maxLength={4} onChange={(v) => update(index, { glyph: v })} value={business.glyph} />
            <ColorField label={t("reseller.portal.businesses.color")} onChange={(v) => update(index, { color: v })} value={business.color} />
          </div>
        </Card>
      ))}

      <Button
        className="w-full"
        onPress={() =>
          onChange({
            businesses: [
              ...content.businesses,
              {
                id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `b-${Date.now()}`,
                name: "",
                category: "",
                glyph: "◆",
                color: DEFAULT_BUSINESS_COLOR,
              },
            ],
          })
        }
        type="button"
        variant="outline"
      >
        <Plus className="size-3.5" />
        {t("reseller.portal.businesses.add")}
      </Button>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Promotion requests
 * ───────────────────────────────────────────────────────────────────────────*/

type PromotionRow = {
  id: string;
  siteId: string;
  packageCode: string;
  durationLabel: string;
  priceTzs: string;
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
    async (id: string, state: PromotionRow["state"]) => {
      await api.post(`/reseller/promotions/${id}/state`, { state });
    },
    async () => {
      await requests.reload();
    },
  );

  const rows = useMemo(() => (requests.data ?? []).filter((r) => !siteId || r.siteId === siteId), [requests.data, siteId]);

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Inbox className="h-4 w-4 text-advo-blue" />
        <div>
          <p className="text-sm font-bold text-advo-text">{t("reseller.portal.promotions.title")}</p>
          <p className="text-[11px] text-advo-muted">{t("reseller.portal.promotions.hint")}</p>
        </div>
      </div>
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
                  {row.packageCode} · {formatTzs(row.priceTzs)}
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
                      {t(`reseller.portal.promotions.state.${state}` as "reseller.portal.promotions.state.NEW")}
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

/* ─────────────────────────────────────────────────────────────────────────────
 * Small shared controls
 * ───────────────────────────────────────────────────────────────────────────*/

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      className="grid h-7 w-7 place-items-center rounded-lg border border-advo-border text-advo-muted transition hover:border-advo-blue hover:text-advo-blue disabled:cursor-default disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function TextField({
  label,
  value,
  onChange,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-bold text-advo-text">{label}</label>
      <input
        className="w-full rounded-field border border-advo-border bg-advo-page px-3.5 py-2.5 text-xs font-medium text-advo-text focus:border-advo-blue focus:bg-white focus:outline-none"
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </div>
  );
}
