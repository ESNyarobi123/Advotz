-- Link a curated marketing hotspot to the site it actually operates.
--
-- A hotspot used to be pure marketing copy with a free-text `portalSlug`. The
-- performance screen needs real paid orders, and those are recorded against a
-- `Site`, so the hotspot now carries a real foreign key. Nullable on purpose:
-- curated entries that are not AdvoWiFi-run locations keep working unchanged.
--
-- ON DELETE SET NULL: removing the site must not delete the marketing pin.

-- AlterTable
ALTER TABLE "PublicHotspot" ADD COLUMN "siteId" UUID;

-- CreateIndex
CREATE INDEX "PublicHotspot_siteId_idx" ON "PublicHotspot"("siteId");

-- AddForeignKey
ALTER TABLE "PublicHotspot" ADD CONSTRAINT "PublicHotspot_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill from the existing free-text deep link so the curated rows that were
-- already pointing at a portal keep their performance data after the upgrade.
UPDATE "PublicHotspot" AS h
SET "siteId" = s."id"
FROM "Site" AS s
WHERE h."portalSlug" IS NOT NULL
  AND h."siteId" IS NULL
  AND s."slug" = h."portalSlug";
