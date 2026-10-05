"use client";

import { AdvoLogo } from "@/features/marketing/AdvoLogo";
import { useI18n } from "@/lib/i18n";
import {
  Wifi,
  ShieldCheck,
  TrendingUp,
  Smartphone,
  CheckCircle2,
  Star,
  Sparkles,
} from "lucide-react";

interface AuthShowcasePanelProps {
  type: "login" | "register";
}

export function AuthShowcasePanel({ type }: AuthShowcasePanelProps) {
  const { t } = useI18n();
  const isLogin = type === "login";

  return (
    <div className="hidden lg:flex lg:w-1/2 bg-[#111213] text-white flex-col justify-between p-12 xl:p-16 relative overflow-hidden select-none">
      {/* Ambient background glows */}
      <div
        className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-25 pointer-events-none blur-3xl"
        style={{
          background: "radial-gradient(circle, #1B5EA4 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full opacity-20 pointer-events-none blur-3xl"
        style={{
          background: "radial-gradient(circle, #FBA102 0%, #F16304 50%, transparent 75%)",
        }}
      />

      {/* Subtle tech dot grid overlay */}
      <div
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(#ffffff 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Header */}
      <div className="relative z-10 space-y-6">
        <div className="flex items-center justify-between">
          <AdvoLogo size="md" variant="dark" />
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase bg-white/5 border border-white/10 text-[#FBA102]">
            <span className="w-2 h-2 rounded-full bg-[#FBA102] animate-pulse" />
            {t("auth.showcase.cloudBadge")}
          </div>
        </div>

        <div className="space-y-3 pt-6">
          <h2 className="text-3xl xl:text-4xl font-black text-white tracking-tight leading-tight">
            {isLogin ? (
              <>
                {t("auth.showcase.loginTitleLead")}{" "}
                <span
                  style={{
                    background: "linear-gradient(135deg, #FBA102 0%, #F16304 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  {t("auth.showcase.loginTitleAccent")}
                </span>
                {t("auth.showcase.loginTitleTrail")}
              </>
            ) : (
              <>
                {t("auth.showcase.registerTitleLead")}{" "}
                <span
                  style={{
                    background: "linear-gradient(135deg, #FBA102 0%, #F16304 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  {t("auth.showcase.registerTitleAccent")}
                </span>{" "}
                {t("auth.showcase.registerTitleTrail")}
              </>
            )}
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed max-w-lg">
            {isLogin
              ? t("auth.showcase.loginBody")
              : t("auth.showcase.registerBody")}
          </p>
        </div>

        {/* Feature Highlights Grid */}
        <div className="space-y-4 pt-4">
          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm transition-all hover:bg-white/[0.07]">
            <div className="w-10 h-10 rounded-xl bg-[#1B5EA4]/20 border border-[#1B5EA4]/40 flex items-center justify-center shrink-0 text-[#2176C2]">
              <Smartphone className="w-5 h-5 text-[#2176C2]" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                {t("auth.showcase.feature1.title")}
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                {t("auth.showcase.feature1.body")}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm transition-all hover:bg-white/[0.07]">
            <div className="w-10 h-10 rounded-xl bg-[#FBA102]/20 border border-[#FBA102]/40 flex items-center justify-center shrink-0 text-[#FBA102]">
              <Wifi className="w-5 h-5 text-[#FBA102]" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                {t("auth.showcase.feature2.title")}
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                {t("auth.showcase.feature2.body")}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm transition-all hover:bg-white/[0.07]">
            <div className="w-10 h-10 rounded-xl bg-[#10B981]/20 border border-[#10B981]/40 flex items-center justify-center shrink-0 text-emerald-400">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                {t("auth.showcase.feature3.title")}
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                {t("auth.showcase.feature3.body")}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Testimonial & Trust Badges */}
      <div className="relative z-10 pt-8 mt-6 border-t border-white/10 space-y-4">
        {/* Testimonial card */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-white/[0.06] to-white/[0.02] border border-white/[0.08] space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-[#FBA102]">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-3.5 h-3.5 fill-[#FBA102] text-[#FBA102]" />
              ))}
            </div>
            <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> {t("auth.showcase.verifiedNetwork")}
            </span>
          </div>
          <p className="text-xs italic text-slate-300">
            &ldquo;{t("auth.showcase.testimonialQuote")}&rdquo;
          </p>
          <div className="text-[11px] text-slate-400 font-semibold">
            &mdash; {t("auth.showcase.testimonialAuthor")}
          </div>
        </div>

        {/* Live status stats */}
        <div className="flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{t("auth.showcase.hotspots")}</span>
          </div>
          <span>{t("auth.showcase.uptime")}</span>
          <span>{t("auth.showcase.instantPayments")}</span>
        </div>
      </div>
    </div>
  );
}
