-- CreateEnum
CREATE TYPE "PlanLifecycle" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PlanVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "AdCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED');

-- AlterTable
ALTER TABLE "PlatformPlan" ADD COLUMN     "commercialPromise" TEXT NOT NULL DEFAULT 'standard',
ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "lifecycle" "PlanLifecycle" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "visibility" "PlanVisibility" NOT NULL DEFAULT 'PUBLIC',
ALTER COLUMN "maxSites" DROP NOT NULL,
ALTER COLUMN "maxDevices" DROP NOT NULL,
ALTER COLUMN "maxPackages" DROP NOT NULL;

-- CreateTable
CREATE TABLE "SitePortalPreference" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "branding" JSONB NOT NULL DEFAULT '{}',
    "packageStyle" TEXT,
    "packageOrder" JSONB NOT NULL DEFAULT '[]',
    "visibility" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitePortalPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCampaign" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AdCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "placements" TEXT[],
    "creative" JSONB NOT NULL,
    "targeting" JSONB NOT NULL DEFAULT '{}',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SitePortalPreference_siteId_key" ON "SitePortalPreference"("siteId");

-- CreateIndex
CREATE INDEX "AdCampaign_status_startsAt_endsAt_idx" ON "AdCampaign"("status", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "AdCampaign_placements_idx" ON "AdCampaign"("placements");

-- CreateIndex
CREATE INDEX "PlatformPlan_lifecycle_visibility_idx" ON "PlatformPlan"("lifecycle", "visibility");

-- AddForeignKey
ALTER TABLE "SitePortalPreference" ADD CONSTRAINT "SitePortalPreference_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
