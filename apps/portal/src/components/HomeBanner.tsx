"use client";

import {
  PORTAL_CONTENT_STARTER,
  type DeliveredAdCampaign,
  type EffectivePortalConfig,
  type PortalAdvert,
  type PortalContent,
} from "@advo/contracts";
import { PortalAdvertCarousel, type PortalAdvertSlide } from "@advo/ui";
import { usePortalPreviewAppearance } from "@/lib/portal-preview";
import { useLocale } from "@/lib/portal";

/**
 * A starter advert is a placeholder, not an advertisement.
 *
 * Every new site is created with three "your business could be here" cards so a
 * portal that was never designed is not empty. Once an Admin publishes a real
 * campaign — or a reseller writes their own adverts — the placeholders must stop
 * rotating next to it. Compared on the fields a real advert always changes, so an
 * edited card is never mistaken for filler.
 */
const PLACEHOLDER_KEYS = new Set(
  PORTAL_CONTENT_STARTER.adverts.map((advert) =>
    [advert.title, advert.copy, advert.color ?? "", advert.imageUrl ?? ""].join("\u0000"),
  ),
);

const isPlaceholder = (advert: PortalAdvert) =>
  PLACEHOLDER_KEYS.has(
    [advert.title, advert.copy, advert.color ?? "", advert.imageUrl ?? ""].join("\u0000"),
  );

/**
 * Top banner on the guest's landing screen.
 *
 * Positioned at the very top of the portal frame (above the reseller header).
 * Combines admin-published campaigns and site-specific rotating adverts.
 * Toggled on/off via the "Home banner" (ads.banner) placement setting.
 *
 * Precedence is deliberate: a published campaign is the platform's own creative
 * and the reason an Admin opened the campaigns screen, so it is served on its
 * own. The site's own adverts join it only when they are the reseller's own
 * copy, and the starter placeholders are kept for the designer preview alone —
 * a real guest never sees "your business, seen here" once something has been
 * published.
 */
export function HomeBanner({
  content,
  config,
  campaigns,
  isPreview,
}: {
  content?: PortalContent;
  config?: EffectivePortalConfig | null;
  campaigns?: DeliveredAdCampaign[];
  isPreview?: boolean;
}) {
  const { t } = useLocale();
  const previewAppearance = usePortalPreviewAppearance();
  const siteAdverts = content?.adverts ?? [];
  const previewing = Boolean(isPreview) || previewAppearance !== null;

  /* Admin campaigns eligible for the top banner placement */
  const campaignSlides: PortalAdvertSlide[] = (campaigns ?? [])
    .filter((c) => c.placement === "ads.banner" || !c.placement)
    .map((c) => ({
      title: c.creative.title,
      copy: c.creative.description,
      color:
        c.creative.theme === "tech"
          ? "#0f766e"
          : c.creative.theme === "style"
            ? "#7c3aed"
            : "#b45309",
      imageUrl: c.creative.imageUrl,
      business: c.creative.business,
      phone: c.creative.phone,
      url: c.creative.url,
      cta: c.creative.cta,
    }));

  /** The site's own adverts, minus the cards it was created with. */
  const siteSlides: PortalAdvertSlide[] = siteAdverts
    .filter((a) => previewing || !isPlaceholder(a))
    .map((a) => ({
      title: a.title,
      copy: a.copy,
      color: a.color,
      imageUrl: a.imageUrl,
      business: a.business,
      phone: a.phone,
      url: a.url,
      cta: a.cta,
    }));

  // A campaign owns the banner: it is platform-controlled creative, so the
  // reseller's cards wait rather than compete for the same rotation.
  const allSlides: PortalAdvertSlide[] =
    campaignSlides.length > 0 ? campaignSlides : siteSlides;

  const bannerVisible =
    previewAppearance?.visibility?.banner !== undefined
      ? previewAppearance.visibility.banner
      : (config?.visibility?.["ads.banner"]?.visible ?? (allSlides.length > 0));

  // Only the designer sees the starter cardboard when nothing is published yet;
  // a guest's banner collapses instead of advertising an empty slot.
  const effectiveAdverts: PortalAdvertSlide[] =
    allSlides.length > 0
      ? allSlides
      : previewing
        ? PORTAL_CONTENT_STARTER.adverts.map((a) => ({
            title: a.title,
            copy: a.copy,
            color: a.color,
            imageUrl: a.imageUrl,
            business: a.business,
            phone: a.phone,
            url: a.url,
          }))
        : [];

  if (!bannerVisible || effectiveAdverts.length === 0) {
    return null;
  }

  return (
    <PortalAdvertCarousel
      adverts={effectiveAdverts}
      intervalMs={content?.advertIntervalMs}
      labels={{
        badge: t("portal.advertBadge"),
        previous: t("portal.advertPrev"),
        next: t("portal.advertNext"),
        play: t("portal.advertPlay"),
        pause: t("portal.advertPause"),
        position: t("portal.advertPosition"),
        tapToView: t("portal.advertTapToView"),
        share: t("portal.advertShareAction"),
        shareWhatsApp: t("portal.advertShareWhatsApp"),
        copyInfo: t("portal.advertCopyInfo"),
        copied: t("portal.advertCopied"),
        call: t("portal.advertCall"),
        whatsapp: t("portal.advertWhatsApp"),
        close: t("portal.advertClose"),
        wifiNotice: t("portal.advertWifiNotice"),
      }}
    />
  );
}
