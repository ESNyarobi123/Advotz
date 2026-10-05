import * as argon2 from "argon2";
import type { CreateResellerInput } from "@advo/contracts";
import { prisma } from "@advo/db";
import { conflict, notFound, badRequest } from "../../common/errors.js";
import { audit } from "../../common/events.js";
import { generateOpaqueToken, hashToken, slugifyBusinessName } from "../../common/crypto.js";

/** How long an Admin can act as a reseller before the session dies on its own. */
export const IMPERSONATION_TTL_SECONDS = Number(process.env.IMPERSONATION_TTL_SECONDS ?? 900);

export async function setResellerStatus(adminUserId: string, resellerId: string, status: "ACTIVE" | "SUSPENDED" | "CLOSED", reason: string) {
  const reseller = await prisma.reseller.findUnique({ where: { id: resellerId } });
  if (!reseller) notFound();
  return prisma.$transaction(async (tx) => {
    const updated = await tx.reseller.update({ where: { id: resellerId }, data: { status } });
    await tx.user.update({ where: { id: reseller.ownerUserId }, data: { status } });
    if (status !== "ACTIVE") {
      await tx.authSession.updateMany({ where: { userId: reseller.ownerUserId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await audit(tx, { actorUserId: adminUserId, action: `reseller.${status.toLowerCase()}`, targetType: "Reseller", targetId: resellerId, resellerId, reason });
    return updated;
  });
}

/**
 * Admin-initiated reseller creation.
 *
 * Mirrors the self-registration shape but skips email verification: an Admin who
 * vouches for the contact creates the account `ACTIVE`, so the reseller can sign in
 * immediately with the temporary password.
 */
export async function createReseller(adminUserId: string, input: CreateResellerInput) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: input.email }, { phone: input.phone }] },
    select: { email: true, phone: true },
  });
  if (existing) {
    conflict(
      existing.email === input.email
        ? "A user with this email already exists"
        : "A user with this phone number already exists",
    );
  }

  const agent = input.referralCode
    ? await prisma.agent.findUnique({ where: { referralCode: input.referralCode.toUpperCase() } })
    : null;
  if (input.referralCode && !agent) badRequest(`No agent with referral code ${input.referralCode}`);

  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
  const slug = slugifyBusinessName(input.businessName);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        role: "RESELLER",
        email: input.email,
        phone: input.phone,
        name: input.ownerName,
        passwordHash,
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
    });

    const reseller = await tx.reseller.create({
      data: {
        ownerUserId: user.id,
        businessName: input.businessName,
        slug,
        status: "ACTIVE",
        registrationSource: "ADMIN",
        onboardingStep: "PROFILE",
      },
    });

    if (agent) {
      await tx.referralAttribution.create({
        data: { resellerId: reseller.id, agentId: agent.id, source: "ADMIN_CORRECTION", reason: "Created by Admin" },
      });
    }

    await audit(tx, {
      actorUserId: adminUserId,
      action: "reseller.created_by_admin",
      targetType: "Reseller",
      targetId: reseller.id,
      resellerId: reseller.id,
      metadata: { email: input.email, agentReferralCode: agent?.referralCode ?? null },
    });

    return { id: reseller.id, businessName: reseller.businessName, slug: reseller.slug, ownerEmail: user.email };
  });
}

/**
 * Opens a short-lived session for the reseller's owner, tagged with the Admin behind it.
 *
 * The caller sets the returned token on a dedicated cookie, so the Admin's own
 * session is never replaced and leaving is a single cookie clear.
 */
export async function startImpersonation(
  adminUserId: string,
  resellerId: string,
  reason: string,
  meta: { userAgent?: string; ipAddress?: string },
  ttlSeconds = IMPERSONATION_TTL_SECONDS,
) {
  const reseller = await prisma.reseller.findUnique({
    where: { id: resellerId },
    include: { owner: { select: { id: true, email: true, name: true, status: true } } },
  });
  if (!reseller) notFound();
  if (reseller.owner.status === "SUSPENDED" || reseller.owner.status === "CLOSED") {
    conflict("This reseller's account is not allowed to sign in");
  }

  const rawToken = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.authSession.create({
      data: {
        userId: reseller.ownerUserId,
        tokenHash: hashToken(rawToken),
        expiresAt,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
        // The Admin already cleared MFA on their own session; do not re-challenge here.
        mfaPassed: true,
        impersonatedByUserId: adminUserId,
        impersonationReason: reason,
      },
    });
    await audit(tx, {
      actorUserId: adminUserId,
      action: "reseller.impersonation_started",
      targetType: "Reseller",
      targetId: resellerId,
      resellerId,
      reason,
      metadata: { ownerEmail: reseller.owner.email, ttlSeconds },
    });
  });

  return { token: rawToken, expiresAt, reseller: { id: reseller.id, businessName: reseller.businessName } };
}

export async function setAgentStatus(adminUserId: string, agentId: string, status: "ACTIVE" | "SUSPENDED" | "CLOSED", reason: string) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) notFound();
  return prisma.$transaction(async (tx) => {
    const updated = await tx.agent.update({ where: { id: agentId }, data: { status } });
    await tx.user.update({ where: { id: agent.userId }, data: { status } });
    if (status !== "ACTIVE") {
      await tx.authSession.updateMany({ where: { userId: agent.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await audit(tx, { actorUserId: adminUserId, action: `agent.${status.toLowerCase()}`, targetType: "Agent", targetId: agentId, reason });
    return updated;
  });
}

/**
 * Agent counterpart to `startImpersonation`.
 *
 * Same contract: the token goes on the dedicated impersonation cookie, the Admin's
 * own session is untouched, and the audit row names both parties plus the reason.
 */
export async function startAgentImpersonation(
  adminUserId: string,
  agentId: string,
  reason: string,
  meta: { userAgent?: string; ipAddress?: string },
  ttlSeconds = IMPERSONATION_TTL_SECONDS,
) {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: { user: { select: { id: true, email: true, name: true, status: true } } },
  });
  if (!agent) notFound();
  if (agent.user.status === "SUSPENDED" || agent.user.status === "CLOSED") {
    conflict("This agent's account is not allowed to sign in");
  }

  const rawToken = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.authSession.create({
      data: {
        userId: agent.userId,
        tokenHash: hashToken(rawToken),
        expiresAt,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
        // The Admin already cleared MFA on their own session; do not re-challenge here.
        mfaPassed: true,
        impersonatedByUserId: adminUserId,
        impersonationReason: reason,
      },
    });
    await audit(tx, {
      actorUserId: adminUserId,
      action: "agent.impersonation_started",
      targetType: "Agent",
      targetId: agentId,
      reason,
      metadata: { agentEmail: agent.user.email, ttlSeconds },
    });
  });

  return { token: rawToken, expiresAt, agent: { id: agent.id, referralCode: agent.referralCode } };
}

/** Admin attribution correction: effective-dated and audited; never rewrites past accruals. */
export async function correctAttribution(adminUserId: string, resellerId: string, agentId: string | null, reason: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.referralAttribution.findUnique({ where: { resellerId } });
    if (agentId) {
      const agent = await tx.agent.findUnique({ where: { id: agentId } });
      if (!agent) notFound("Agent not found");
      if (existing?.agentId === agentId) conflict("Reseller is already attributed to this Agent");
    }
    if (existing) await tx.referralAttribution.delete({ where: { resellerId } });
    const created = agentId
      ? await tx.referralAttribution.create({ data: { resellerId, agentId, source: "ADMIN_CORRECTION", reason } })
      : null;
    await audit(tx, {
      actorUserId: adminUserId,
      action: "attribution.corrected",
      targetType: "Reseller",
      targetId: resellerId,
      resellerId,
      reason,
      metadata: { before: existing?.agentId ?? null, after: agentId },
    });
    return created;
  });
}
