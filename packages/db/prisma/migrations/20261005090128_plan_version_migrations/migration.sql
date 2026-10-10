-- CreateEnum
CREATE TYPE "PlanMigrationScope" AS ENUM ('NEW_ONLY', 'ON_RENEWAL', 'SELECTED', 'ALL');

-- CreateEnum
CREATE TYPE "PlanMigrationStatus" AS ENUM ('SCHEDULED', 'PARTIAL', 'APPLIED', 'CANCELLED');

-- CreateTable
CREATE TABLE "PlanMigrationTarget" (
    "id" UUID NOT NULL,
    "migrationId" UUID NOT NULL,
    "resellerId" UUID NOT NULL,
    "fromPlanId" UUID,
    "fromCode" TEXT,
    "fromVersion" INTEGER,
    "appliedAt" TIMESTAMP(3),
    "appliedByUserId" UUID,

    CONSTRAINT "PlanMigrationTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanMigration" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "scope" "PlanMigrationScope" NOT NULL,
    "status" "PlanMigrationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "PlanMigration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanMigrationTarget_migrationId_appliedAt_idx" ON "PlanMigrationTarget"("migrationId", "appliedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlanMigrationTarget_migrationId_resellerId_key" ON "PlanMigrationTarget"("migrationId", "resellerId");

-- CreateIndex
CREATE INDEX "PlanMigration_status_effectiveAt_idx" ON "PlanMigration"("status", "effectiveAt");

-- CreateIndex
CREATE INDEX "PlanMigration_planId_idx" ON "PlanMigration"("planId");

-- AddForeignKey
ALTER TABLE "PlanMigrationTarget" ADD CONSTRAINT "PlanMigrationTarget_migrationId_fkey" FOREIGN KEY ("migrationId") REFERENCES "PlanMigration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanMigrationTarget" ADD CONSTRAINT "PlanMigrationTarget_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanMigration" ADD CONSTRAINT "PlanMigration_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlatformPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
