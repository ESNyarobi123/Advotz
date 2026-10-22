import * as argon2 from "argon2";
import type {
  AdminResellerUpdateInput,
  AdminSubscriptionUpdateInput,
  CreateResellerInput,
} from "@advo/contracts";
import { prisma, type Prisma } from "@advo/db";
import { conflict, notFound, badRequest } from "../../common/errors.js";
import { audit } from "../../common/events.js";
import { generateOpaqueToken, hashToken, slugifyBusinessName } from "../../common/crypto.js";
import { entitlementsOf } from "../subscriptions/subscriptions.service.js";

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

/**
 * Admin edit of a reseller's business and owner contact details.
 *
 * Email and phone are unique across all users, so both are checked against every
 * other account before writing — a bare Prisma unique violation would surface as a
 * 500 with a constraint name instead of something an operator can act on.
 *
 * Only the columns in `ADMIN_EDITABLE` change. Status stays on its own endpoint
 * because it also revokes sessions, and the password is never touched here.
 */
export async function updateResellerProfile(
  adminUserId: string,
  resellerId: string,
  input: AdminResellerUpdateInput,
) {
  const reseller = await prisma.reseller.findUnique({
    where: { id: resellerId },
    include: { owner: { select: { id: true, email: true, phone: true, name: true, emailVerifiedAt: true } } },
  });
  if (!reseller) notFound("Reseller not found");

  const clash = await prisma.user.findFirst({
    where: {
      id: { not: reseller.ownerUserId },
      OR: [{ email: input.email }, { phone: input.phone }],
    },
    select: { email: true, phone: true },
  });
  if (clash) {
    conflict(
      clash.email === input.email
        ? "Another account already uses this email"
        : "Another account already uses this phone number",
    );
  }

  return prisma.$transaction(async (tx) => {
    const owner = await tx.user.update({
      where: { id: reseller.ownerUserId },
      data: {
        name: input.ownerName,
        email: input.email,
        phone: input.phone,
        // Clearing is as meaningful as setting: an operator who finds the address
        // wrong has to be able to take the badge away again.
        emailVerifiedAt: input.emailVerified ? (reseller.owner.emailVerifiedAt ?? new Date()) : null,
      },
      select: { id: true, email: true, phone: true, name: true, emailVerifiedAt: true },
    });

    const updated = await tx.reseller.update({
      where: { id: resellerId },
      data: { businessName: input.businessName },
    });

    await audit(tx, {
      actorUserId: adminUserId,
      action: "reseller.profile_updated",
      targetType: "Reseller",
      targetId: resellerId,
      resellerId,
      reason: input.reason,
      metadata: {
        before: {
          businessName: reseller.businessName,
          ownerName: reseller.owner.name,
          email: reseller.owner.email,
          phone: reseller.owner.phone,
          emailVerified: Boolean(reseller.owner.emailVerifiedAt),
        },
        after: {
          businessName: updated.businessName,
          ownerName: owner.name,
          email: owner.email,
          phone: owner.phone,
          emailVerified: Boolean(owner.emailVerifiedAt),
        },
      },
    });

    return { reseller: updated, owner };
  });
}

/** Seconds in a day, named so the period arithmetic below reads as dates rather than magic numbers. */
const DAY_MS = 86_400_000;
/** Dar es Salaam is a fixed UTC+3 with no daylight saving, so an offset is safe here. */
const DAR_OFFSET_MS = 3 * 3600_000;

/**
 * The instant a calendar day starts or ends in Dar es Salaam.
 *
 * `end` lands on the last millisecond of the local day, so "until 31 December"
 * keeps the plan active through the whole of 31 December local time.
 */
function darDayBoundary(day: string, edge: "start" | "end"): Date {
  const [year, month, date] = day.split("-").map(Number);
  // The schema guarantees the shape, so a malformed value can only arrive from a
  // caller that skipped validation; refuse it rather than producing an Invalid Date.
  if (!year || !month || !date) badRequest(`Not a calendar day: ${day}`);
  const localMidnight = Date.UTC(year, month - 1, date);
  const start = localMidnight - DAR_OFFSET_MS;
  return new Date(edge === "start" ? start : start + DAY_MS - 1);
}

/**
 * Applies an Admin's plan change to a reseller.
 *
 * The entitlements snapshot is recomputed from the plan on every save unless the
 * operator overrides a limit, because `currentEntitlements` reads only that
 * snapshot: a row whose `planId` changed but whose snapshot did not would keep
 * enforcing the old caps until the next renewal.
 *
 * Nothing here moves money. Invoices, payments and refunds stay on their own
 * flows, and the audit entry records the before/after pair so "why did this
 * reseller become ACTIVE" is answerable later.
 */
export async function updateResellerSubscription(
  adminUserId: string,
  resellerId: string,
  input: AdminSubscriptionUpdateInput,
) {
  const reseller = await prisma.reseller.findUnique({ where: { id: resellerId } });
  if (!reseller) notFound("Reseller not found");

  const plan = input.planId
    ? await prisma.platformPlan.findUnique({ where: { id: input.planId } })
    : null;
  if (input.planId && !plan) badRequest("Plan not found");
  // A draft plan is not sellable, so attaching one by hand would invent an
  // entitlement no other code path can produce.
  if (plan && plan.lifecycle !== "PUBLISHED") {
    badRequest("That plan version is not published");
  }

  const periodStart = input.currentPeriodStart ? darDayBoundary(input.currentPeriodStart, "start") : null;
  const periodEnd = input.currentPeriodEnd ? darDayBoundary(input.currentPeriodEnd, "end") : null;
  if (periodStart && periodEnd && periodEnd <= periodStart) {
    badRequest("The period must end after it starts");
  }
  // PAST_DUE and EXPIRED are derived from the period by the sweeper, so a row
  // claiming either without an end date would be re-derived on the next sweep and
  // silently flip back. Refuse it instead of writing a state that cannot last.
  if ((input.state === "PAST_DUE" || input.state === "EXPIRED") && !periodEnd) {
    badRequest("PAST_DUE and EXPIRED need a period end date");
  }

  const planEntitlements = plan ? entitlementsOf(plan) : null;
  const entitlements = planEntitlements
    ? {
        ...planEntitlements,
        maxSites: input.limits.maxSites ?? planEntitlements.maxSites,
        maxDevices: input.limits.maxDevices ?? planEntitlements.maxDevices,
        maxPackagesPerSite: input.limits.maxPackagesPerSite ?? planEntitlements.maxPackagesPerSite,
      }
    : null;

  const before = await prisma.subscription.findUnique({ where: { resellerId } });

  return prisma.$transaction(async (tx) => {
    const data = {
      planId: input.planId,
      state: input.state,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      trialUsedAt: input.trialUsed ? (before?.trialUsedAt ?? new Date()) : null,
      suspendedReason: input.suspendedReason?.trim() ? input.suspendedReason.trim() : null,
      entitlements: entitlements as unknown as Prisma.InputJsonValue,
    };
    const subscription = await tx.subscription.upsert({
      where: { resellerId },
      create: { resellerId, ...data },
      update: data,
    });

    await audit(tx, {
      actorUserId: adminUserId,
      action: "subscription.updated_by_admin",
      targetType: "Subscription",
      targetId: subscription.id,
      resellerId,
      reason: input.reason,
      metadata: {
        before: {
          planId: before?.planId ?? null,
          state: before?.state ?? null,
          periodStart: before?.currentPeriodStart ?? null,
          periodEnd: before?.currentPeriodEnd ?? null,
          trialUsed: Boolean(before?.trialUsedAt),
          suspendedReason: before?.suspendedReason ?? null,
        },
        after: {
          planId: input.planId,
          state: input.state,
          periodStart,
          periodEnd,
          trialUsed: input.trialUsed,
          suspendedReason: data.suspendedReason,
        },
        overrides: input.limits,
      },
    });

    return subscription;
  });
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
