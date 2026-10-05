import Link from "next/link";
import { CheckCircle2, ArrowRight, Sparkles, HelpCircle, ShieldCheck } from "lucide-react";
import { getServerI18n } from "@/lib/i18n.server";

export default async function PricingPage() {
  const { t } = await getServerI18n();

  const plans = [
    {
      id: "starter",
      name: t("marketing.pricing.starter.name"),
      desc: t("marketing.pricing.starter.desc"),
      priceTzs: 25000,
      period: t("marketing.pricing.period"),
      highlight: false,
      features: [
        t("marketing.pricing.starter.feature1"),
        t("marketing.pricing.starter.feature2"),
        t("marketing.pricing.starter.feature3"),
        t("marketing.pricing.starter.feature4"),
        t("marketing.pricing.starter.feature5"),
        t("marketing.pricing.starter.feature6"),
        t("marketing.pricing.starter.feature7"),
      ],
      ctaText: t("marketing.pricing.starter.cta"),
      ctaHref: "/register?plan=starter",
    },
    {
      id: "pro",
      name: t("marketing.pricing.pro.name"),
      desc: t("marketing.pricing.pro.desc"),
      priceTzs: 50000,
      period: t("marketing.pricing.period"),
      highlight: true,
      features: [
        t("marketing.pricing.pro.feature1"),
        t("marketing.pricing.pro.feature2"),
        t("marketing.pricing.pro.feature3"),
        t("marketing.pricing.pro.feature4"),
        t("marketing.pricing.pro.feature5"),
        t("marketing.pricing.pro.feature6"),
        t("marketing.pricing.pro.feature7"),
        t("marketing.pricing.pro.feature8"),
      ],
      ctaText: t("marketing.pricing.pro.cta"),
      ctaHref: "/register?plan=pro",
    },
    {
      id: "enterprise",
      name: t("marketing.pricing.enterprise.name"),
      desc: t("marketing.pricing.enterprise.desc"),
      priceTzs: 120000,
      period: t("marketing.pricing.period"),
      highlight: false,
      features: [
        t("marketing.pricing.enterprise.feature1"),
        t("marketing.pricing.enterprise.feature2"),
        t("marketing.pricing.enterprise.feature3"),
        t("marketing.pricing.enterprise.feature4"),
        t("marketing.pricing.enterprise.feature5"),
        t("marketing.pricing.enterprise.feature6"),
        t("marketing.pricing.enterprise.feature7"),
      ],
      ctaText: t("marketing.pricing.enterprise.cta"),
      ctaHref: "/contact?interest=enterprise",
    },
  ];

  return (
    <div className="w-full bg-[#F7F9FC] py-16 lg:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span
            className="inline-block text-xs font-bold uppercase tracking-wider px-3.5 py-1 rounded-full mb-3"
            style={{
              background: "linear-gradient(135deg, rgba(251, 161, 2, 0.15) 0%, rgba(241, 99, 4, 0.15) 100%)",
              color: "#F16304",
              border: "1px solid rgba(241, 99, 4, 0.3)",
            }}
          >
            {t("marketing.pricing.badge")}
          </span>
          <h1 className="text-3xl sm:text-5xl font-black text-[#18212F] tracking-tight">
            {t("marketing.pricing.title")}
          </h1>
          <p className="text-base sm:text-lg text-[#526174] mt-4">
            {t("marketing.pricing.subtitle")}
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch mb-20">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-3xl bg-white p-8 flex flex-col justify-between transition-all duration-300 ${
                plan.highlight
                  ? "border-2 border-[#1B5EA4] shadow-2xl relative scale-105 z-10"
                  : "border border-[#DFE5EC] shadow-sm hover:shadow-xl"
              }`}
              style={
                plan.highlight
                  ? {
                      boxShadow: "0 20px 40px -10px rgba(27, 94, 164, 0.3)",
                    }
                  : undefined
              }
            >
              {plan.highlight && (
                <div
                  className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-[10px] font-black uppercase tracking-wider px-3.5 py-1 rounded-full shadow-md"
                  style={{
                    background: "linear-gradient(135deg, #FBA102 0%, #F16304 100%)",
                    color: "#111213",
                  }}
                >
                  {t("marketing.pricing.popular")}
                </div>
              )}

              <div>
                <h3 className="text-2xl font-bold text-[#18212F]">{plan.name}</h3>
                <p className="text-xs text-[#526174] mt-1 min-h-[32px]">
                  {plan.desc}
                </p>

                <div className="my-6">
                  <span className="text-4xl font-black text-[#18212F] font-mono">
                    TZS {plan.priceTzs.toLocaleString()}
                  </span>
                  <span className="text-xs text-[#526174] ml-2 font-medium">
                    / {plan.period}
                  </span>
                </div>

                <div className="space-y-3 pt-6 border-t border-slate-100">
                  <div className="text-xs font-bold text-[#526174] uppercase tracking-wider">
                    {t("marketing.pricing.included")}
                  </div>
                  <ul className="space-y-2.5 text-xs text-[#18212F]">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <CheckCircle2
                          className={`w-4 h-4 shrink-0 mt-0.5 ${
                            plan.highlight ? "text-[#FBA102]" : "text-[#1B5EA4]"
                          }`}
                        />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="pt-8">
                <Link
                  href={plan.ctaHref}
                  className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-xs shadow-md transition ${
                    plan.highlight
                      ? "text-white bg-[#1B5EA4] hover:bg-[#2176C2]"
                      : "border border-[#1B5EA4] text-[#1B5EA4] hover:bg-blue-50"
                  }`}
                >
                  <span>{plan.ctaText}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Guarantee Banner */}
        <div className="rounded-3xl border border-[#DFE5EC] bg-white p-8 max-w-4xl mx-auto flex flex-col sm:flex-row items-center gap-6 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <h4 className="text-lg font-bold text-[#18212F]">
              {t("marketing.pricing.guarantee.title")}
            </h4>
            <p className="text-xs text-[#526174] mt-1 leading-relaxed">
              {t("marketing.pricing.guarantee.body")}
            </p>
          </div>
          <Link
            href="/register"
            className="shrink-0 px-6 py-3 rounded-xl font-bold text-xs text-white shadow-md transition"
            style={{
              backgroundColor: "#1B5EA4",
            }}
          >
            {t("marketing.pricing.guarantee.cta")}
          </Link>
        </div>
      </div>
    </div>
  );
}
