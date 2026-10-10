-- CreateEnum
CREATE TYPE "media_asset_kind" AS ENUM ('PORTAL_LOGO', 'CAMPAIGN_CREATIVE');

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "kind" "media_asset_kind" NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "originalBytes" INTEGER NOT NULL,
    "originalName" TEXT,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaAsset_kind_ownerType_ownerId_createdAt_idx" ON "MediaAsset"("kind", "ownerType", "ownerId", "createdAt");
