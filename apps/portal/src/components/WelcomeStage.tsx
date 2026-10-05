"use client";

import Link from "next/link";
import { Button } from "@heroui/react";
import { AdvertCarousel } from "@/components/AdvertCarousel";
import { primaryButton } from "@/lib/theme";
import type { PortalSite } from "@/lib/portal-types";
import { useLocale } from "@/lib/portal";

/**
 * Stage 1 — the guest's first impression. Advert carousel, the site's welcome
 * message, three service benefits and the "Connect now" call to action.
 */
export function WelcomeStage({ site, onConnect }: { site: PortalSite; onConnect: () => void }) {
  const { t } = useLocale();
  const theme = site.theme;
  const buy = primaryButton(theme);
  const adverts = site.content?.adverts ?? [];
  const intervalMs = site.content?.advertIntervalMs ?? 4500;

  const benefits = [
    { glyph: "⚡", label: t("portal.benefitFast") },
    { glyph: "✓", label: t("portal.benefitSimple") },
    { glyph: "◎", label: t("portal.benefitLocal") },
  ];

  return (
    <section aria-label={t("portal.welcomeTo", { site: site.title })} className="flex flex-1 flex-col">
      <AdvertCarousel adverts={adverts} intervalMs={intervalMs} />

      <p className="text-center text-[11px] font-black uppercase tracking-[0.13em]" style={{ color: "var(--advo-blue)" }}>
        {t("portal.stageLabel", { stage: 1, total: 3 })}
      </p>
      <h2 className="mt-1 text-center text-[1.75rem] font-black leading-tight tracking-tight" style={{ color: "var(--advo-text)" }}>
        {t("portal.welcomeTo", { site: site.title })}
      </h2>
      <p className="mx-auto mb-4 mt-2 max-w-[330px] text-center text-sm" style={{ color: "var(--advo-muted)" }}>
        {t("portal.welcomeLead", { business: site.business })}
      </p>

      <ul className="mb-5 flex list-none justify-center gap-3 p-0">
        {benefits.map((benefit) => (
          <li className="grid justify-items-center gap-1" key={benefit.label}>
            <span
              aria-hidden
              className="grid h-8 w-8 place-items-center rounded-[10px] text-sm"
              style={{ background: "color-mix(in srgb, var(--advo-blue) 12%, transparent)", color: "var(--advo-blue)" }}
            >
              {benefit.glyph}
            </span>
            <span className="text-[11px] font-bold" style={{ color: "var(--advo-muted)" }}>
              {benefit.label}
            </span>
          </li>
        ))}
      </ul>

      <Button
        fullWidth
        onPress={onConnect}
        size="lg"
        style={{ ...buy.style, borderRadius: theme?.radius }}
        type="button"
        variant={buy.variant}
      >
        <span aria-hidden>◉</span> {t("portal.connectNow")}
      </Button>

      <p className="mt-4 text-center text-sm">
        <span style={{ color: "var(--advo-muted)" }}>{t("haveVoucher")} </span>
        <Link className="font-semibold underline" href={`/${site.slug}/voucher`} style={{ color: "var(--advo-blue)" }}>
          {t("login")}
        </Link>
      </p>
    </section>
  );
}
