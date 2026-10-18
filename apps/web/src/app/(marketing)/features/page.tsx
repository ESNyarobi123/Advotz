import {
  ArrowRight,
  Layers,
  QrCode,
  Radio,
  ShieldCheck,
  Smartphone,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { MessageKey } from "@advo/i18n";
import { getServerI18n } from "@/lib/i18n.server";
import { ButtonLink, Section, SectionHeading } from "@/features/marketing/ui";

type FeatureBlock = {
  id?: string;
  icon: LucideIcon;
  accent: string;
  titleKey: MessageKey;
  descKey: MessageKey;
  bullets: [MessageKey, MessageKey, MessageKey];
};

const FEATURES: FeatureBlock[] = [
  {
    id: "captive-portal",
    icon: Smartphone,
    accent: "#FBA102",
    titleKey: "marketing.features.portal.title",
    descKey: "marketing.features.portal.desc",
    bullets: [
      "marketing.features.portal.feature1",
      "marketing.features.portal.feature2",
      "marketing.features.portal.feature3",
    ],
  },
  {
    id: "omada-integration",
    icon: Radio,
    accent: "#F16304",
    titleKey: "marketing.features.omada.title",
    descKey: "marketing.features.omada.desc",
    bullets: [
      "marketing.features.omada.feature1",
      "marketing.features.omada.feature2",
      "marketing.features.omada.feature3",
    ],
  },
  {
    id: "vouchers",
    icon: QrCode,
    accent: "#FBA102",
    titleKey: "marketing.features.vouchers.title",
    descKey: "marketing.features.vouchers.desc",
    bullets: [
      "marketing.features.vouchers.feature1",
      "marketing.features.vouchers.feature2",
      "marketing.features.vouchers.feature3",
    ],
  },
  {
    id: "ledger",
    icon: ShieldCheck,
    accent: "#34D399",
    titleKey: "marketing.features.ledger.title",
    descKey: "marketing.features.ledger.desc",
    bullets: [
      "marketing.features.ledger.feature1",
      "marketing.features.ledger.feature2",
      "marketing.features.ledger.feature3",
    ],
  },
  {
    icon: Layers,
    accent: "#F16304",
    titleKey: "marketing.features.devices.title",
    descKey: "marketing.features.devices.desc",
    bullets: [
      "marketing.features.devices.feature1",
      "marketing.features.devices.feature2",
      "marketing.features.devices.feature3",
    ],
  },
  {
    id: "agents",
    icon: Users,
    accent: "#FBA102",
    titleKey: "marketing.features.agents.title",
    descKey: "marketing.features.agents.desc",
    bullets: [
      "marketing.features.agents.feature1",
      "marketing.features.agents.feature2",
      "marketing.features.agents.feature3",
    ],
  },
];

export default async function FeaturesPage() {
  const { t } = await getServerI18n();

  return (
    <Section tone="dark" aria-labelledby="features-page-title" className="overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(251,161,2,0.12),_transparent_55%)]"
      />

      <SectionHeading
        tone="dark"
        eyebrow={t("marketing.features.badge")}
        title={t("marketing.features.title")}
        lead={t("marketing.features.subtitle")}
        titleId="features-page-title"
      />

      <div className="relative mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-5">
        {FEATURES.map((feature) => {
          const Icon = feature.icon;
          return (
            <article
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 sm:p-7"
              id={feature.id}
              key={feature.titleKey}
            >
              <span
                className="grid h-12 w-12 place-items-center rounded-2xl text-advo-charcoal"
                style={{ background: feature.accent }}
              >
                <Icon aria-hidden className="h-5 w-5" />
              </span>
              <h3 className="mt-5 text-lg font-black tracking-tight text-white">
                {t(feature.titleKey)}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-white/65">{t(feature.descKey)}</p>
              <ul className="mt-4 space-y-2">
                {feature.bullets.map((bullet) => (
                  <li className="flex items-start gap-2 text-xs text-white/80" key={bullet}>
                    <span
                      aria-hidden
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: feature.accent }}
                    />
                    <span>{t(bullet)}</span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>

      <div className="relative mt-14 rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-10 text-center sm:px-10">
        <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
          {t("marketing.features.cta.title")}
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-white/65">{t("marketing.features.cta.body")}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <ButtonLink href="/register" size="lg" variant="gold">
            {t("marketing.features.cta.register")}
            <ArrowRight className="h-4 w-4" />
          </ButtonLink>
          <ButtonLink href="/pricing" size="lg" variant="onDark">
            {t("marketing.features.cta.pricing")}
          </ButtonLink>
        </div>
      </div>
    </Section>
  );
}
