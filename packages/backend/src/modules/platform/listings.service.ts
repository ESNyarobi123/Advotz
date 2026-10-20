import { prisma, type ListingKind, type ListingSource, type Prisma, type PromotionRequestState } from "@advo/db";
import type { PlatformListingInput } from "@advo/contracts";
import { badRequest, notFound } from "../../common/errors.js";

/**
 * Guest Explore feed (jobs, opportunities, events, holidays).
 *
 * This is a platform-level feed managed by Admin (it reads as a shared feed),
 * so it is not scoped to a single reseller.
 */

/** Listing status shown in the Admin filters; derived, never stored. */
export type ListingStatus = "LIVE" | "DRAFT" | "SCHEDULED" | "EXPIRED";

export type AdminListingFilters = {
  q?: string;
  kind?: ListingKind;
  source?: ListingSource;
  status?: ListingStatus;
  sort?: "newest" | "oldest" | "order" | "soonest";
  take?: number;
};

/** A listing is live for guests when it is active, published and not ended. */
export function guestListingWhere(now = new Date()): Prisma.PlatformListingWhereInput {
  return {
    active: true,
    AND: [
      { OR: [{ publishedAt: null }, { publishedAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
    ],
  };
}

/** Everything the guest portal needs, already filtered for this moment. */
export async function listGuestListings(take = 60, now = new Date()) {
  return prisma.platformListing.findMany({
    where: guestListingWhere(now),
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    take,
  });
}

export async function listPlatformListings(kind?: ListingKind) {
  return prisma.platformListing.findMany({
    where: kind ? { kind } : undefined,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
}

function statusWhere(status: ListingStatus, now: Date): Prisma.PlatformListingWhereInput {
  if (status === "DRAFT") return { active: false };
  if (status === "SCHEDULED") return { active: true, publishedAt: { gt: now } };
  if (status === "EXPIRED") return { active: true, endsAt: { lt: now } };
  return {
    active: true,
    AND: [
      { OR: [{ publishedAt: null }, { publishedAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
    ],
  };
}

function orderFor(sort: AdminListingFilters["sort"]): Prisma.PlatformListingOrderByWithRelationInput[] {
  if (sort === "oldest") return [{ createdAt: "asc" }];
  if (sort === "order") return [{ sortOrder: "asc" }, { createdAt: "desc" }];
  if (sort === "soonest") return [{ startsAt: "asc" }, { createdAt: "desc" }];
  return [{ createdAt: "desc" }];
}

/**
 * The Admin board: search + kind/source/status filters, a sort, and the counts
 * the filter chips display. Counts ignore the active filter on purpose — a chip
 * that reads "12" must stay 12 while another chip is selected.
 */
export async function listAdminListings(filters: AdminListingFilters) {
  const now = new Date();
  const search = filters.q?.trim();
  const where: Prisma.PlatformListingWhereInput = {
    ...(filters.kind ? { kind: filters.kind } : {}),
    ...(filters.source ? { source: filters.source } : {}),
    ...(filters.status ? statusWhere(filters.status, now) : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { organization: { contains: search, mode: "insensitive" } },
            { location: { contains: search, mode: "insensitive" } },
            { venue: { contains: search, mode: "insensitive" } },
            { region: { contains: search, mode: "insensitive" } },
            { summary: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
            { tags: { has: search } },
          ],
        }
      : {}),
  };

  const [items, byKind, bySource, live, scheduled, drafts] = await Promise.all([
    prisma.platformListing.findMany({
      where,
      orderBy: orderFor(filters.sort),
      take: filters.take ?? 500,
    }),
    prisma.platformListing.groupBy({ by: ["kind"], _count: { _all: true } }),
    prisma.platformListing.groupBy({ by: ["source"], _count: { _all: true } }),
    prisma.platformListing.count({ where: statusWhere("LIVE", now) }),
    prisma.platformListing.count({ where: statusWhere("SCHEDULED", now) }),
    prisma.platformListing.count({ where: statusWhere("DRAFT", now) }),
  ]);

  const kinds: Record<string, number> = {};
  for (const row of byKind) kinds[row.kind] = row._count._all;
  const sources: Record<string, number> = {};
  for (const row of bySource) sources[row.source] = row._count._all;

  return {
    items,
    total: items.length,
    counts: {
      all: byKind.reduce((sum, row) => sum + row._count._all, 0),
      kinds,
      ai: sources.AI ?? 0,
      manual: sources.MANUAL ?? 0,
      live,
      scheduled,
      drafts,
    },
  };
}

/** Default publish stamp: a manual row that is active goes live immediately. */
function publishStamp(input: PlatformListingInput, existing?: { publishedAt: Date | null } | null) {
  if (!input.active) return existing?.publishedAt ?? null;
  return input.publishedAt ?? existing?.publishedAt ?? new Date();
}

export async function createPlatformListing(input: PlatformListingInput) {
  return prisma.platformListing.create({
    data: {
      ...input,
      imageUrl: input.imageUrl || null,
      publishedAt: publishStamp(input),
    },
  });
}

export async function updatePlatformListing(id: string, input: PlatformListingInput) {
  const existing = await prisma.platformListing.findUnique({ where: { id } });
  if (!existing) notFound("Listing not found");
  return prisma.platformListing.update({
    where: { id },
    data: {
      ...input,
      imageUrl: input.imageUrl || null,
      publishedAt: publishStamp(input, existing),
    },
  });
}

export async function setPlatformListingActive(id: string, active: boolean) {
  const existing = await prisma.platformListing.findUnique({ where: { id } });
  if (!existing) notFound("Listing not found");
  return prisma.platformListing.update({
    where: { id },
    data: { active, publishedAt: active ? (existing.publishedAt ?? new Date()) : existing.publishedAt },
  });
}

export async function deletePlatformListing(id: string) {
  const existing = await prisma.platformListing.findUnique({ where: { id } });
  if (!existing) notFound("Listing not found");
  await prisma.platformListing.delete({ where: { id } });
  return { ok: true };
}

/** Bulk activate / deactivate / delete from the Admin board. */
export async function bulkPlatformListings(ids: string[], action: "activate" | "deactivate" | "delete") {
  if (ids.length === 0) badRequest("Select at least one listing");
  if (ids.length > 200) badRequest("Select at most 200 listings");
  if (action === "delete") {
    const result = await prisma.platformListing.deleteMany({ where: { id: { in: ids } } });
    return { affected: result.count };
  }
  const active = action === "activate";
  const rows = await prisma.platformListing.findMany({ where: { id: { in: ids } }, select: { id: true, publishedAt: true } });
  const now = new Date();
  await prisma.$transaction(
    rows.map((row) =>
      prisma.platformListing.update({
        where: { id: row.id },
        data: { active, publishedAt: active ? (row.publishedAt ?? now) : row.publishedAt },
      }),
    ),
  );
  return { affected: rows.length };
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
