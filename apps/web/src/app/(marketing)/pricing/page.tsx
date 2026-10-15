import { ShieldCheck, HelpCircle } from "lucide-react";
import type { PublicPlan } from "@advo/contracts";
import { getServerI18n } from "@/lib/i18n.server";
import { fetchPublicPlans, orderPlansForDisplay, popularPlanId } from "@/lib/public-plans";
import { PlanCardGrid } from "@/features/marketing/PlanCards";
import { ButtonLink, Section, SectionHeading } from "@/features/marketing/ui";

/**
 * The pricing catalog, read live from Admin.
 *
 * Nothing about a plan is hard-coded here: names, prices, trial length and the
 * capabilities each tier grants all come from the published plans Admin manages,
 * so repricing is a dashboard action rather than a deploy.
 *
 * The page uses the same charcoal band and showcase cards as the home pricing
 * section, so a visitor who follows "compare plans" does not land on a
 * different design.
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
    <Section tone="dark" aria-labelledby="pricing-page-title">
      <SectionHeading
        tone="dark"
        eyebrow={t("marketing.pricing.badge")}
        title={t("marketing.pricing.title")}
        lead={t("marketing.pricing.subtitle")}
        titleId="pricing-page-title"
      />

      {plans.length > 0 ? (
        <div className="mt-12">
          <PlanCardGrid dark plans={plans} t={t} popularId={popularId} ctaForPlan={ctaForPlan} />
        </div>
      ) : (
        <div className="mx-auto mt-12 max-w-xl rounded-[28px] border border-white/10 bg-white/[0.04] p-10 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-[#FBA102]/30 bg-[#FBA102]/10 text-[#FBA102]">
            <HelpCircle className="size-7" />
          </div>
          <p className="mt-4 text-sm text-white/65">{t("marketing.plans.empty")}</p>
          <div className="mt-5 flex justify-center">
            <ButtonLink href="/contact">{t("marketing.plans.contact")}</ButtonLink>
          </div>
        </div>
      )}

      <div className="mx-auto mt-16 flex max-w-4xl flex-col items-center gap-6 rounded-[28px] border border-[#FBA102]/25 bg-white/[0.04] p-8 sm:flex-row">
        <div className="grid size-16 shrink-0 place-items-center rounded-2xl border border-[#FBA102]/30 bg-[#FBA102]/10 text-[#FBA102]">
          <ShieldCheck className="size-8" />
        </div>
        <div className="min-w-0 text-center sm:text-left">
          <h2 className="text-lg font-bold text-white">{guaranteeTitle}</h2>
          <p className="mt-1 text-sm leading-relaxed text-white/65">{guaranteeBody}</p>
        </div>
        <ButtonLink
          href={trialPlan ? `/register?plan=${encodeURIComponent(trialPlan.code)}` : "/register"}
          className="shrink-0"
        >
          {trialPlan ? t("marketing.pricing.guarantee.cta") : t("marketing.pricing.guarantee.ctaNoTrial")}
        </ButtonLink>
      </div>
    </Section>
  );
}
