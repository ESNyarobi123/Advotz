"use client";

import { AdvoLogo } from "@/features/marketing/AdvoLogo";
import { GOLD_TEXT } from "@/features/marketing/ui";
import { useI18n } from "@/lib/i18n";
import {
  Wifi,
  ShieldCheck,
  Smartphone,
  CheckCircle2,
  Star,
} from "lucide-react";

interface AuthShowcasePanelProps {
  type: "login" | "register";
}

const FEATURES = [
  {
    icon: Smartphone,
    titleKey: "auth.showcase.feature1.title" as const,
    bodyKey: "auth.showcase.feature1.body" as const,
    iconClass: "border-[#FBA102]/35 bg-[#FBA102]/15 text-[#FBA102]",
  },
  {
    icon: Wifi,
    titleKey: "auth.showcase.feature2.title" as const,
    bodyKey: "auth.showcase.feature2.body" as const,
    iconClass: "border-[#F16304]/35 bg-[#F16304]/15 text-[#F48B45]",
  },
  {
    icon: ShieldCheck,
    titleKey: "auth.showcase.feature3.title" as const,
    bodyKey: "auth.showcase.feature3.body" as const,
    iconClass: "border-emerald-400/35 bg-emerald-400/15 text-emerald-300",
  },
] as const;

export function AuthShowcasePanel({ type }: AuthShowcasePanelProps) {
  const { t } = useI18n();
  const isLogin = type === "login";

  return (
    <aside className="relative hidden select-none overflow-hidden bg-advo-charcoal text-white lg:flex lg:w-[48%] xl:w-1/2 lg:flex-col lg:justify-between p-10 xl:p-14">
      {/* Technical grid — same recipe as the marketing hero */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse 75% 55% at 50% 0%, #000 35%, transparent 100%)",
        }}
      />
      {/* Warm gold wash only — landing hero has no blue bloom */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[36rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(251,161,2,0.16),transparent_68%)] blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-28 -right-16 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(241,99,4,0.14),transparent_70%)] blur-3xl"
      />

      <div className="relative z-10 space-y-8">
        <div className="flex items-center justify-between gap-4">
          <AdvoLogo size="md" variant="dark" />
          <span className="inline-flex items-center gap-2 rounded-full border border-[#FBA102]/45 bg-[#FBA102]/10 px-3 py-1 text-[11px] font-bold tracking-[0.14em] text-[#FBA102] uppercase">
            <span className="size-1.5 rounded-full bg-[#FBA102] animate-pulse" />
            {t("auth.showcase.cloudBadge")}
          </span>
        </div>

        <div className="space-y-4 pt-2">
          <h2 className="max-w-lg text-3xl font-black leading-[1.1] tracking-tight text-balance xl:text-4xl">
            {isLogin ? (
              <>
                {t("auth.showcase.loginTitleLead")}{" "}
                <span className={GOLD_TEXT}>{t("auth.showcase.loginTitleAccent")}</span>{t("auth.showcase.loginTitleTrail")}
              </>
            ) : (
              <>
                {t("auth.showcase.registerTitleLead")}{" "}
                <span className={GOLD_TEXT}>{t("auth.showcase.registerTitleAccent")}</span>{" "}
                {t("auth.showcase.registerTitleTrail")}
              </>
            )}
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-white/70 xl:text-[15px]">
            {isLogin ? t("auth.showcase.loginBody") : t("auth.showcase.registerBody")}
          </p>
        </div>

        <ul className="space-y-3 pt-2">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <li
                key={feature.titleKey}
                className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 transition duration-300 hover:border-white/20 hover:bg-white/[0.07]"
              >
                <div
                  className={`flex size-10 shrink-0 items-center justify-center rounded-xl border ${feature.iconClass}`}
                >
                  <Icon className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-xs font-bold tracking-wider text-white uppercase">
                    {t(feature.titleKey)}
                  </h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-white/55">
                    {t(feature.bodyKey)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="relative z-10 mt-8 space-y-4 border-t border-white/10 pt-7">
        <div className="space-y-2.5 rounded-2xl border border-white/10 bg-gradient-to-r from-white/[0.07] to-white/[0.02] p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-0.5" aria-hidden="true">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="size-3.5 fill-advo-gold text-advo-gold" />
              ))}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
              <CheckCircle2 className="size-3" aria-hidden="true" />
              {t("auth.showcase.verifiedNetwork")}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-white/75 italic">
            &ldquo;{t("auth.showcase.testimonialQuote")}&rdquo;
          </p>
          <p className="text-[11px] font-semibold text-white/50">
            — {t("auth.showcase.testimonialAuthor")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/55">
          <span className="inline-flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            {t("auth.showcase.hotspots")}
          </span>
          <span>{t("auth.showcase.uptime")}</span>
          <span>{t("auth.showcase.instantPayments")}</span>
        </div>
      </div>
    </aside>
  );
}
