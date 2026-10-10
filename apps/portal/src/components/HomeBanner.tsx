"use client";

import {
  PORTAL_CONTENT_STARTER,
  type DeliveredAdCampaign,
  type EffectivePortalConfig,
  type PortalContent,
} from "@advo/contracts";
import { PortalAdvertCarousel, type PortalAdvertSlide } from "@advo/ui";
import { usePortalPreviewAppearance } from "@/lib/portal-preview";
import { useLocale } from "@/lib/portal";

/**
 * Top banner on the guest's landing screen.
 *
 * Positioned at the very top of the portal frame (above the reseller header).
 * Combines admin-published campaigns and site-specific rotating adverts.
 * Toggled on/off via the "Home banner" (ads.banner) placement setting.
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

  // Admin campaigns eligible for the top banner placement
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

  const siteSlides: PortalAdvertSlide[] = siteAdverts.map((a) => ({
    title: a.title,
    copy: a.copy,
    color: a.color,
    imageUrl: a.imageUrl,
    business: a.business,
    phone: a.phone,
    url: a.url,
    cta: a.cta,
  }));

  const allSlides: PortalAdvertSlide[] = [...campaignSlides, ...siteSlides];

  const bannerVisible =
    previewAppearance?.visibility?.banner !== undefined
      ? previewAppearance.visibility.banner
      : (config?.visibility?.["ads.banner"]?.visible ?? (allSlides.length > 0));

  const effectiveAdverts: PortalAdvertSlide[] =
    allSlides.length > 0
      ? allSlides
      : isPreview || previewAppearance !== null
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
