"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Notice } from "@advo/ui";
import { ConnectedStage } from "@/components/ConnectedStage";
import { PortalFrame } from "@/components/PortalFrame";
import { portalApi, useLocale } from "@/lib/portal";
import type { PortalBootstrap } from "@/lib/portal-types";

/**
 * How long the sample session on this page pretends to have left.
 *
 * The page is a preview, not a session: the number exists only so the card the
 * guest will actually see is drawn in full — package, countdown, remaining-time
 * bar and the Explore menus. Nothing here reads a paid order, so no real grant
 * is invented and the note at the top says so.
 */
const SAMPLE_SECONDS = 3 * 3600;

/**
 * Public "this is what you get after paying" page for one WiFi location.
 *
 * The captive window a phone opens before payment is owned by the operating
 * system and closes as soon as the device goes online, so adverts and the
 * Explore menus need a home that does not depend on that window staying open.
 * This is that home: an ordinary page on an ordinary HTTPS origin, safe to put
 * on a QR code, a WhatsApp message or a poster, and readable in any browser.
 *
 * It is deliberately separate from `/<slug>/status`, which belongs to a guest
 * who has an order. Mixing the two would show a made-up session to somebody
 * whose token was simply lost, which is the one thing a status page must never
 * do.
 */
export default function ConnectedPreviewPage() {
  const { brandSlug } = useParams<{ brandSlug: string }>();
  const { locale, t, toggle, setLocale } = useLocale();
  const [extras, setExtras] = useState<PortalBootstrap | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    portalApi
      .get<PortalBootstrap>(`/portal/sites/${encodeURIComponent(brandSlug)}`)
      .then(setExtras)
      .catch(() => setFailed(true));
  }, [brandSlug]);

  const samplePackage = extras?.packages[0] ?? null;

  return (
    <PortalFrame
      backgroundUrl={extras?.site.backgroundUrl}
      languageLabel={t("language")}
      locale={locale}
      onSelectLanguage={setLocale}
      onToggleLanguage={toggle}
      theme={extras?.site.theme}
      title={extras?.site.title ?? t("portal.connectedTitle")}
    >
      {failed ? <Notice tone="warning">{t("portal.loadFailed")}</Notice> : null}

      {extras ? (
        <div className="mt-2 space-y-3">
          <Notice tone="accent">{t("portal.previewNote")}</Notice>
          <ConnectedStage
            business={extras.site.business}
            businesses={extras.site.content?.businesses ?? []}
            config={extras.config}
            experienceOnly={false}
            landingUrl="https://www.google.com"
            listings={extras.listings}
            promotionPackages={extras.promotionPackages}
            session={{
              packageName: samplePackage?.name ?? null,
              expiresAt: new Date(
                Date.now() + SAMPLE_SECONDS * 1000,
              ).toISOString(),
              devices: 1,
              maxDevices: samplePackage?.maxDevices ?? 2,
              durationSeconds: samplePackage?.durationSeconds ?? SAMPLE_SECONDS,
            }}
            sessionLabel={samplePackage?.name ?? null}
            showHeader
            siteTitle={extras.site.title}
            slug={brandSlug}
            theme={extras.site.theme}
          />
          <p className="text-center text-sm">
            <Link
              className="text-[var(--advo-blue)] underline"
              href={`/${brandSlug}`}
            >
              {t("buyAgain")}
            </Link>
          </p>
        </div>
      ) : null}
    </PortalFrame>
  );
}
