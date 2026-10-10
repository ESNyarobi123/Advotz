import { prisma, type PlatformPlan, type Prisma } from "@advo/db";
import {
  planFeaturesWithDefaults,
  validatePlanFeatures,
  type CommercialPromise,
  type PlanFeatures,
  type PlatformPlanInput,
} from "@advo/contracts";
import { badRequest, conflict, forbidden, notFound } from "../../common/errors.js";
import { audit, emitOutbox, OutboxEventType } from "../../common/events.js";
import { invalidatePortalCacheForPlanChange } from "./portal-cache.js";
import { ensurePaymentAttempt, type Payer } from "../payments/payments.service.js";

type Tx = Prisma.TransactionClient;

/**
 * The caps a subscription is currently bound by.
 *
 * `null` means unlimited — never `0`, which would read as "none allowed" to
 * anyone not holding the convention in their head.
 */
export type Entitlements = {
  planCode: string;
  planVersion: number;
  maxSites: number | null;
  maxDevices: number | null;
  /** Legacy reseller-wide package cap, kept for plans written before the catalog. */
  maxPackages: number | null;
  /** The catalog's per-site active-package cap. */
  maxPackagesPerSite: number | null;
};

/** Whether the stored JSON carries its own limits, so a legacy row can still be read. */
function hasStoredLimits(raw: unknown): boolean {
  return Boolean(raw && typeof raw === "object" && "limits" in (raw as Record<string, unknown>));
}

/**
 * The caps a plan version grants.
 *
 * A plan written by the feature editor owns its limits outright — including an
 * explicit "unlimited", which is why the presence of the `limits` key is what
 * decides, rather than the value being `null`. Rows predating the feature catalog
 * keep falling back to the legacy reseller-wide columns.
 */
export function planLimitsOf(plan: Pick<PlatformPlan, "features" | "maxSites" | "maxDevices" | "maxPackages">) {
  const features = planFeaturesWithDefaults(plan.features);
  const stored = hasStoredLimits(plan.features);
  return {
    sites: stored ? features.limits.sites : (plan.maxSites ?? null),
    devices: stored ? features.limits.devices : (plan.maxDevices ?? null),
    packagesPerSite: stored ? features.limits.wifi_packages_per_site : null,
    packagesTotal: stored ? null : (plan.maxPackages ?? null),
  };
}

/** The entitlement snapshot stored on a subscription when it moves to a plan. */
export function entitlementsOf(plan: PlatformPlan): Entitlements {  const limits = planLimitsOf(plan);
  return {
    planCode: plan.code,
    planVersion: plan.version,
    maxSites: limits.sites,
    maxDevices: limits.devices,
    maxPackages: limits.packagesTotal,
    maxPackagesPerSite: limits.packagesPerSite,
  };
}

/**
 * The feature set a plan version will store.
 *
 * Feature limits win; the legacy columns only fill in limits that were not part
 * of the feature payload, so both representations stay in step.
 */
export function resolvePlanFeatures(input: PlatformPlanInput): PlanFeatures {
  const features = planFeaturesWithDefaults(input.features);
  if (hasStoredLimits(input.features)) return features;
  return {
    ...features,
    limits: {
      sites: input.maxSites ?? null,
      devices: input.maxDevices ?? null,
      wifi_packages_per_site: input.maxPackages ?? null,
    },
  };
}

/**
 * Rejects a plan whose feature configuration would not behave as written.
 *
 * Validation runs against the **raw** payload, not the normalized one: the
 * normalizer strips unknown keys, so validating only what it returns would let
 * a typo'd feature key look saved while doing nothing.
 */
function assertPublishable(features: unknown, commercialPromise: CommercialPromise) {
  const issues = validatePlanFeatures(features, { commercialPromise });
  if (issues.length > 0) {
    badRequest(`This plan cannot be published: ${issues.map((issue) => `${issue.key} — ${issue.message}`).join("; ")}`);
  }
}

export function planSnapshot(plan: PlatformPlan) {
  return {
    id: plan.id,
    code: plan.code,
    version: plan.version,
    name: plan.name,
    description: plan.description,
    priceTzs: plan.priceTzs.toString(),
    periodDays: plan.periodDays,
    maxSites: planLimitsOf(plan).sites,
    maxDevices: planLimitsOf(plan).devices,
    maxPackages: planLimitsOf(plan).packagesPerSite ?? planLimitsOf(plan).packagesTotal,
    maxPackagesPerSite: planLimitsOf(plan).packagesPerSite,
    commercialPromise: plan.commercialPromise,
    lifecycle: plan.lifecycle,
    features: planFeaturesWithDefaults(plan.features),
    isDemo: plan.isDemo,
  };
}

// ───────────────────────────── Plans (Admin) ─────────────────────────────

/** The mutable columns of a plan, shared by create and update so the two cannot drift. */
function planFields(input: PlatformPlanInput) {
  const features = resolvePlanFeatures(input);
  return {
    name: input.name,
    description: input.description,
    priceTzs: input.priceTzs,
    periodDays: input.periodDays,
    trialEligible: input.trialEligible,
    trialDays: input.trialEligible ? (input.trialDays ?? null) : null,
    maxSites: features.limits.sites,
    maxDevices: features.limits.devices,
    maxPackages: features.limits.wifi_packages_per_site,
    features: features as unknown as Prisma.InputJsonValue,
    lifecycle: input.lifecycle,
    visibility: input.visibility,
    commercialPromise: input.commercialPromise,
    // A published version is sellable; a draft never is.
    active: input.lifecycle === "PUBLISHED",
    isDemo: input.isDemo,
  };
}

/** Editing a plan creates a new version; paid invoices keep their own snapshot. */
export async function upsertPlan(adminUserId: string, input: PlatformPlanInput) {
  return prisma.$transaction(async (tx) => {
    const latest = await tx.platformPlan.findFirst({ where: { code: input.code }, orderBy: { version: "desc" } });
    if (input.lifecycle === "PUBLISHED") {
      assertPublishable(input.features, input.commercialPromise);
    }
    if (latest) await tx.platformPlan.updateMany({ where: { code: input.code, active: true }, data: { active: false } });
    const plan = await tx.platformPlan.create({
      data: {
        code: input.code,
        version: (latest?.version ?? 0) + 1,
        publishedAt: input.lifecycle === "PUBLISHED" ? new Date() : null,
        ...planFields(input),
      },
    });
    await audit(tx, { actorUserId: adminUserId, action: "plan.versioned", targetType: "PlatformPlan", targetId: plan.id, metadata: { code: plan.code, version: plan.version } });
    return plan;
  });
}

/**
 * Edits a specific plan row.
 *
 * Two paths, chosen by whether anything already depends on the row:
 *
 * - **Nothing references it** — the row is corrected in place (including its code), so a
 *   typo does not leave a trail of versions nobody ever sold.
 * - **Subscriptions or invoices exist** — a new version is published and the edited row is
 *   retired. Live subscribers keep the terms they signed up for, and their invoices keep
 *   the snapshot they were billed against.
 */
export async function updatePlan(adminUserId: string, planId: string, input: PlatformPlanInput) {
  const existing = await prisma.platformPlan.findUnique({
    where: { id: planId },
    include: { _count: { select: { subscriptions: true, invoices: true } } },
  });
  if (!existing) notFound("Plan not found");

  const referenced = existing._count.subscriptions > 0 || existing._count.invoices > 0;
  if (input.lifecycle === "PUBLISHED") assertPublishable(input.features, input.commercialPromise);

  if (!referenced) {
    if (input.code !== existing.code) {
      const clash = await prisma.platformPlan.findFirst({
        where: { code: input.code, version: existing.version, NOT: { id: planId } },
        select: { id: true },
      });
      if (clash) conflict(`Version ${existing.version} of "${input.code}" already exists`);
    }
    return prisma.$transaction(async (tx) => {
      const fields = planFields(input);
      if (fields.active) {
        await tx.platformPlan.updateMany({ where: { code: input.code, active: true, NOT: { id: planId } }, data: { active: false } });
      }
      const updated = await tx.platformPlan.update({
        where: { id: planId },
        data: {
          code: input.code,
          ...fields,
          publishedAt: fields.active ? (existing.publishedAt ?? new Date()) : null,
        },
      });
      await audit(tx, {
        actorUserId: adminUserId,
        action: "plan.updated",
        targetType: "PlatformPlan",
        targetId: planId,
        metadata: {
          code: updated.code,
          version: updated.version,
          lifecycle: updated.lifecycle,
          before: { code: existing.code, name: existing.name, priceTzs: existing.priceTzs.toString(), lifecycle: existing.lifecycle },
        },
      });
      return updated;
    });
  }

  return prisma.$transaction(async (tx) => {
    const latest = await tx.platformPlan.findFirst({ where: { code: input.code }, orderBy: { version: "desc" } });
    const fields = planFields(input);
    await tx.platformPlan.updateMany({ where: { code: input.code, active: true }, data: { active: false } });
    const created = await tx.platformPlan.create({
      data: {
        code: input.code,
        version: (latest?.version ?? 0) + 1,
        publishedAt: fields.active ? new Date() : null,
        ...fields,
      },
    });
    // The edited row can live under a different code, in which case the sweep above missed it.
    if (existing.active && existing.id !== created.id) {
      await tx.platformPlan.update({ where: { id: existing.id }, data: { active: false } });
    }
    await audit(tx, {
      actorUserId: adminUserId,
      action: "plan.versioned",
      targetType: "PlatformPlan",
      targetId: created.id,
      metadata: { code: created.code, version: created.version, supersededPlanId: existing.id, supersededVersion: existing.version },
    });
    return created;
  });
}

export async function archivePlan(adminUserId: string, planId: string) {
  return setPlanActive(adminUserId, planId, false, "Archived from the plans screen");
}

/**
 * Hard-deletes a plan row.
 *
 * Only allowed while nothing points at it: `Subscription.planId` and
 * `SubscriptionInvoice.planId` are `Restrict`, so a referenced plan must be archived
 * instead — deleting would either fail at the database or orphan billing history.
 */
export async function deletePlan(adminUserId: string, planId: string, reason: string) {
  const plan = await prisma.platformPlan.findUnique({
    where: { id: planId },
    include: { _count: { select: { subscriptions: true, invoices: true } } },
  });
  if (!plan) notFound("Plan not found");

  const references = plan._count.subscriptions + plan._count.invoices;
  if (references > 0) {
    conflict(
      `${plan.name} is referenced by ${plan._count.subscriptions} subscription(s) and ${plan._count.invoices} invoice(s) — archive it instead of deleting.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.platformPlan.delete({ where: { id: planId } });
    await audit(tx, {
      actorUserId: adminUserId,
      action: "plan.deleted",
      targetType: "PlatformPlan",
      targetId: planId,
      reason,
      metadata: { code: plan.code, version: plan.version, name: plan.name, priceTzs: plan.priceTzs.toString() },
    });
  });
  return { deleted: true };
}

/**
 * Turns a plan on or off.
 *
 * Activating retires whichever version of the same code was live, so a code always
 * resolves to exactly one sellable plan — otherwise checkout could pick either one.
 */
export async function setPlanActive(adminUserId: string, planId: string, active: boolean, reason: string) {
  const plan = await prisma.platformPlan.findUnique({ where: { id: planId } });
  if (!plan) notFound("Plan not found");
  if (active) assertPublishable(plan.features, plan.commercialPromise as CommercialPromise);

  return prisma.$transaction(async (tx) => {
    if (active) {
      await tx.platformPlan.updateMany({
        where: { code: plan.code, active: true, NOT: { id: planId } },
        data: { active: false, lifecycle: "ARCHIVED" },
      });
    }
    const updated = await tx.platformPlan.update({
      where: { id: planId },
      // Activating is publishing; deactivating is retiring. Both move the lifecycle.
      data: {
        active,
        lifecycle: active ? "PUBLISHED" : "ARCHIVED",
        publishedAt: active ? (plan.publishedAt ?? new Date()) : plan.publishedAt,
      },
    });
    await audit(tx, {
      actorUserId: adminUserId,
      action: active ? "plan.activated" : "plan.archived",
      targetType: "PlatformPlan",
      targetId: planId,
      reason,
      metadata: { code: plan.code, version: plan.version },
    });
    return updated;
  });
}

/**
 * Publishes a draft version.
 *
 * Validates the feature configuration and the commercial promise, then makes the
 * version the one sellable plan for its code. Nothing about live subscribers
 * changes until a migration is run against them — publishing a price or feature
 * change is not silently applied to people already paying.
 */
export async function publishPlan(adminUserId: string, planId: string) {
  const plan = await prisma.platformPlan.findUnique({ where: { id: planId } });
  if (!plan) notFound("Plan not found");
  if (plan.lifecycle === "ARCHIVED") conflict("An archived version cannot be published; create a new version instead");
  assertPublishable(plan.features, plan.commercialPromise as CommercialPromise);

  return prisma.$transaction(async (tx) => {
    await tx.platformPlan.updateMany({
      where: { code: plan.code, active: true, NOT: { id: planId } },
      data: { active: false, lifecycle: "ARCHIVED" },
    });
    const published = await tx.platformPlan.update({
      where: { id: planId },
      data: { lifecycle: "PUBLISHED", active: true, publishedAt: new Date() },
    });
    await audit(tx, {
      actorUserId: adminUserId,
      action: "plan.published",
      targetType: "PlatformPlan",
      targetId: planId,
      metadata: { code: published.code, version: published.version, commercialPromise: published.commercialPromise },
    });
    return published;
  });
}

/**
 * A read-only preview of what a plan version would mean.
 *
 * Runs the same validation as publishing — without persisting anything — so the
 * admin sees the conflict *before* it can reach a subscriber.
 */
export async function previewPlan(planId: string) {
  const plan = await prisma.platformPlan.findUnique({ where: { id: planId } });
  if (!plan) notFound("Plan not found");
  const features = planFeaturesWithDefaults(plan.features);
  const promise = plan.commercialPromise as CommercialPromise;
  return {
    planId: plan.id,
    code: plan.code,
    version: plan.version,
    lifecycle: plan.lifecycle,
    commercialPromise: promise,
    features,
    limits: planLimitsOf(plan),
    // Preview validates the raw stored payload so a typo'd key is visible here too.
    issues: validatePlanFeatures(plan.features, { commercialPromise: promise }),
  };
}

/**
 * Admin plan list, newest version first within each code, with the usage figures the
 * cards show. Money is aggregated with `_sum` server-side so a truncated list can never
 * misstate revenue, and `_count` tells the UI whether a row may still be deleted.
 */
export async function listPlans() {
  const [plans, paid, live] = await Promise.all([
    prisma.platformPlan.findMany({
      orderBy: [{ code: "asc" }, { version: "desc" }],
      include: { _count: { select: { subscriptions: true, invoices: true } } },
    }),
    prisma.subscriptionInvoice.groupBy({
      by: ["planId"],
      where: { status: "PAID" },
      _sum: { amountTzs: true },
      _count: true,
    }),
    prisma.subscription.groupBy({ by: ["planId"], _count: true }),
  ]);

  const revenueByPlan = new Map(paid.map((row) => [row.planId, row]));
  const subscriptionsByPlan = new Map(live.map((row) => [row.planId, row._count]));

  return plans.map((plan) => ({
    ...plan,
    subscriptions: subscriptionsByPlan.get(plan.id) ?? 0,
    paidInvoiceCount: revenueByPlan.get(plan.id)?._count ?? 0,
    paidRevenueTzs: revenueByPlan.get(plan.id)?._sum.amountTzs ?? 0n,
  }));
}

/** Only published, sellable versions reach the reseller catalog. */
export function listActivePlans() {
  return prisma.platformPlan.findMany({ where: { active: true, lifecycle: "PUBLISHED" }, orderBy: { priceTzs: "asc" } });
}

// ───────────────────────────── Subscription (Reseller) ───────────────────

export async function ensureSubscription(tx: Tx | typeof prisma, resellerId: string) {
  return tx.subscription.upsert({ where: { resellerId }, create: { resellerId, state: "NONE" }, update: {} });
}

export async function getSubscriptionView(resellerId: string) {
  const sub = await ensureSubscription(prisma, resellerId);
  const [plan, invoices] = await Promise.all([
    sub.planId ? prisma.platformPlan.findUnique({ where: { id: sub.planId } }) : null,
    prisma.subscriptionInvoice.findMany({
      where: { resellerId },
      orderBy: { createdAt: "desc" },
      take: 24,
      include: { order: { include: { attempts: { orderBy: { createdAt: "desc" }, take: 1 } } } },
    }),
  ]);
  return {
    state: effectiveState(sub),
    storedState: sub.state,
    plan,
    entitlements: sub.entitlements,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    trialUsed: Boolean(sub.trialUsedAt),
    invoices: invoices.map((i) => ({
      id: i.id,
      amountTzs: i.amountTzs,
      status: i.status,
      plan: i.planSnapshot,
      periodStart: i.periodStart,
      periodEnd: i.periodEnd,
      paidAt: i.paidAt,
      createdAt: i.createdAt,
      payment: i.order?.attempts[0]
        ? { state: i.order.attempts[0].state, lastError: i.order.attempts[0].lastError }
        : null,
    })),
  };
}

export const SUBSCRIPTION_GRACE_PERIOD_DAYS = 3;

function effectiveState(sub: { state: string; currentPeriodEnd: Date | null }) {
  if (sub.state === "ACTIVE" && sub.currentPeriodEnd) {
    const now = new Date();
    if (sub.currentPeriodEnd < now) {
      const graceEnd = new Date(sub.currentPeriodEnd.getTime() + SUBSCRIPTION_GRACE_PERIOD_DAYS * 86400_000);
      return now < graceEnd ? "PAST_DUE" : "EXPIRED";
    }
  }
  if (sub.state === "TRIALING" && sub.currentPeriodEnd && sub.currentPeriodEnd < new Date()) {
    return "EXPIRED";
  }
  return sub.state;
}

export async function startTrial(resellerId: string, planId: string, actorUserId: string) {
  return prisma.$transaction(async (tx) => {
    const reseller = await tx.reseller.findUniqueOrThrow({ where: { id: resellerId }, include: { owner: true } });
    if (!reseller.owner.emailVerifiedAt || reseller.status !== "ACTIVE") {
      forbidden("Verify your contact details before starting a trial");
    }
    // Lock the reseller row first: when no subscription exists yet the
    // `FOR UPDATE` on the Subscription table locks nothing, so two concurrent
    // first-trial requests would both pass the trialUsedAt guard.
    await tx.$queryRaw`SELECT id FROM "Reseller" WHERE id = ${resellerId}::uuid FOR UPDATE`;
    const sub = await ensureSubscription(tx, resellerId);
    if (sub.trialUsedAt) conflict("The trial has already been used for this business");
    if (sub.state === "ACTIVE") conflict("A paid subscription is already active");
    const plan = await tx.platformPlan.findFirst({ where: { id: planId, active: true } });
    if (!plan) notFound("Plan not found");
    if (!plan.trialEligible || !plan.trialDays) badRequest("This plan has no trial");

    const now = new Date();
    const updated = await tx.subscription.update({
      where: { id: sub.id },
      data: {
        state: "TRIALING",
        planId: plan.id,
        entitlements: entitlementsOf(plan),
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + plan.trialDays * 86400_000),
        trialUsedAt: now,
      },
    });
    await tx.reseller.update({ where: { id: resellerId }, data: { onboardingStep: "SITE" } });
    await audit(tx, { actorUserId, action: "subscription.trial_started", targetType: "Subscription", targetId: sub.id, resellerId });
    return updated;
  });
}

export async function checkoutSubscription(resellerId: string, input: { planId: string; idempotencyKey: string } & Payer) {
  const existingOrder = await prisma.order.findUnique({
    where: { resellerId_requestIdempotencyKey: { resellerId, requestIdempotencyKey: input.idempotencyKey } },
  });
  const order =
    existingOrder ??
    (await prisma.$transaction(async (tx) => {
      const reseller = await tx.reseller.findUniqueOrThrow({ where: { id: resellerId } });
      if (reseller.status !== "ACTIVE") forbidden("Account must be active to purchase a plan");
      const plan = await tx.platformPlan.findFirst({ where: { id: input.planId, active: true } });
      if (!plan) notFound("Plan not found");
      const sub = await ensureSubscription(tx, resellerId);
      const snapshot = planSnapshot(plan);
      const invoice = await tx.subscriptionInvoice.create({
        data: {
          resellerId,
          subscriptionId: sub.id,
          planId: plan.id,
          planSnapshot: snapshot,
          amountTzs: plan.priceTzs,
          periodDays: plan.periodDays,
        },
      });
      return tx.order.create({
        data: {
          purpose: "PLATFORM_SUBSCRIPTION",
          resellerId,
          invoiceId: invoice.id,
          amountTzs: plan.priceTzs,
          priceSnapshot: snapshot,
          requestIdempotencyKey: input.idempotencyKey,
        },
      });
    }));
  const attempt = await ensurePaymentAttempt(order.id, input);
  return { orderId: order.id, invoiceId: order.invoiceId, payment: { state: attempt.state, lastError: attempt.lastError } };
}

/** Fulfillment for a verified PLATFORM_SUBSCRIPTION receipt; safe to call repeatedly. */
export async function activateSubscriptionForOrder(orderId: string, paymentAttemptId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (!order.invoiceId || order.paymentState === "UNPAID") return "not_paid";
    await tx.$queryRaw`SELECT id FROM "SubscriptionInvoice" WHERE id = ${order.invoiceId}::uuid FOR UPDATE`;
    const invoice = await tx.subscriptionInvoice.findUniqueOrThrow({ where: { id: order.invoiceId } });
    if (invoice.status === "PAID") return "already_active";

    const priorPaid = await tx.subscriptionInvoice.count({ where: { resellerId: invoice.resellerId, status: "PAID" } });
    const sub = await tx.subscription.findUniqueOrThrow({ where: { id: invoice.subscriptionId } });
    const now = new Date();
    // Renewal policy: extend from the later of now and the current paid period end.
    const start =
      sub.state === "ACTIVE" && sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
    const end = new Date(start.getTime() + invoice.periodDays * 86400_000);
    const plan = await tx.platformPlan.findUniqueOrThrow({ where: { id: invoice.planId } });

    await tx.subscriptionInvoice.update({
      where: { id: invoice.id },
      data: { status: "PAID", paidAt: now, periodStart: start, periodEnd: end, isFirstPayment: priorPaid === 0 },
    });
    await tx.subscription.update({
      where: { id: sub.id },
      data: {
        state: "ACTIVE",
        planId: plan.id,
        entitlements: entitlementsOf(plan),
        currentPeriodStart: sub.state === "ACTIVE" ? sub.currentPeriodStart : start,
        currentPeriodEnd: end,
      },
    });
    await tx.order.update({ where: { id: order.id }, data: { fulfillmentState: "FULFILLED" } });
    await tx.reseller.updateMany({ where: { id: invoice.resellerId, onboardingStep: { in: ["PROFILE", "PLAN"] } }, data: { onboardingStep: "SITE" } });
    await emitOutbox(tx, OutboxEventType.SUBSCRIPTION_ACTIVATED, "SubscriptionInvoice", invoice.id, {
      invoiceId: invoice.id,
      paymentAttemptId,
    });
    await audit(tx, {
      action: "subscription.activated",
      targetType: "Subscription",
      targetId: sub.id,
      resellerId: invoice.resellerId,
      metadata: { invoiceId: invoice.id, periodEnd: end.toISOString(), firstPayment: priorPaid === 0 },
    });
    return "activated";
  });
}

/** Scheduled: mark lapsed subscriptions PAST_DUE (during grace period) or EXPIRED. Existing paid WiFi grants remain honoured. */
export async function expireSubscriptions(now = new Date()) {
  const graceThreshold = new Date(now.getTime() - SUBSCRIPTION_GRACE_PERIOD_DAYS * 86400_000);
  const pastDueRes = await prisma.subscription.updateMany({
    where: { state: "ACTIVE", currentPeriodEnd: { lt: now, gte: graceThreshold } },
    data: { state: "PAST_DUE" },
  });
  const expiredRes = await prisma.subscription.updateMany({
    where: {
      OR: [
        { state: "ACTIVE", currentPeriodEnd: { lt: graceThreshold } },
        { state: "PAST_DUE", currentPeriodEnd: { lt: graceThreshold } },
        { state: "TRIALING", currentPeriodEnd: { lt: now } },
      ],
    },
    data: { state: "EXPIRED" },
  });
  return pastDueRes.count + expiredRes.count;
}

/** New customer sales/grants require an active or trialing subscription. */
export async function assertCanSell(resellerId: string) {
  const sub = await prisma.subscription.findUnique({ where: { resellerId } });
  const reseller = await prisma.reseller.findUnique({ where: { id: resellerId } });
  const ok =
    reseller?.status === "ACTIVE" &&
    sub &&
    (sub.state === "ACTIVE" || sub.state === "TRIALING") &&
    (!sub.currentPeriodEnd || sub.currentPeriodEnd > new Date());
  return Boolean(ok);
}

export async function currentEntitlements(resellerId: string): Promise<Entitlements | null> {
  const sub = await prisma.subscription.findUnique({ where: { resellerId } });
  if (!sub || !(sub.state === "ACTIVE" || sub.state === "TRIALING")) return null;
  if (sub.currentPeriodEnd && sub.currentPeriodEnd < new Date()) return null;
  return (sub.entitlements as Entitlements | null) ?? null;
}
