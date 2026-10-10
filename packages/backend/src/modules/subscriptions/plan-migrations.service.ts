import {
  planMigrationInputSchema,
  type PlanMigrationInput,
  type PlanMigrationScope,
  type PlanMigrationView,
} from "@advo/contracts";
import { prisma, type Prisma } from "@advo/db";
import { audit } from "../../common/events.js";
import { badRequest, conflict, notFound } from "../../common/errors.js";
import { invalidatePortalCacheForPlanChange } from "./portal-cache.js";
import { entitlementsOf } from "./subscriptions.service.js";

/**
 * Plan version migrations.
 *
 * Publishing a plan version changes what is *sold*. It must never change what a
 * current subscriber was granted — that would be a hidden switch inside a price
 * edit. So a subscription only ever moves to a new published version through a
 * recorded migration with an explicit scope and effective date, and every move
 * keeps the old and new version on the record.
 *
 * Scopes:
 * - `NEW_ONLY`   — nothing moves; new subscribers already get the new version.
 * - `ON_RENEWAL` — each subscription moves when its paid period ends, never
 *                  mid-period, so nobody loses time they paid for.
 * - `SELECTED`   — only the named resellers.
 * - `ALL`        — everyone still bound to an earlier version of this code.
 */

type TargetCandidate = {
  resellerId: string;
  businessName: string;
  planId: string | null;
  code: string | null;
  version: number | null;
  currentPeriodEnd: Date | null;
};

/**
 * Everyone a migration of this scope would touch, today.
 *
 * Kept read-only and separate from `apply` so the admin UI can show the exact
 * old → new list — and the count — before anyone commits to it.
 */
async function targetCandidates(planId: string, scope: PlanMigrationScope, resellerIds: string[]): Promise<TargetCandidate[]> {
  const plan = await prisma.platformPlan.findUniqueOrThrow({ where: { id: planId }, select: { code: true } });
  if (scope === "NEW_ONLY") return [];

  const where: Prisma.SubscriptionWhereInput =
    scope === "SELECTED"
      ? { resellerId: { in: resellerIds } }
      : // Everyone on an earlier version of the same plan code, plus anyone with no
        // plan at all who is being assigned one.
        { OR: [{ planId: null }, { plan: { code: plan.code } }] };

  const subscriptions = await prisma.subscription.findMany({
    where: { ...where, state: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
    include: { reseller: { select: { businessName: true } }, plan: { select: { id: true, code: true, version: true } } },
    orderBy: { createdAt: "asc" },
  });

  // A subscription already on the target version is not a target.
  return subscriptions
    .filter((row) => row.planId !== planId)
    .map((row) => ({
      resellerId: row.resellerId,
      businessName: row.reseller.businessName,
      planId: row.plan?.id ?? null,
      code: row.plan?.code ?? null,
      version: row.plan?.version ?? null,
      currentPeriodEnd: row.currentPeriodEnd,
    }));
}

/** The version subscriptions are moving to must be published, never a draft. */
async function assertMigratableTarget(planId: string) {
  const plan = await prisma.platformPlan.findUnique({ where: { id: planId } });
  if (!plan) notFound("Plan version not found");
  if (plan.lifecycle === "DRAFT") {
    badRequest("Publish this version before migrating subscribers onto it", "PLAN_NOT_PUBLISHED");
  }
  return plan;
}

/**
 * Records a migration — and applies anything already due.
 *
 * `NEW_ONLY` has nothing to move, so it is stored as applied immediately: the
 * record is the point, not the work.
 */
export async function schedulePlanMigration(adminUserId: string, input: PlanMigrationInput): Promise<PlanMigrationView> {
  const parsed = planMigrationInputSchema.parse(input);
  const plan = await assertMigratableTarget(parsed.planId);
  const candidates = await targetCandidates(parsed.planId, parsed.scope, parsed.resellerIds);

  const created = await prisma.$transaction(async (tx) => {
    const migration = await tx.planMigration.create({
      data: {
        planId: parsed.planId,
        scope: parsed.scope,
        effectiveAt: parsed.effectiveAt,
        note: parsed.note,
        createdByUserId: adminUserId,
        // A no-op scope is complete the moment it is decided.
        status: parsed.scope === "NEW_ONLY" || candidates.length === 0 ? "APPLIED" : "SCHEDULED",
        appliedAt: parsed.scope === "NEW_ONLY" || candidates.length === 0 ? new Date() : null,
      },
    });
    if (candidates.length > 0) {
      await tx.planMigrationTarget.createMany({
        data: candidates.map((candidate) => ({
          migrationId: migration.id,
          resellerId: candidate.resellerId,
          fromPlanId: candidate.planId,
          fromCode: candidate.code,
          fromVersion: candidate.version,
        })),
      });
    }
    await audit(tx, {
      actorUserId: adminUserId,
      action: "plan.migration_scheduled",
      targetType: "PlanMigration",
      targetId: migration.id,
      metadata: {
        planId: plan.id,
        code: plan.code,
        newVersion: plan.version,
        scope: parsed.scope,
        effectiveAt: parsed.effectiveAt.toISOString(),
        targetCount: candidates.length,
        // Old → new is captured up front so the preview and the audit agree.
        targets: candidates.map((candidate) => ({ resellerId: candidate.resellerId, from: candidate.version, to: plan.version })),
      },
    });
    return migration;
  });

  // A migration that lands now would otherwise be served from a pre-migration cache.
  if (created.appliedAt) invalidatePortalCacheForPlanChange();
  return migrationView(created.id);
}

/**
 * Applies every scheduled migration whose effective date has arrived.
 *
 * Runs from the sweeper as well as on admin demand, so a scheduled migration is
 * never silently skipped when nobody opens the plans screen.
 */
export async function applyDuePlanMigrations(now: Date = new Date()): Promise<number> {
  const due = await prisma.planMigration.findMany({
    where: { status: { in: ["SCHEDULED", "PARTIAL"] }, effectiveAt: { lte: now } },
    select: { id: true },
    orderBy: { effectiveAt: "asc" },
    take: 50,
  });
  let applied = 0;
  for (const migration of due) applied += await applyPlanMigration(migration.id, now);
  return applied;
}

/**
 * Moves the subscriptions this migration is allowed to move *right now*.
 *
 * For `ON_RENEWAL` a target whose period has not ended is left pending, and the
 * migration reports `PARTIAL` rather than pretending to be finished.
 */
export async function applyPlanMigration(migrationId: string, now: Date = new Date(), actorUserId?: string): Promise<number> {
  const migration = await prisma.planMigration.findUnique({
    where: { id: migrationId },
    include: { plan: true, targets: { include: { reseller: { select: { businessName: true } } } } },
  });
  if (!migration) notFound("Migration not found");
  if (migration.status === "CANCELLED") conflict("This migration was cancelled");
  if (migration.status === "APPLIED") return 0;
  if (migration.effectiveAt > now) badRequest("This migration is scheduled for a later date", "MIGRATION_NOT_DUE");

  const pending = migration.targets.filter((target) => !target.appliedAt);

  // For ON_RENEWAL each subscription's period end decides, so the loop reads it
  // individually rather than trusting a pre-filtered list.
  const moved: string[] = [];
  for (const target of pending) {
    const subscription = await prisma.subscription.findUnique({ where: { resellerId: target.resellerId } });
    if (!subscription) continue;
    if (migration.scope === "ON_RENEWAL" && subscription.currentPeriodEnd && subscription.currentPeriodEnd > now) continue;
    if (subscription.planId === migration.planId) {
      await prisma.planMigrationTarget.update({ where: { id: target.id }, data: { appliedAt: now, appliedByUserId: actorUserId ?? null } });
      continue;
    }
    const from = await prisma.platformPlan.findUnique({ where: { id: subscription.planId ?? "00000000-0000-0000-0000-000000000000" } });
    await prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          planId: migration.planId,
          entitlements: entitlementsOf(migration.plan),
        },
      });
      await tx.planMigrationTarget.update({
        where: { id: target.id },
        data: { appliedAt: now, appliedByUserId: actorUserId ?? null },
      });
      await audit(tx, {
        actorUserId: actorUserId ?? migration.createdByUserId,
        action: "plan.migration_applied",
        targetType: "Subscription",
        targetId: subscription.id,
        resellerId: target.resellerId,
        // Old and new are both named, per the spec's audit requirement.
        metadata: {
          migrationId: migration.id,
          scope: migration.scope,
          effectiveAt: migration.effectiveAt.toISOString(),
          from: from ? { planId: from.id, code: from.code, version: from.version } : null,
          to: { planId: migration.plan.id, code: migration.plan.code, version: migration.plan.version },
        },
      });
    });
    moved.push(target.resellerId);
  }

  const remaining = await prisma.planMigrationTarget.count({ where: { migrationId, appliedAt: null } });
  await prisma.planMigration.update({
    where: { id: migrationId },
    data: remaining === 0 ? { status: "APPLIED", appliedAt: now } : { status: "PARTIAL" },
  });

  if (moved.length > 0) invalidatePortalCacheForPlanChange();
  return moved.length;
}

/** Stops a scheduled migration from moving anything else. */
export async function cancelPlanMigration(adminUserId: string, migrationId: string, reason: string): Promise<PlanMigrationView> {
  const migration = await prisma.planMigration.findUnique({ where: { id: migrationId }, include: { targets: true } });
  if (!migration) notFound("Migration not found");
  if (migration.status === "APPLIED") conflict("This migration has already finished");
  // Subscriptions that already moved keep the terms they moved to; cancelling
  // only stops the remainder, which is the honest reading of "stop the migration".
  const applied = migration.targets.filter((target) => target.appliedAt).length;
  await prisma.planMigration.update({ where: { id: migrationId }, data: { status: "CANCELLED" } });
  await audit(prisma, {
    actorUserId: adminUserId,
    action: "plan.migration_cancelled",
    targetType: "PlanMigration",
    targetId: migrationId,
    reason,
    metadata: { planId: migration.planId, alreadyApplied: applied },
  });
  return migrationView(migrationId);
}

/** Admin-facing read of every migration, newest first. */
export async function listPlanMigrations(planId?: string): Promise<PlanMigrationView[]> {
  const rows = await prisma.planMigration.findMany({
    where: planId ? { planId } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return Promise.all(rows.map((row) => migrationView(row.id)));
}

/** One migration with both sides of every target named. */
export async function migrationView(migrationId: string): Promise<PlanMigrationView> {
  const migration = await prisma.planMigration.findUniqueOrThrow({
    where: { id: migrationId },
    include: {
      plan: { select: { id: true, code: true, version: true, lifecycle: true } },
      targets: { include: { reseller: { select: { businessName: true } } }, orderBy: { resellerId: "asc" } },
    },
  });
  const appliedCount = migration.targets.filter((target) => target.appliedAt).length;
  return {
    id: migration.id,
    scope: migration.scope,
    status: migration.status,
    effectiveAt: migration.effectiveAt.toISOString(),
    note: migration.note,
    createdAt: migration.createdAt.toISOString(),
    appliedAt: migration.appliedAt?.toISOString() ?? null,
    plan: { id: migration.plan.id, code: migration.plan.code, version: migration.plan.version, lifecycle: migration.plan.lifecycle },
    targets: migration.targets.map((target) => ({
      resellerId: target.resellerId,
      businessName: target.reseller.businessName,
      from: target.fromPlanId && target.fromCode !== null && target.fromVersion !== null
        ? { planId: target.fromPlanId, code: target.fromCode, version: target.fromVersion }
        : null,
      to: { planId: migration.plan.id, code: migration.plan.code, version: migration.plan.version },
      applied: Boolean(target.appliedAt),
      appliedAt: target.appliedAt?.toISOString() ?? null,
    })),
    appliedCount,
    pendingCount: migration.targets.length - appliedCount,
  };
}

/** Preview used by the admin dialog before anything is recorded. */
export async function previewPlanMigration(input: PlanMigrationInput) {
  const parsed = planMigrationInputSchema.parse(input);
  const plan = await assertMigratableTarget(parsed.planId);
  const candidates = await targetCandidates(parsed.planId, parsed.scope, parsed.resellerIds);
  return {
    plan: { id: plan.id, code: plan.code, version: plan.version, lifecycle: plan.lifecycle },
    scope: parsed.scope,
    effectiveAt: parsed.effectiveAt.toISOString(),
    targets: candidates.map((candidate) => ({
      resellerId: candidate.resellerId,
      businessName: candidate.businessName,
      from: candidate.planId && candidate.code !== null && candidate.version !== null
        ? { planId: candidate.planId, code: candidate.code, version: candidate.version }
        : null,
      to: { planId: plan.id, code: plan.code, version: plan.version },
      applied: false,
      appliedAt: null,
    })),
  };
}
