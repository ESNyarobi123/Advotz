"use client";

import {
  Briefcase,
  Globe2,
  HelpCircle,
  MapPin,
  Megaphone,
  Palmtree,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import type { MessageKey } from "@advo/i18n";
import { useI18n } from "@/lib/i18n";

type ServiceDef = {
  id: string;
  icon: LucideIcon;
  titleKey: MessageKey;
  bodyKey: MessageKey;
  accent: string;
};

/** Same Explore menu guests see after connecting on the WiFi portal. */
const EXPLORE_SERVICES: ServiceDef[] = [
  {
    id: "businesses",
    icon: MapPin,
    titleKey: "marketing.services.items.businesses.title",
    bodyKey: "marketing.services.items.businesses.body",
    accent: "#FBA102",
  },
  {
    id: "advotz",
    icon: Globe2,
    titleKey: "marketing.services.items.advotz.title",
    bodyKey: "marketing.services.items.advotz.body",
    accent: "#3B82F6",
  },
  {
    id: "events",
    icon: Ticket,
    titleKey: "marketing.services.items.events.title",
    bodyKey: "marketing.services.items.events.body",
    accent: "#A855F7",
  },
  {
    id: "holidays",
    icon: Palmtree,
    titleKey: "marketing.services.items.holidays.title",
    bodyKey: "marketing.services.items.holidays.body",
    accent: "#10B981",
  },
  {
    id: "jobs",
    icon: Briefcase,
    titleKey: "marketing.services.items.jobs.title",
    bodyKey: "marketing.services.items.jobs.body",
    accent: "#F59E0B",
  },
  {
    id: "promote",
    icon: Megaphone,
    titleKey: "marketing.services.items.promote.title",
    bodyKey: "marketing.services.items.promote.body",
    accent: "#EF4444",
  },
  {
    id: "help",
    icon: HelpCircle,
    titleKey: "marketing.services.items.help.title",
    bodyKey: "marketing.services.items.help.body",
    accent: "#2563EB",
  },
];

type LocalSpot = {
  id: string;
  glyph: string;
  color: string;
  nameKey: MessageKey;
  categoryKey: MessageKey;
  bodyKey: MessageKey;
};

/** Default curated local spots shown under Local Businesses & Offers. */
const LOCAL_SPOTS: LocalSpot[] = [
  {
    id: "mpesa",
    glyph: "💳",
    color: "#059669",
    nameKey: "marketing.services.local.mpesa.name",
    categoryKey: "marketing.services.local.mpesa.category",
    bodyKey: "marketing.services.local.mpesa.body",
  },
  {
    id: "cafe",
    glyph: "☕",
    color: "#d97706",
    nameKey: "marketing.services.local.cafe.name",
    categoryKey: "marketing.services.local.cafe.category",
    bodyKey: "marketing.services.local.cafe.body",
  },
  {
    id: "phones",
    glyph: "📱",
    color: "#2563eb",
    nameKey: "marketing.services.local.phones.name",
    categoryKey: "marketing.services.local.phones.category",
    bodyKey: "marketing.services.local.phones.body",
  },
  {
    id: "pharmacy",
    glyph: "💊",
    color: "#e11d48",
    nameKey: "marketing.services.local.pharmacy.name",
    categoryKey: "marketing.services.local.pharmacy.category",
    bodyKey: "marketing.services.local.pharmacy.body",
  },
];

function ServiceRow({
  icon: Icon,
  accent,
  title,
  body,
}: {
  icon: LucideIcon;
  accent: string;
  title: string;
  body: string;
}) {
  return (
    <article className="flex gap-4 border-b border-white/10 py-6 last:border-b-0 sm:gap-5 sm:py-7">
      <span
        className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-advo-charcoal sm:h-14 sm:w-14"
        style={{ background: accent }}
      >
        <Icon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
      </span>
      <div className="min-w-0">
        <h3 className="text-lg font-black tracking-tight text-white sm:text-xl">{title}</h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/65 sm:text-[15px]">{body}</p>
      </div>
    </article>
  );
}

function LocalSpotTile({
  glyph,
  color,
  name,
  category,
  body,
}: {
  glyph: string;
  color: string;
  name: string;
  category: string;
  body: string;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xl text-white"
          style={{ background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 45%, #000))` }}
        >
          {glyph}
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-[0.14em] text-white/45 uppercase">{category}</p>
          <h4 className="mt-0.5 text-sm font-bold text-white">{name}</h4>
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-white/60 sm:text-sm">{body}</p>
    </article>
  );
}

function BlockHeading({ eyebrow, title, lead }: { eyebrow: string; title: string; lead: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-bold tracking-[0.16em] text-[#FBA102] uppercase">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">{title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-white/65 sm:text-base">{lead}</p>
    </div>
  );
}

export function ServicesCatalog() {
  const { t } = useI18n();

  return (
    <div className="space-y-14 sm:space-y-16">
      <section aria-labelledby="services-explore-heading">
        <BlockHeading
          eyebrow={t("marketing.services.explore.eyebrow")}
          title={t("marketing.services.explore.title")}
          lead={t("marketing.services.explore.lead")}
        />
        <div id="services-explore-heading" className="sr-only">
          {t("marketing.services.explore.title")}
        </div>
        <div className="mt-2">
          {EXPLORE_SERVICES.map((service) => (
            <ServiceRow
              accent={service.accent}
              body={t(service.bodyKey)}
              icon={service.icon}
              key={service.id}
              title={t(service.titleKey)}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="services-local-heading">
        <BlockHeading
          eyebrow={t("marketing.services.local.eyebrow")}
          title={t("marketing.services.local.title")}
          lead={t("marketing.services.local.lead")}
        />
        <div id="services-local-heading" className="sr-only">
          {t("marketing.services.local.title")}
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {LOCAL_SPOTS.map((spot) => (
            <LocalSpotTile
              body={t(spot.bodyKey)}
              category={t(spot.categoryKey)}
              color={spot.color}
              glyph={spot.glyph}
              key={spot.id}
              name={t(spot.nameKey)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
