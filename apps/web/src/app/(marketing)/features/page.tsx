import Link from "next/link";
import {
  Wifi,
  ShieldCheck,
  Zap,
  ArrowRight,
  Radio,
  QrCode,
  Users,
  BarChart3,
  Clock,
  Sparkles,
  Lock,
  Layers,
  Smartphone,
  RefreshCw,
} from "lucide-react";
import { getServerI18n } from "@/lib/i18n.server";

export default async function FeaturesPage() {
  const { t } = await getServerI18n();
  return (
    <div className="w-full bg-[#F7F9FC] py-16 lg:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span
            className="inline-block text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-3"
            style={{
              background: "linear-gradient(135deg, rgba(27, 94, 164, 0.15) 0%, rgba(33, 118, 194, 0.15) 100%)",
              color: "#1B5EA4",
              border: "1px solid rgba(27, 94, 164, 0.25)",
            }}
          >
            {t("marketing.features.badge")}
          </span>
          <h1 className="text-3xl sm:text-5xl font-black text-[#18212F] tracking-tight">
            {t("marketing.features.title")}
          </h1>
          <p className="text-base sm:text-lg text-[#526174] mt-4">
            {t("marketing.features.subtitle")}
          </p>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* 1. Mobile Money Integration */}
          <div
            id="captive-portal"
            className="rounded-3xl border border-[#DFE5EC] bg-white p-8 shadow-sm space-y-4 transition-all duration-300 hover:shadow-xl"
          >
            <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#1B5EA4]">
              <Smartphone className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-[#18212F]">
              {t("marketing.features.portal.title")}
            </h3>
            <p className="text-sm text-[#526174] leading-relaxed">
              {t("marketing.features.portal.desc")}
            </p>
            <ul className="space-y-2 text-xs text-[#18212F] pt-2">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FBA102]" /> {t("marketing.features.portal.feature1")}
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FBA102]" /> {t("marketing.features.portal.feature2")}
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FBA102]" /> {t("marketing.features.portal.feature3")}
              </li>
            </ul>
          </div>

          {/* 2. TP-Link Omada SDN */}
          <div
            id="omada-integration"
            className="rounded-3xl border border-[#DFE5EC] bg-white p-8 shadow-sm space-y-4 transition-all duration-300 hover:shadow-xl"
          >
            <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#F16304]">
              <Radio className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-[#18212F]">
              {t("marketing.features.omada.title")}
            </h3>
            <p className="text-sm text-[#526174] leading-relaxed">
              {t("marketing.features.omada.desc")}
            </p>
            <ul className="space-y-2 text-xs text-[#18212F] pt-2">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#F16304]" /> {t("marketing.features.omada.feature1")}
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#F16304]" /> {t("marketing.features.omada.feature2")}
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#F16304]" /> {t("marketing.features.omada.feature3")}
              </li>
            </ul>
          </div>

          {/* 3. Vouchers & Printing */}
          <div
            id="vouchers"
            className="rounded-3xl border border-[#DFE5EC] bg-white p-8 shadow-sm space-y-4 transition-all duration-300 hover:shadow-xl"
          >
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-[#FBA102]">
              <QrCode className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-[#18212F]">
              {t("marketing.features.vouchers.title")}
            </h3>
            <p className="text-sm text-[#526174] leading-relaxed">
              {t("marketing.features.vouchers.desc")}
            </p>
            <ul className="space-y-2 text-xs text-[#18212F] pt-2">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1B5EA4]" /> {t("marketing.features.vouchers.feature1")}
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1B5EA4]" /> {t("marketing.features.vouchers.feature2")}
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1B5EA4]" /> {t("marketing.features.vouchers.feature3")}
              </li>
            </ul>
          </div>

          {/* 4. Append-Only Financial Ledger */}
          <div
            id="ledger"
            className="rounded-3xl border border-[#DFE5EC] bg-white p-8 shadow-sm space-y-4 transition-all duration-300 hover:shadow-xl"
          >
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-[#18212F]">
              {t("marketing.features.ledger.title")}
            </h3>
            <p className="text-sm text-[#526174] leading-relaxed">
              {t("marketing.features.ledger.desc")}
            </p>
            <ul className="space-y-2 text-xs text-[#18212F] pt-2">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" /> {t("marketing.features.ledger.feature1")}
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" /> {t("marketing.features.ledger.feature2")}
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" /> {t("marketing.features.ledger.feature3")}
              </li>
            </ul>
          </div>

          {/* 5. Device Limit & Roaming */}
          <div className="rounded-3xl border border-[#DFE5EC] bg-white p-8 shadow-sm space-y-4 transition-all duration-300 hover:shadow-xl">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-[#18212F]">
              {t("marketing.features.devices.title")}
            </h3>
            <p className="text-sm text-[#526174] leading-relaxed">
              {t("marketing.features.devices.desc")}
            </p>
            <ul className="space-y-2 text-xs text-[#18212F] pt-2">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-600" /> {t("marketing.features.devices.feature1")}
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-600" /> {t("marketing.features.devices.feature2")}
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-600" /> {t("marketing.features.devices.feature3")}
              </li>
            </ul>
          </div>

          {/* 6. Mawakala & Commissions */}
          <div
            id="agents"
            className="rounded-3xl border border-[#DFE5EC] bg-white p-8 shadow-sm space-y-4 transition-all duration-300 hover:shadow-xl"
          >
            <div className="w-12 h-12 rounded-2xl bg-cyan-50 border border-cyan-100 flex items-center justify-center text-[#1B5EA4]">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-[#18212F]">
              {t("marketing.features.agents.title")}
            </h3>
            <p className="text-sm text-[#526174] leading-relaxed">
              {t("marketing.features.agents.desc")}
            </p>
            <ul className="space-y-2 text-xs text-[#18212F] pt-2">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1B5EA4]" /> {t("marketing.features.agents.feature1")}
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1B5EA4]" /> {t("marketing.features.agents.feature2")}
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1B5EA4]" /> {t("marketing.features.agents.feature3")}
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="mt-16 rounded-3xl bg-[#111213] text-white p-10 text-center relative overflow-hidden border border-white/10">
          <h2 className="text-2xl sm:text-3xl font-bold">
            {t("marketing.features.cta.title")}
          </h2>
          <p className="text-sm text-white/70 max-w-xl mx-auto mt-2 mb-6">
            {t("marketing.features.cta.body")}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 text-sm font-bold text-white px-7 py-3.5 rounded-xl shadow-lg transition bg-[#1B5EA4] hover:bg-[#2176C2]"
            >
              <span>{t("marketing.features.cta.register")}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 text-sm font-semibold text-white/90 px-6 py-3.5 rounded-xl border border-white/20 hover:bg-white/10 transition"
            >
              {t("marketing.features.cta.pricing")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
