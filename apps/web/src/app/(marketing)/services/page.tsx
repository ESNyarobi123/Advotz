import { getServerI18n } from "@/lib/i18n.server";
import { ServicesCatalog } from "@/features/marketing/ServicesCatalog";
import { Section, SectionHeading } from "@/features/marketing/ui";

/**
 * Public marketing page for guest WiFi Explore services.
 * Mirrors the Explore menu guests see after connecting on the captive portal.
 */
export default async function ServicesPage() {
  const { t } = await getServerI18n();

  return (
    <Section tone="dark" aria-labelledby="services-page-title" className="overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.12),_transparent_55%)]"
      />
      <SectionHeading
        tone="dark"
        eyebrow={t("marketing.services.badge")}
        title={t("marketing.services.title")}
        lead={t("marketing.services.subtitle")}
        titleId="services-page-title"
      />
      <div className="relative mt-10">
        <ServicesCatalog />
      </div>
    </Section>
  );
}
