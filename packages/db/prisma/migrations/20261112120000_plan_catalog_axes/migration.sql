-- The subscription catalog is sold on two axes: a capacity tier (Starter, Growth,
-- Business Pro, Enterprise) and a commercial type (Advo Partner or Independent).
-- Both are optional so plans that predate the matrix keep working unchanged.

CREATE TYPE "PlanType" AS ENUM ('PARTNER', 'INDEPENDENT');

ALTER TABLE "PlatformPlan"
    ADD COLUMN "tierKey" TEXT,
    ADD COLUMN "planType" "PlanType",
    ADD COLUMN "priceFrom" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "PlatformPlan_tierKey_planType_idx" ON "PlatformPlan" ("tierKey", "planType");
