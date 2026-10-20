-- Extend the guest Explore feed with local events and holidays.
ALTER TYPE "ListingKind" ADD VALUE IF NOT EXISTS 'LOCAL_EVENT';
ALTER TYPE "ListingKind" ADD VALUE IF NOT EXISTS 'HOLIDAY';

-- CreateEnum
CREATE TYPE "ListingSource" AS ENUM ('MANUAL', 'AI');
CREATE TYPE "ListingAiRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');
CREATE TYPE "ListingAiTrigger" AS ENUM ('SCHEDULE', 'MANUAL');

-- AlterTable
ALTER TABLE "PlatformListing"
    ADD COLUMN "venue" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "region" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "link" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "contactPhone" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "priceLabel" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "imageUrl" TEXT,
    ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "startsAt" TIMESTAMP(3),
    ADD COLUMN "endsAt" TIMESTAMP(3),
    ADD COLUMN "publishedAt" TIMESTAMP(3),
    ADD COLUMN "source" "ListingSource" NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN "sourceUrl" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "aiModel" TEXT,
    ADD COLUMN "aiRunId" UUID,
    ADD COLUMN "dedupeKey" TEXT;

-- CreateIndex
CREATE INDEX "PlatformListing_source_createdAt_idx" ON "PlatformListing"("source", "createdAt");
CREATE INDEX "PlatformListing_active_publishedAt_idx" ON "PlatformListing"("active", "publishedAt");
CREATE UNIQUE INDEX "PlatformListing_dedupeKey_key" ON "PlatformListing"("dedupeKey");

-- CreateTable
CREATE TABLE "ListingAiRun" (
    "id" UUID NOT NULL,
    "trigger" "ListingAiTrigger" NOT NULL DEFAULT 'SCHEDULE',
    "status" "ListingAiRunStatus" NOT NULL DEFAULT 'RUNNING',
    "model" TEXT NOT NULL DEFAULT '',
    "analysedCount" INTEGER NOT NULL DEFAULT 0,
    "postedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "detail" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingAiRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListingAiRun_startedAt_idx" ON "ListingAiRun"("startedAt");
CREATE INDEX "ListingAiRun_status_startedAt_idx" ON "ListingAiRun"("status", "startedAt");
