import {
  Wifi,
  ShieldCheck,
  CheckCircle2,
  Layers,
  Users,
  BarChart3,
  Coffee,
  Building2,
  GraduationCap,
  Radio,
  QrCode,
  Star,
  Wallet,
} from "lucide-react";
import { HeroPhoneMockup } from "@/features/marketing/HeroPhoneMockup";
import { InteractiveRevenueCalculator } from "@/features/marketing/InteractiveRevenueCalculator";
import { FaqSection } from "@/features/marketing/FaqSection";
import { PlanCardGrid } from "@/features/marketing/PlanCards";
import { getServerI18n } from "@/lib/i18n.server";
import { fetchPublicPlans, orderPlansForDisplay, popularPlanId } from "@/lib/public-plans";
import {
  ButtonLink,
  Card,
  Container,
  Eyebrow,
  GOLD_TEXT,
  Section,
  SectionHeading,
  cx,
} from "@/features/marketing/ui";

/** Payment rails and hardware the platform is wired into, in brand order. */
const PAYMENT_BRANDS = ["M-Pesa", "Tigo Pesa", "Airtel Money", "Halopesa"];

/**
 * Faces behind the hero's social proof. Initials on a brand-coloured disc —
 * cheap to render, no stock photography of people who do not exist.
 */
const AVATARS = [
  { initials: "JM", tone: "bg-advo-orange" },
  { initials: "FA", tone: "bg-advo-violet" },
  { initials: "EM", tone: "bg-advo-teal" },
  { initials: "SN", tone: "bg-advo-orange" },
];

export default async function MarketingHomePage() {
  const { t } = await getServerI18n();

  const stats = [
    { value: `< ${t("marketing.home.stats.speedValue")}`, label: t("marketing.home.stats.speedLabel") },
    { value: "99.98%", label: t("marketing.home.stats.uptimeLabel") },
    { value: "100%", label: t("marketing.home.stats.ledgerLabel") },
    { value: "0%", label: t("marketing.home.stats.lossLabel") },
  ];

  const solutions = [
    {
      icon: <Coffee className="size-6" />,
      tone: "gold" as const,
      title: t("marketing.home.solutions.cafe.title"),
      desc: t("marketing.home.solutions.cafe.desc"),
      points: [t("marketing.home.solutions.cafe.feature1"), t("marketing.home.solutions.cafe.feature2")],
    },
    {
      icon: <Building2 className="size-6" />,
      tone: "gold" as const,
      title: t("marketing.home.solutions.hotel.title"),
      desc: t("marketing.home.solutions.hotel.desc"),
      points: [t("marketing.home.solutions.hotel.feature1"), t("marketing.home.solutions.hotel.feature2")],
    },
    {
      icon: <GraduationCap className="size-6" />,
      tone: "warning" as const,
      title: t("marketing.home.solutions.hostel.title"),
      desc: t("marketing.home.solutions.hostel.desc"),
      points: [t("marketing.home.solutions.hostel.feature1"), t("marketing.home.solutions.hostel.feature2")],
    },
    {
      icon: <Radio className="size-6" />,
      tone: "warning" as const,
      title: t("marketing.home.solutions.wisp.title"),
      desc: t("marketing.home.solutions.wisp.desc"),
      points: [t("marketing.home.solutions.wisp.feature1"), t("marketing.home.solutions.wisp.feature2")],
    },
  ];

  const steps = [
    { title: t("marketing.home.how.step1.title"), desc: t("marketing.home.how.step1.desc") },
    { title: t("marketing.home.how.step2.title"), desc: t("marketing.home.how.step2.desc") },
    { title: t("marketing.home.how.step3.title"), desc: t("marketing.home.how.step3.desc") },
    { title: t("marketing.home.how.step4.title"), desc: t("marketing.home.how.step4.desc") },
  ];

  const features = [
    {
      icon: <ShieldCheck className="size-6" />,
      iconClass: "border-[#FBA102]/35 bg-[#FBA102]/15 text-[#FBA102]",
      title: t("marketing.home.features.ledger.title"),
      desc: t("marketing.home.features.ledger.desc"),
    },
    {
      icon: <Radio className="size-6" />,
      iconClass: "border-[#FBA102]/35 bg-[#FBA102]/15 text-[#FBA102]",
      title: t("marketing.home.features.omada.title"),
      desc: t("marketing.home.features.omada.desc"),
    },
    {
      icon: <Layers className="size-6" />,
      iconClass: "border-[#F16304]/35 bg-[#F16304]/15 text-[#F48B45]",
      title: t("marketing.home.features.device.title"),
      desc: t("marketing.home.features.device.desc"),
    },
    {
      icon: <QrCode className="size-6" />,
      iconClass: "border-emerald-400/35 bg-emerald-400/15 text-emerald-300",
      title: t("marketing.home.features.vouchers.title"),
      desc: t("marketing.home.features.vouchers.desc"),
    },
    {
      icon: <Users className="size-6" />,
      iconClass: "border-[#F16304]/35 bg-[#F16304]/15 text-[#F48B45]",
      title: t("marketing.home.features.agents.title"),
      desc: t("marketing.home.features.agents.desc"),
    },
    {
      icon: <BarChart3 className="size-6" />,
      iconClass: "border-[#03ac77]/35 bg-[#03ac77]/15 text-[#03ac77]",
      title: t("marketing.home.features.reports.title"),
      desc: t("marketing.home.features.reports.desc"),
    },
  ];

  // Live catalog from Admin — see `fetchPublicPlans`. The landing page shows the
  // same published plans as /pricing so the two pages cannot quote different
  // prices, and a repricing in the dashboard reaches both without a deploy.
  const plans = orderPlansForDisplay(await fetchPublicPlans());
  const popularId = popularPlanId(plans);

  const testimonials = [
    { quote: t("marketing.home.testimonials.1.quote"), name: "Juma Mwakyusa", role: t("marketing.home.testimonials.1.role"), initials: "JM" },
    { quote: t("marketing.home.testimonials.2.quote"), name: "Fatma Al-Haddad", role: t("marketing.home.testimonials.2.role"), initials: "FA" },
    { quote: t("marketing.home.testimonials.3.quote"), name: "Emmanuel Massawe", role: t("marketing.home.testimonials.3.role"), initials: "EM" },
  ];

  const trustPoints = [t("marketing.home.trust.setup"), t("marketing.home.trust.noCard"), t("marketing.home.trust.mobilePay")];

  return (
    <div className="w-full">
      {/* ═══════════════════════════════════════════════════════════════════
          HERO — copy on the left, the live captive portal on the right
      ═══════════════════════════════════════════════════════════════════ */}
      <section className="relative w-full overflow-hidden bg-advo-charcoal text-white">
        {/* Faint technical grid */}
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
        {/* Warm gold wash. The field stays charcoal — the reference hero has no blue bloom. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 left-1/2 h-[32rem] w-[40rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(251,161,2,0.14),transparent_68%)] blur-3xl"
        />

        <Container className="relative z-10 pt-14 pb-16 sm:pt-20 sm:pb-20 lg:pt-24 lg:pb-24">
          <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-12 lg:gap-10 xl:gap-16">
            {/* ── Hero copy ─────────────────────────────────────────────── */}
            <div className="lg:col-span-6">
              <Eyebrow tone="dark">{t("marketing.home.hero.badge")}</Eyebrow>

              <h1 className="mt-6 text-[2.35rem] leading-[1.05] font-black tracking-tight text-balance sm:text-5xl lg:text-[3.3rem]">
                {t("marketing.home.hero.titleLead")}{" "}
                <span className={GOLD_TEXT}>{t("marketing.home.hero.titleAccent")}</span>{" "}
                {t("marketing.home.hero.titleTrail")}
              </h1>

              <p className="mt-6 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">
                {t("marketing.home.hero.subLead")}{" "}
                <strong className="font-semibold text-white">{t("marketing.home.hero.subOmada")}</strong>{" "}
                {t("marketing.home.hero.subMid")}{" "}
                <strong className="font-semibold text-white">{t("marketing.home.hero.subMomo")}</strong>{" "}
                {t("marketing.home.hero.subTrail")}
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <ButtonLink href="/register" size="lg" variant="gold" arrow className="w-full sm:w-auto">
                  {t("marketing.home.hero.ctaRegister")}
                </ButtonLink>
                <ButtonLink href="#how-it-works" size="lg" variant="onDark" className="w-full sm:w-auto">
                  {t("marketing.home.hero.ctaSecondary")}
                </ButtonLink>
              </div>

              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/65">
                {trustPoints.map((point) => (
                  <li key={point} className="inline-flex items-center gap-2">
                    <CheckCircle2 aria-hidden="true" className="size-4 text-[#03ac77]" />
                    {point}
                  </li>
                ))}
              </ul>

              {/* Social proof — stacked initials rather than stock photography. */}
              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-4 border-t border-white/10 pt-7">
                <ul className="flex items-center -space-x-2.5">
                  {AVATARS.map((avatar) => (
                    <li
                      key={avatar.initials}
                      className={cx(
                        "flex size-10 items-center justify-center rounded-full border-2 border-advo-charcoal text-[11px] font-bold text-white",
                        avatar.tone,
                      )}
                    >
                      {avatar.initials}
                    </li>
                  ))}
                  <li className="flex size-10 items-center justify-center rounded-full border-2 border-advo-charcoal bg-white/10 text-[10px] font-bold text-white/80">
                    +120
                  </li>
                </ul>
                <div>
                  <div className="flex items-center gap-1">
                    <span className="flex items-center gap-0.5" aria-hidden="true">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Star key={index} className="size-3.5 fill-advo-gold text-advo-gold" />
                      ))}
                    </span>
                    <span className="ml-1.5 text-sm font-bold text-white">
                      {t("marketing.home.hero.social.rating")}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-white/60">
                    <span className="font-semibold text-white/85">{t("marketing.home.hero.social.label")}</span> ·{" "}
                    {t("marketing.home.hero.social.reviews")}
                  </p>
                </div>
              </div>
            </div>

            {/* ── The product, playing the customer journey on a loop ───── */}
            <div className="lg:col-span-6">
              <HeroPhoneMockup />
            </div>
          </div>

          {/* Integrations strip */}
          <div className="mt-16 border-t border-white/10 pt-8">
            <p className="text-center text-[11px] font-bold tracking-[0.18em] text-white/45 uppercase">
              {t("marketing.home.integrations.label")}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
              {PAYMENT_BRANDS.map((brand) => (
                <span
                  key={brand}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80"
                >
                  <Wallet aria-hidden="true" className="size-3.5 text-[#FBA102]" />
                  {brand}
                </span>
              ))}
              <span className="inline-flex items-center gap-2 rounded-full border border-[#FBA102]/40 bg-[#FBA102]/15 px-4 py-2 text-sm font-semibold text-white">
                <Wifi aria-hidden="true" className="size-3.5 text-[#FBA102]" />
                TP-Link Omada SDN
              </span>
            </div>
          </div>
        </Container>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          TRUST METRICS
      ═══════════════════════════════════════════════════════════════════ */}
      <Section tone="dark" className="border-t border-[#FBA102]/20" aria-labelledby="stats-title">
        <SectionHeading
          tone="dark"
          eyebrow={t("marketing.home.stats.eyebrow")}
          title={t("marketing.home.stats.title")}
          titleId="stats-title"
        />
        <dl className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-[#16181b] p-6 sm:p-8">
              <div className={cx("font-mono text-3xl font-black tracking-tight tabular-nums sm:text-4xl", GOLD_TEXT)}>
                {stat.value}
              </div>
              <p className="mt-2 text-sm leading-snug text-white/65">{stat.label}</p>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="solutions" tone="raised" aria-labelledby="solutions-title">
        <SectionHeading
          tone="dark"
          eyebrow={t("marketing.home.solutions.badge")}
          title={t("marketing.home.solutions.title")}
          lead={t("marketing.home.solutions.subtitle")}
          titleId="solutions-title"
        />
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {solutions.map((solution) => (
            <Card key={solution.title} tone="dark" interactive className="flex h-full flex-col p-7">
              <span className="grid size-12 place-items-center rounded-2xl border border-[#FBA102]/30 bg-[#FBA102]/10 text-[#FBA102]">
                {solution.icon}
              </span>
              <h3 className="mt-5 text-lg font-bold text-white">{solution.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-white/65">{solution.desc}</p>
              <ul className="mt-5 space-y-2 border-t border-white/10 pt-5">
                {solution.points.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-sm font-medium text-white/90">
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[#03ac77]" />
                    {point}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
        <div className="mt-10 flex justify-center">
          <ButtonLink href="/features" variant="onDark" arrow>
            {t("marketing.nav.features")}
          </ButtonLink>
        </div>
      </Section>

      <Section id="how-it-works" tone="dark" aria-labelledby="how-title">
        <SectionHeading
          tone="dark"
          eyebrow={t("marketing.home.how.badge")}
          title={t("marketing.home.how.title")}
          lead={t("marketing.home.how.subtitle")}
          titleId="how-title"
        />
        <ol className="relative mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li key={step.title}>
              <Card tone="dark" interactive className="flex h-full flex-col p-6">
                <span
                  className="flex size-11 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#FBA102,#F16304)] font-mono text-lg font-black text-[#111213]"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <h3 className="mt-4 text-base font-bold text-white">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/65">{step.desc}</p>
              </Card>
            </li>
          ))}
        </ol>
        <div className="mt-10 flex justify-center">
          <ButtonLink href="/register" size="lg" arrow>
            {t("marketing.home.how.cta")}
          </ButtonLink>
        </div>
      </Section>

      <Section id="calculator" tone="raised">
        <InteractiveRevenueCalculator />
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
          FEATURES DEEP DIVE
      ═══════════════════════════════════════════════════════════════════ */}
      <Section id="features" tone="dark" aria-labelledby="features-title">
        <SectionHeading
          tone="dark"
          eyebrowTone="dark"
          eyebrow={t("marketing.home.features.badge")}
          title={t("marketing.home.features.title")}
          lead={t("marketing.home.features.subtitle")}
          titleId="features-title"
        />
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title} tone="dark" interactive className="flex h-full flex-col p-7">
              <span
                aria-hidden="true"
                className={cx("flex size-12 items-center justify-center rounded-xl border", feature.iconClass)}
              >
                {feature.icon}
              </span>
              <h3 className="mt-5 text-lg font-bold text-white">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/70">{feature.desc}</p>
            </Card>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
          <ButtonLink href="/features" variant="gold" arrow>
            {t("marketing.nav.features")}
          </ButtonLink>
          <ButtonLink href="/register" variant="onDark">
            {t("marketing.home.cta.register")}
          </ButtonLink>
        </div>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
          PRICING PREVIEW
      ═══════════════════════════════════════════════════════════════════ */}
      <Section id="pricing" tone="raised" aria-labelledby="pricing-title">
        <SectionHeading
          tone="dark"
          eyebrow={t("marketing.home.pricing.badge")}
          title={t("marketing.home.pricing.title")}
          lead={t("marketing.home.pricing.subtitle")}
          titleId="pricing-title"
        />
        {plans.length > 0 ? (
          <div className="mt-12">
            <PlanCardGrid
              dark
              plans={plans}
              t={t}
              popularId={popularId}
              ctaForPlan={(plan) => ({ href: `/register?plan=${encodeURIComponent(plan.code)}` })}
            />
          </div>
        ) : (
          <div className="mx-auto mt-12 max-w-xl rounded-card border border-white/10 bg-white/[0.04] p-8 text-center">
            <p className="text-sm text-white/65">{t("marketing.plans.empty")}</p>
            <div className="mt-5 flex justify-center">
              <ButtonLink href="/contact" variant="primary" arrow>
                {t("marketing.plans.contact")}
              </ButtonLink>
            </div>
          </div>
        )}
        <div className="mt-10 flex justify-center">
          <ButtonLink href="/pricing" variant="onDark" arrow>
            {t("marketing.home.pricing.compare")}
          </ButtonLink>
        </div>
      </Section>

      <Section tone="dark" aria-labelledby="testimonials-title">
        <SectionHeading
          tone="dark"
          eyebrow={t("marketing.home.testimonials.badge")}
          title={t("marketing.home.testimonials.title")}
          lead={t("marketing.home.testimonials.subtitle")}
          titleId="testimonials-title"
        />
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {testimonials.map((testimonial) => (
            <Card key={testimonial.name} tone="dark" className="flex h-full flex-col p-7">
              <div className="flex items-center gap-1" aria-hidden="true">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Star key={index} className="size-4 fill-advo-gold text-advo-gold" />
                ))}
              </div>
              <blockquote className="mt-5 flex-1 text-sm leading-relaxed text-white/85">
                &ldquo;{testimonial.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-6 flex items-center gap-3 border-t border-white/10 pt-5">
                <span
                  aria-hidden="true"
                  className="flex size-10 items-center justify-center rounded-full bg-[linear-gradient(135deg,#FBA102,#F16304)] text-sm font-bold text-[#111213]"
                >
                  {testimonial.initials}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-white">{testimonial.name}</span>
                  <span className="block text-xs text-white/55">{testimonial.role}</span>
                </span>
              </figcaption>
            </Card>
          ))}
        </div>
      </Section>

      <Section tone="raised">
        <FaqSection />
      </Section>

      <section className="relative w-full overflow-hidden border-t border-[#FBA102]/20 bg-advo-charcoal py-20 text-white sm:py-24 lg:py-28">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 left-1/2 h-[24rem] w-[42rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(251,161,2,0.28),rgba(241,99,4,0.18)_42%,transparent_72%)] blur-3xl"
        />
        <Container className="relative z-10">
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow tone="dark">{t("marketing.home.cta.badge")}</Eyebrow>
            <h2 className="mt-6 text-3xl font-black tracking-tight text-balance text-white sm:text-4xl lg:text-[2.75rem]">
              {t("marketing.home.cta.title")}
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/75 sm:text-lg">
              {t("marketing.home.cta.body")}
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ButtonLink href="/register" size="lg" variant="gold" arrow className="w-full sm:w-auto">
                {t("marketing.home.cta.register")}
              </ButtonLink>
              <ButtonLink href="/contact" size="lg" variant="onDark" className="w-full sm:w-auto">
                {t("marketing.home.cta.contact")}
              </ButtonLink>
            </div>
          </div>
        </Container>
      </section>
    </div>
  );
}
