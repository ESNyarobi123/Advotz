import { prisma, type ListingKind, type PromotionRequestState } from "@advo/db";
import type { PlatformListingInput } from "@advo/contracts";
import { notFound } from "../../common/errors.js";

/**
 * Jobs & opportunities shown on the guest "connected" page.
 *
 * This is a platform-level feed managed by Admin (it reads as a shared
 * recruitment-partner list), so it is not scoped to a single reseller.
 */

export async function listPlatformListings(kind?: ListingKind) {
  return prisma.platformListing.findMany({
    where: kind ? { kind } : undefined,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
}

export async function createPlatformListing(input: PlatformListingInput) {
  return prisma.platformListing.create({ data: input });
}

export async function updatePlatformListing(id: string, input: PlatformListingInput) {
  const existing = await prisma.platformListing.findUnique({ where: { id } });
  if (!existing) notFound("Listing not found");
  return prisma.platformListing.update({ where: { id }, data: input });
}

export async function deletePlatformListing(id: string) {
  const existing = await prisma.platformListing.findUnique({ where: { id } });
  if (!existing) notFound("Listing not found");
  await prisma.platformListing.delete({ where: { id } });
  return { ok: true };
}

/**
 * Banner-promotion requests submitted from a reseller's guest portal.
 * Reseller-scoped so a reseller only ever sees their own leads.
 */
export async function listPromotionRequests(resellerId: string, state?: PromotionRequestState) {
  return prisma.promotionRequest.findMany({
    where: { resellerId, ...(state ? { state } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function updatePromotionRequestState(resellerId: string, id: string, state: PromotionRequestState) {
  const existing = await prisma.promotionRequest.findFirst({ where: { id, resellerId } });
  if (!existing) notFound("Promotion request not found");
  return prisma.promotionRequest.update({ where: { id }, data: { state } });
}
