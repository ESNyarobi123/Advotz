import { getServerI18n } from "@/lib/i18n.server";
import { fetchPublicHotspots } from "@/lib/public-hotspots";
import { HotspotsExplorer } from "@/features/marketing/HotspotsExplorer";
import { Section, SectionHeading } from "@/features/marketing/ui";

/**
 * Public "Our Hotspots" directory — curated by Admin, plotted on an OSM map.
 */
export default async function HotspotsPage() {
  const { t } = await getServerI18n();
  const hotspots = await fetchPublicHotspots();

  return (
    <Section tone="dark" aria-labelledby="hotspots-page-title" className="overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(251,161,2,0.12),_transparent_55%)]"
      />
      <SectionHeading
        tone="dark"
        eyebrow={t("marketing.hotspots.badge")}
        title={t("marketing.hotspots.title")}
        lead={t("marketing.hotspots.subtitle")}
        titleId="hotspots-page-title"
      />
      <div className="relative mt-10">
        <HotspotsExplorer hotspots={hotspots} />
      </div>
    </Section>
  );
}
