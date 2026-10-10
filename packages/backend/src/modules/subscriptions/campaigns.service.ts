import type { AdCampaignInput } from "@advo/contracts";
import { prisma } from "@advo/db";
import { audit } from "../../common/events.js";
import { notFound } from "../../common/errors.js";
import { assertCampaignPlacements, campaignView } from "./entitlements.service.js";
import { bumpCampaignGeneration } from "./portal-cache.js";

/**
 * Ad campaign authoring (Admin only).
 *
 * A campaign is a platform-owned creative plus the placements it may appear in
 * and the audience it may reach. Publishing a campaign does not touch any
 * reseller's configuration: the portal asks for *eligible* campaigns at request
 * time, so a campaign that targets another reseller can never leak.
 */

async function findCampaign(campaignId: string) {
  const row = await prisma.adCampaign.findUnique({ where: { id: campaignId } });
  if (!row) notFound("Campaign not found");
  return row;
}

export async function listCampaigns() {
  const rows = await prisma.adCampaign.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  return rows.map(campaignView);
}

export async function createCampaign(adminUserId: string, input: AdCampaignInput) {
  assertCampaignPlacements(input.placements);
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.adCampaign.create({
      data: {
        name: input.name,
        status: input.status,
        placements: input.placements,
        creative: input.creative,
        targeting: input.targeting,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        createdByUserId: adminUserId,
      },
    });
    await audit(tx, {
      actorUserId: adminUserId,
      action: "ad_campaign.created",
      targetType: "AdCampaign",
      targetId: created.id,
      metadata: { name: created.name, placements: created.placements, status: created.status },
    });
    return created;
  });
  // A campaign write changes what every portal may be served next.
  bumpCampaignGeneration();
  return campaignView(row);
}

export async function updateCampaign(adminUserId: string, campaignId: string, input: AdCampaignInput) {
  assertCampaignPlacements(input.placements);
  const existing = await findCampaign(campaignId);
  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.adCampaign.update({
      where: { id: campaignId },
      data: {
        name: input.name,
        status: input.status,
        placements: input.placements,
        creative: input.creative,
        targeting: input.targeting,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
      },
    });
    await audit(tx, {
      actorUserId: adminUserId,
      action: "ad_campaign.updated",
      targetType: "AdCampaign",
      targetId: campaignId,
      metadata: { from: existing.status, to: updated.status, placements: updated.placements },
    });
    return updated;
  });
  // A campaign write changes what every portal may be served next.
  bumpCampaignGeneration();
  return campaignView(row);
}

/**
 * Deleting is allowed only for a campaign that was never served; anything that
 * ran is paused instead so delivery history keeps its referent.
 */
export async function deleteCampaign(adminUserId: string, campaignId: string, reason: string) {
  await findCampaign(campaignId);
  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.adCampaign.update({
      where: { id: campaignId },
      data: { status: "ENDED" },
    });
    await audit(tx, {
      actorUserId: adminUserId,
      action: "ad_campaign.ended",
      targetType: "AdCampaign",
      targetId: campaignId,
      metadata: { reason },
    });
    return updated;
  });
  // A campaign write changes what every portal may be served next.
  bumpCampaignGeneration();
  return campaignView(row);
}

export async function setCampaignStatus(adminUserId: string, campaignId: string, status: AdCampaignInput["status"], reason: string) {
  const existing = await findCampaign(campaignId);
  if (status === "ACTIVE") {
    // A draft that is switched on must still name at least one placement.
    assertCampaignPlacements(existing.placements);
  }
  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.adCampaign.update({ where: { id: campaignId }, data: { status } });
    await audit(tx, {
      actorUserId: adminUserId,
      action: "ad_campaign.status",
      targetType: "AdCampaign",
      targetId: campaignId,
      metadata: { status, reason },
    });
    return updated;
  });
  // A campaign write changes what every portal may be served next.
  bumpCampaignGeneration();
  return campaignView(row);
}
