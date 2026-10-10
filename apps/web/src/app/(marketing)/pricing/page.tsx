import Link from "next/link";
import { ShieldCheck, HelpCircle } from "lucide-react";
import type { PublicPlan } from "@advo/contracts";
import { getServerI18n } from "@/lib/i18n.server";
import { fetchPublicPlans, orderPlansForDisplay, popularPlanId } from "@/lib/public-plans";
import { PlanCardGrid } from "@/features/marketing/PlanCards";

/**
 * The pricing catalog, read live from Admin.
 *
 * Nothing about a plan is hard-coded here: names, prices, trial length and the
 * capabilities each tier grants all come from the published plans Admin manages,
 * so repricing is a dashboard action rather than a deploy.
 */
export default async function PricingPage() {
  const { t } = await getServerI18n();
  const plans = orderPlansForDisplay(await fetchPublicPlans());
  const popularId = popularPlanId(plans);

  // The trial is a per-plan property, so the guarantee banner reads it from the
  // live catalog instead of hard-coding a number Admin can change.
  const trialPlan =
    plans.find((plan): plan is PublicPlan & { trialDays: number } => (plan.trialDays ?? 0) > 0) ?? null;
  const guaranteeTitle = trialPlan
    ? t("marketing.pricing.guarantee.title", { days: trialPlan.trialDays, plan: trialPlan.name })
    : t("marketing.pricing.guarantee.noTrial.title");
  const guaranteeBody = trialPlan
    ? t("marketing.pricing.guarantee.body", { days: trialPlan.trialDays, plan: trialPlan.name })
    : t("marketing.pricing.guarantee.noTrial.body");

  // The dearest tier is a sales conversation, not a self-serve signup — the
  // cheapest one is where a visitor should land. Everything between is neutral.
  const lastPlanId = plans.at(-1)?.id ?? null;

  function ctaForPlan(plan: PublicPlan) {
    if (plan.id === lastPlanId && plans.length > 1) {
      return {
        href: `/contact?interest=${encodeURIComponent(plan.code)}`,
        label: t("marketing.plans.contact"),
      };
    }
    return { href: `/register?plan=${encodeURIComponent(plan.code)}` };
  }

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
          <p className="text-base sm:text-lg text-[#526174] mt-4">{t("marketing.pricing.subtitle")}</p>
        </div>

        {/* Live plan catalog */}
        {plans.length > 0 ? (
          <div className="mb-20">
            <PlanCardGrid plans={plans} t={t} popularId={popularId} ctaForPlan={ctaForPlan} />
          </div>
        ) : (
          <div className="mb-20 rounded-3xl border border-[#DFE5EC] bg-white p-10 text-center max-w-xl mx-auto shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#1B5EA4] mx-auto">
              <HelpCircle className="w-7 h-7" />
            </div>
            <p className="mt-4 text-sm text-[#526174]">{t("marketing.plans.empty")}</p>
            <Link
              href="/contact"
              className="mt-5 inline-block px-6 py-3 rounded-xl font-bold text-xs text-white shadow-md"
              style={{ backgroundColor: "#1B5EA4" }}
            >
              {t("marketing.plans.contact")}
            </Link>
          </div>
        )}

        {/* Guarantee Banner */}
        <div className="rounded-3xl border border-[#DFE5EC] bg-white p-8 max-w-4xl mx-auto flex flex-col sm:flex-row items-center gap-6 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <h4 className="text-lg font-bold text-[#18212F]">{guaranteeTitle}</h4>
            <p className="text-xs text-[#526174] mt-1 leading-relaxed">{guaranteeBody}</p>
          </div>
          <Link
            href={trialPlan ? `/register?plan=${encodeURIComponent(trialPlan.code)}` : "/register"}
            className="shrink-0 px-6 py-3 rounded-xl font-bold text-xs text-white shadow-md transition"
            style={{
              backgroundColor: "#1B5EA4",
            }}
          >
            {trialPlan ? t("marketing.pricing.guarantee.cta") : t("marketing.pricing.guarantee.ctaNoTrial")}
          </Link>
        </div>
      </div>
    </div>
  );
}
