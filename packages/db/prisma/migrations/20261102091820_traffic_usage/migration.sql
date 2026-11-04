-- CreateEnum
CREATE TYPE "UsageSource" AS ENUM ('CONTROLLER', 'ESTIMATED');

-- AlterTable
ALTER TABLE "AccessGrantDevice" ADD COLUMN     "usageBytesIn" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "usageBytesOut" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "usageCheckedAt" TIMESTAMP(3),
ADD COLUMN     "usageCounterTotal" BIGINT,
ADD COLUMN     "usageSource" "UsageSource";

-- CreateTable
CREATE TABLE "TrafficUsageSample" (
    "id" UUID NOT NULL,
    "resellerId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "customerId" UUID,
    "grantId" UUID NOT NULL,
    "grantDeviceId" UUID NOT NULL,
    "clientMac" TEXT NOT NULL,
    "bucketStart" TIMESTAMP(3) NOT NULL,
    "bytesIn" BIGINT NOT NULL DEFAULT 0,
    "bytesOut" BIGINT NOT NULL DEFAULT 0,
    "controllerBytes" BIGINT NOT NULL DEFAULT 0,
    "estimatedBytes" BIGINT NOT NULL DEFAULT 0,
    "lastSampledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrafficUsageSample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrafficUsageSample_resellerId_bucketStart_idx" ON "TrafficUsageSample"("resellerId", "bucketStart");

-- CreateIndex
CREATE INDEX "TrafficUsageSample_siteId_bucketStart_idx" ON "TrafficUsageSample"("siteId", "bucketStart");

-- CreateIndex
CREATE INDEX "TrafficUsageSample_customerId_bucketStart_idx" ON "TrafficUsageSample"("customerId", "bucketStart");

-- CreateIndex
CREATE INDEX "TrafficUsageSample_clientMac_bucketStart_idx" ON "TrafficUsageSample"("clientMac", "bucketStart");

-- CreateIndex
CREATE UNIQUE INDEX "TrafficUsageSample_grantDeviceId_bucketStart_key" ON "TrafficUsageSample"("grantDeviceId", "bucketStart");
