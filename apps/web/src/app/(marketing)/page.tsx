import {
  Wifi,
  ShieldCheck,
  Zap,
  CheckCircle2,
  Lock,
  Layers,
  Users,
  BarChart3,
  Coffee,
  Building2,
  GraduationCap,
  Radio,
  QrCode,
  TrendingUp,
  Star,
  Wallet,
} from "lucide-react";
import { SoftIcon } from "@advo/ui";
import { InteractivePortalSimulator } from "@/features/marketing/InteractivePortalSimulator";
import { InteractiveRevenueCalculator } from "@/features/marketing/InteractiveRevenueCalculator";
import { FaqSection } from "@/features/marketing/FaqSection";
import { getServerI18n } from "@/lib/i18n.server";
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

const STEP_BADGES = [
  "bg-advo-blue-soft text-advo-blue",
  "bg-advo-gold-soft text-[#b15f00]",
  "bg-advo-violet-soft text-advo-violet",
  "bg-advo-teal-soft text-advo-teal",
];

export default async function MarketingHomePage() {
  const { t } = await getServerI18n();

  const stats = [
    { icon: <Zap className="size-5" />, tone: "accent" as const, value: `< ${t("marketing.home.stats.speedValue")}`, label: t("marketing.home.stats.speedLabel") },
    { icon: <ShieldCheck className="size-5" />, tone: "success" as const, value: "99.98%", label: t("marketing.home.stats.uptimeLabel") },
    { icon: <Lock className="size-5" />, tone: "gold" as const, value: "100%", label: t("marketing.home.stats.ledgerLabel") },
    { icon: <TrendingUp className="size-5" />, tone: "violet" as const, value: "0%", label: t("marketing.home.stats.lossLabel") },
  ];

  const solutions = [
    {
      icon: <Coffee className="size-6" />,
      tone: "accent" as const,
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
      tone: "violet" as const,
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
      iconClass: "border-[#1B5EA4]/35 bg-[#1B5EA4]/15 text-[#7FB4E6]",
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
      iconClass: "border-[#8B7BE8]/35 bg-[#8B7BE8]/15 text-[#B3A6F2]",
      title: t("marketing.home.features.agents.title"),
      desc: t("marketing.home.features.agents.desc"),
    },
    {
      icon: <BarChart3 className="size-6" />,
      iconClass: "border-cyan-400/35 bg-cyan-400/15 text-cyan-300",
      title: t("marketing.home.features.reports.title"),
      desc: t("marketing.home.features.reports.desc"),
    },
  ];

  const plans = [
    {
      name: t("marketing.home.pricing.starter.name"),
      desc: t("marketing.home.pricing.starter.desc"),
      price: "TZS 25,000",
      features: [
        t("marketing.home.pricing.starter.feature1"),
        t("marketing.home.pricing.starter.feature2"),
        t("marketing.home.pricing.starter.feature3"),
        t("marketing.home.pricing.starter.feature4"),
        t("marketing.home.pricing.starter.feature5"),
      ],
      cta: t("marketing.home.pricing.starter.cta"),
      highlight: false,
    },
    {
      name: t("marketing.home.pricing.pro.name"),
      desc: t("marketing.home.pricing.pro.desc"),
      price: "TZS 50,000",
      features: [
        t("marketing.home.pricing.pro.feature1"),
        t("marketing.home.pricing.pro.feature2"),
        t("marketing.home.pricing.pro.feature3"),
        t("marketing.home.pricing.pro.feature4"),
        t("marketing.home.pricing.pro.feature5"),
      ],
      cta: t("marketing.home.pricing.pro.cta"),
      highlight: true,
    },
    {
      name: t("marketing.home.pricing.enterprise.name"),
      desc: t("marketing.home.pricing.enterprise.desc"),
      price: "TZS 120,000",
      features: [
        t("marketing.home.pricing.enterprise.feature1"),
        t("marketing.home.pricing.enterprise.feature2"),
        t("marketing.home.pricing.enterprise.feature3"),
        t("marketing.home.pricing.enterprise.feature4"),
        t("marketing.home.pricing.enterprise.feature5"),
      ],
      cta: t("marketing.home.pricing.enterprise.cta"),
      highlight: false,
    },
  ];

  const testimonials = [
    { quote: t("marketing.home.testimonials.1.quote"), name: "Juma Mwakyusa", role: t("marketing.home.testimonials.1.role"), initials: "JM" },
    { quote: t("marketing.home.testimonials.2.quote"), name: "Fatma Al-Haddad", role: t("marketing.home.testimonials.2.role"), initials: "FA" },
    { quote: t("marketing.home.testimonials.3.quote"), name: "Emmanuel Massawe", role: t("marketing.home.testimonials.3.role"), initials: "EM" },
  ];

  const trustPoints = [t("marketing.home.trust.setup"), t("marketing.home.trust.noCard"), t("marketing.home.trust.mobilePay")];

  return (
    <div className="w-full">
      {/* ═══════════════════════════════════════════════════════════════════
          HERO + LIVE DEMO — one cohesive dark band
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
        {/* Brand glows */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-48 left-1/2 h-[38rem] w-[38rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(27,94,164,0.5),transparent_70%)] blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/4 -right-40 h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,rgba(251,161,2,0.3),transparent_70%)] blur-3xl"
        />

        <Container className="relative z-10 pt-16 pb-20 sm:pt-20 sm:pb-24 lg:pt-24">
          <div className="mx-auto max-w-4xl text-center">
            <Eyebrow tone="dark">{t("marketing.home.hero.badge")}</Eyebrow>

            <h1 className="mt-6 text-4xl font-black tracking-tight text-balance sm:text-5xl lg:text-6xl">
              {t("marketing.home.hero.titleLead")}{" "}
              <span className={GOLD_TEXT}>{t("marketing.home.hero.titleAccent")}</span>{" "}
              {t("marketing.home.hero.titleTrail")}
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-white/75 sm:text-lg">
              {t("marketing.home.hero.subLead")}{" "}
              <strong className="font-semibold text-white">{t("marketing.home.hero.subOmada")}</strong>{" "}
              {t("marketing.home.hero.subMid")}{" "}
              <strong className="font-semibold text-white">{t("marketing.home.hero.subMomo")}</strong>{" "}
              {t("marketing.home.hero.subTrail")}
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ButtonLink href="/register" size="lg" variant="gold" arrow className="w-full sm:w-auto">
                {t("marketing.home.hero.ctaRegister")}
              </ButtonLink>
              <ButtonLink href="#demo" size="lg" variant="onDark" className="w-full sm:w-auto">
                {t("marketing.home.hero.ctaSimulator")}
              </ButtonLink>
            </div>

            <ul className="mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-white/65">
              {trustPoints.map((point) => (
                <li key={point} className="inline-flex items-center gap-2">
                  <CheckCircle2 aria-hidden="true" className="size-4 text-emerald-400" />
                  {point}
                </li>
              ))}
            </ul>

            <p className="mt-6 text-xs font-medium tracking-wide text-white/45">
              {t("marketing.home.hero.proof")}
            </p>
          </div>

          {/* Integrations strip */}
          <div className="mt-14 border-t border-white/10 pt-8">
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
              <span className="inline-flex items-center gap-2 rounded-full border border-[#1B5EA4]/40 bg-[#1B5EA4]/15 px-4 py-2 text-sm font-semibold text-white">
                <Wifi aria-hidden="true" className="size-3.5 text-[#7FB4E6]" />
                TP-Link Omada SDN
              </span>
            </div>
          </div>

          {/* Live interactive demo */}
          <div id="demo" className="mt-20 scroll-mt-24">
            <SectionHeading
              tone="dark"
              eyebrow={t("marketing.home.demo.eyebrow")}
              title={t("marketing.home.demo.title")}
              lead={t("marketing.home.demo.lead")}
            />
            <div className="mt-12">
              <InteractivePortalSimulator />
            </div>
          </div>
        </Container>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          TRUST METRICS
      ═══════════════════════════════════════════════════════════════════ */}
      <Section tone="soft" aria-labelledby="stats-title">
        <SectionHeading
          eyebrow={t("marketing.home.stats.eyebrow")}
          title={t("marketing.home.stats.title")}
          titleId="stats-title"
        />
        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label} interactive className="flex items-start gap-4 p-6">
              <SoftIcon tone={stat.tone} size="lg">
                {stat.icon}
              </SoftIcon>
              <div className="min-w-0">
                <div className="font-mono text-2xl font-black tracking-tight text-advo-text tabular-nums">
                  {stat.value}
                </div>
                <p className="mt-1 text-sm leading-snug text-advo-muted">{stat.label}</p>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
          SOLUTIONS
      ═══════════════════════════════════════════════════════════════════ */}
      <Section id="solutions" tone="light" aria-labelledby="solutions-title">
        <SectionHeading
          eyebrow={t("marketing.home.solutions.badge")}
          title={t("marketing.home.solutions.title")}
          lead={t("marketing.home.solutions.subtitle")}
          titleId="solutions-title"
        />
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {solutions.map((solution) => (
            <Card key={solution.title} interactive className="flex h-full flex-col p-7">
              <SoftIcon tone={solution.tone} size="lg">
                {solution.icon}
              </SoftIcon>
              <h3 className="mt-5 text-lg font-bold text-advo-text">{solution.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-advo-muted">{solution.desc}</p>
              <ul className="mt-5 space-y-2 border-t border-advo-border pt-5">
                {solution.points.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-sm font-medium text-advo-text">
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-advo-gold" />
                    {point}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
        <div className="mt-10 flex justify-center">
          <ButtonLink href="/features" variant="outline" arrow>
            {t("marketing.nav.features")}
          </ButtonLink>
        </div>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
          HOW IT WORKS
      ═══════════════════════════════════════════════════════════════════ */}
      <Section id="how-it-works" tone="soft" aria-labelledby="how-title">
        <SectionHeading
          eyebrow={t("marketing.home.how.badge")}
          title={t("marketing.home.how.title")}
          lead={t("marketing.home.how.subtitle")}
          titleId="how-title"
        />
        <ol className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li key={step.title}>
              <Card interactive className="flex h-full flex-col p-6">
                <span
                  className={cx(
                    "flex size-11 items-center justify-center rounded-xl font-mono text-lg font-black",
                    STEP_BADGES[index] ?? STEP_BADGES[0],
                  )}
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <h3 className="mt-4 text-base font-bold text-advo-text">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-advo-muted">{step.desc}</p>
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

      {/* ═══════════════════════════════════════════════════════════════════
          REVENUE CALCULATOR
      ═══════════════════════════════════════════════════════════════════ */}
      <Section id="calculator" tone="light">
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
      <Section id="pricing" tone="soft" aria-labelledby="pricing-title">
        <SectionHeading
          eyebrowTone="gold"
          eyebrow={t("marketing.home.pricing.badge")}
          title={t("marketing.home.pricing.title")}
          lead={t("marketing.home.pricing.subtitle")}
          titleId="pricing-title"
        />
        <div className="mt-12 grid grid-cols-1 items-stretch gap-6 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={cx(
                "relative flex h-full flex-col p-8",
                plan.highlight && "border-advo-blue/60 shadow-[0_24px_48px_-24px_rgba(27,94,164,0.5)] lg:-translate-y-3",
              )}
            >
              {plan.highlight ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[linear-gradient(135deg,#fba102_0%,#f16304_100%)] px-3.5 py-1 text-[10px] font-black tracking-wider text-advo-charcoal uppercase shadow-md">
                  {t("marketing.home.pricing.pro.popular")}
                </span>
              ) : null}

              <h3 className="text-xl font-bold text-advo-text">{plan.name}</h3>
              <p className="mt-1 min-h-10 text-sm text-advo-muted">{plan.desc}</p>

              <div className="mt-6 flex items-baseline gap-2">
                <span className="font-mono text-3xl font-black tracking-tight text-advo-text">{plan.price}</span>
                <span className="text-sm font-medium text-advo-muted">/ {t("marketing.home.pricing.period")}</span>
              </div>

              <ul className="mt-6 flex-1 space-y-3 border-t border-advo-border pt-6">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm text-advo-text">
                    <CheckCircle2
                      aria-hidden="true"
                      className={cx("mt-0.5 size-4 shrink-0", plan.highlight ? "text-advo-gold" : "text-advo-blue")}
                    />
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                <ButtonLink
                  href="/register"
                  variant={plan.highlight ? "primary" : "outline"}
                  size="lg"
                  arrow
                  className="w-full"
                >
                  {plan.cta}
                </ButtonLink>
              </div>
            </Card>
          ))}
        </div>
        <div className="mt-10 flex justify-center">
          <ButtonLink href="/pricing" variant="outline" arrow>
            {t("marketing.home.pricing.compare")}
          </ButtonLink>
        </div>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
          TESTIMONIALS
      ═══════════════════════════════════════════════════════════════════ */}
      <Section tone="light" aria-labelledby="testimonials-title">
        <SectionHeading
          eyebrow={t("marketing.home.testimonials.badge")}
          title={t("marketing.home.testimonials.title")}
          lead={t("marketing.home.testimonials.subtitle")}
          titleId="testimonials-title"
        />
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {testimonials.map((testimonial) => (
            <Card key={testimonial.name} className="flex h-full flex-col p-7">
              <div className="flex items-center gap-1" aria-hidden="true">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Star key={index} className="size-4 fill-advo-gold text-advo-gold" />
                ))}
              </div>
              <blockquote className="mt-5 flex-1 text-sm leading-relaxed text-advo-text">
                &ldquo;{testimonial.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-6 flex items-center gap-3 border-t border-advo-border pt-5">
                <span
                  aria-hidden="true"
                  className="flex size-10 items-center justify-center rounded-full bg-advo-blue-soft text-sm font-bold text-advo-blue"
                >
                  {testimonial.initials}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-advo-text">{testimonial.name}</span>
                  <span className="block text-xs text-advo-muted">{testimonial.role}</span>
                </span>
              </figcaption>
            </Card>
          ))}
        </div>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
          FAQ
      ═══════════════════════════════════════════════════════════════════ */}
      <Section tone="soft">
        <FaqSection />
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
          CLOSING CTA
      ═══════════════════════════════════════════════════════════════════ */}
      <section className="relative w-full overflow-hidden bg-advo-charcoal py-20 text-white sm:py-24 lg:py-28">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 left-1/2 h-[24rem] w-[42rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(241,99,4,0.35),rgba(27,94,164,0.35)_45%,transparent_75%)] blur-3xl"
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
