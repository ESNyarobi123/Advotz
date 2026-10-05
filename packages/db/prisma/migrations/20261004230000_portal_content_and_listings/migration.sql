-- Portal content + platform listings + promotion requests.
-- Captive portal "connected" page extras: reseller-editable advert banner and
-- featured businesses (Site.portalContent, validated by portalContentSchema),
-- a platform-managed jobs/opportunities feed (PlatformListing), and banner
-- promotion requests submitted by local businesses (PromotionRequest).
ALTER TABLE "Site" ADD COLUMN "portalContent" JSONB;

CREATE TYPE "ListingKind" AS ENUM ('JOB', 'OPPORTUNITY');
CREATE TYPE "PromotionRequestState" AS ENUM ('NEW', 'CONTACTED', 'WON', 'DECLINED');

CREATE TABLE "PlatformListing" (
    "id" UUID NOT NULL,
    "kind" "ListingKind" NOT NULL,
    "title" TEXT NOT NULL,
    "organization" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "employmentType" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformListing_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformListing_kind_active_sortOrder_idx" ON "PlatformListing"("kind", "active", "sortOrder");

CREATE TABLE "PromotionRequest" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "resellerId" UUID NOT NULL,
    "packageCode" TEXT NOT NULL,
    "durationLabel" TEXT NOT NULL,
    "priceTzs" BIGINT NOT NULL,
    "fullName" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "email" TEXT,
    "business" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "offer" TEXT NOT NULL,
    "state" "PromotionRequestState" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromotionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PromotionRequest_siteId_state_createdAt_idx" ON "PromotionRequest"("siteId", "state", "createdAt");
CREATE INDEX "PromotionRequest_resellerId_createdAt_idx" ON "PromotionRequest"("resellerId", "createdAt");

ALTER TABLE "PromotionRequest" ADD CONSTRAINT "PromotionRequest_siteId_resellerId_fkey" FOREIGN KEY ("siteId", "resellerId") REFERENCES "Site"("id", "resellerId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromotionRequest" ADD CONSTRAINT "PromotionRequest_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
