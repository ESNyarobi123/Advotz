import { prisma } from "@advo/db";
import { walletSummary } from "../ledger/ledger.service.js";
import { outboxStats } from "../outbox/outbox.dispatcher.js";
import { getSubscriptionView } from "../subscriptions/subscriptions.service.js";

/** Start of "today" in Africa/Dar_es_Salaam (UTC+3, no DST). */
function startOfDarDay(now = new Date()) {
  const offsetMs = 3 * 3600_000;
  const local = new Date(now.getTime() + offsetMs);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offsetMs);
}

async function paidSales(where: { resellerId?: string; since?: Date; siteId?: string }) {
  const agg = await prisma.order.aggregate({
    where: {
      purpose: "WIFI_PACKAGE",
      paymentState: { in: ["PAID", "OVERPAID"] },
      resellerId: where.resellerId,
      siteId: where.siteId,
      paidAt: where.since ? { gte: where.since } : undefined,
    },
    _sum: { amountTzs: true },
    _count: true,
  });
  return { count: agg._count, amountTzs: agg._sum.amountTzs ?? 0n };
}

/**
 * `YYYY-MM-DD` for the Africa/Dar_es_Salaam calendar day that `d` falls in.
 * Tanzania has no DST, so a fixed +3h shift is exact.
 */
function darDayKey(d: Date) {
  return new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}

/** Number of days on the overview trend chart. */
const TREND_DAYS = 14;
/** How many rows the overview's ranked breakdowns return. */
const BREAKDOWN_LIMIT = 6;

/** Largest amount first. */
function byAmountDesc<T extends { amountTzs: bigint }>(a: T, b: T) {
  return b.amountTzs === a.amountTzs ? 0 : b.amountTzs > a.amountTzs ? 1 : -1;
}

type Ranked = { count: number; amountTzs: bigint };

/**
 * These breakdowns are aggregated over **every** order for the reseller.
 *
 * The dashboard used to derive them from `/reseller/orders`, which is capped at
 * 100 rows — so a reseller with more history saw a payment mix and site ranking
 * that silently disagreed with the KPI totals above them.
 */
async function paidSalesBySite(resellerId: string, siteId?: string) {
  const rows = await prisma.order.groupBy({
    by: ["siteId"],
    where: {
      purpose: "WIFI_PACKAGE",
      paymentState: { in: ["PAID", "OVERPAID"] },
      resellerId,
      ...(siteId ? { siteId } : {}),
    },
    _sum: { amountTzs: true },
    _count: true,
  });
  const ranked = rows
    .map((row) => ({ key: row.siteId, count: row._count, amountTzs: row._sum.amountTzs ?? 0n }))
    .sort(byAmountDesc)
    .slice(0, BREAKDOWN_LIMIT);

  const sites = await prisma.site.findMany({
    where: { id: { in: ranked.map((r) => r.key).filter((id): id is string => id !== null) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(sites.map((site) => [site.id, site.name]));

  return ranked.map((row) => ({
    site: row.key ? nameById.get(row.key) ?? "Bila eneo" : "Bila eneo",
    count: row.count,
    amountTzs: row.amountTzs,
  }));
}

async function paidSalesByPackage(resellerId: string, siteId?: string) {
  const rows = await prisma.order.groupBy({
    by: ["packageRevisionId"],
    where: {
      purpose: "WIFI_PACKAGE",
      paymentState: { in: ["PAID", "OVERPAID"] },
      resellerId,
      ...(siteId ? { siteId } : {}),
    },
    _sum: { amountTzs: true },
    _count: true,
  });
  const ranked = rows
    .map((row) => ({ key: row.packageRevisionId, count: row._count, amountTzs: row._sum.amountTzs ?? 0n }))
    .sort(byAmountDesc)
    .slice(0, BREAKDOWN_LIMIT);

  const revisions = await prisma.packageRevision.findMany({
    where: { id: { in: ranked.map((r) => r.key).filter((id): id is string => id !== null) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(revisions.map((revision) => [revision.id, revision.name]));

  return ranked.map((row) => ({
    package: row.key ? nameById.get(row.key) ?? "Kifurushi" : "Kifurushi",
    count: row.count,
    amountTzs: row.amountTzs,
  }));
}

/** Every payment state in scope, including the ones that are not paid. */
async function orderPaymentMix(resellerId: string, siteId?: string) {
  const rows = await prisma.order.groupBy({
    by: ["paymentState"],
    where: { purpose: "WIFI_PACKAGE", resellerId, ...(siteId ? { siteId } : {}) },
    _sum: { amountTzs: true },
    _count: true,
  });
  return rows
    .map((row): Ranked & { state: string } => ({
      state: row.paymentState,
      count: row._count,
      amountTzs: row._sum.amountTzs ?? 0n,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Paid Wi-Fi sales for the last `days` days, bucketed by Dar day.
 *
 * Every day in the window is emitted, including days with no sales, so the
 * chart has a continuous axis instead of collapsing the gaps.
 */
async function paidSalesDaily(resellerId: string, days: number, siteId?: string) {
  const today = startOfDarDay();
  const from = new Date(today.getTime() - (days - 1) * 86_400_000);
  const rows = await prisma.order.findMany({
    where: {
      purpose: "WIFI_PACKAGE",
      paymentState: { in: ["PAID", "OVERPAID"] },
      resellerId,
      ...(siteId ? { siteId } : {}),
      paidAt: { gte: from },
    },
    select: { amountTzs: true, paidAt: true },
  });

  const buckets = new Map<string, { count: number; amountTzs: bigint }>();
  for (const row of rows) {
    if (!row.paidAt) continue;
    const key = darDayKey(row.paidAt);
    const bucket = buckets.get(key) ?? { count: 0, amountTzs: 0n };
    bucket.count += 1;
    bucket.amountTzs += row.amountTzs;
    buckets.set(key, bucket);
  }

  return Array.from({ length: days }, (_, i) => {
    const day = darDayKey(new Date(from.getTime() + i * 86_400_000));
    const bucket = buckets.get(day);
    return { day, count: bucket?.count ?? 0, amountTzs: bucket?.amountTzs ?? 0n };
  });
}

export async function resellerOverview(resellerId: string, siteId?: string) {
  const today = startOfDarDay();
  const siteFilter = siteId ? { siteId } : {};
  const [
    reseller,
    subscription,
    wallet,
    salesToday,
    salesAll,
    salesDaily,
    sites,
    packages,
    attention,
    salesBySite,
    salesByPackage,
    paymentMix,
    totalDevices,
    totalPackages,
  ] = await Promise.all([
    prisma.reseller.findUniqueOrThrow({
      where: { id: resellerId },
      select: { businessName: true, status: true, onboardingStep: true, slug: true },
    }),
    getSubscriptionView(resellerId),
    walletSummary("RESELLER", resellerId),
    paidSales({ resellerId, since: today, siteId }),
    paidSales({ resellerId, siteId }),
    paidSalesDaily(resellerId, TREND_DAYS, siteId),
    prisma.site.findMany({
      where: { resellerId, archivedAt: null },
      select: { id: true, name: true, state: true, slug: true },
    }),
    prisma.wifiPackage.count({
      where: {
        resellerId,
        status: "ACTIVE",
        ...(siteId ? { assignments: { some: { siteId } } } : {}),
      },
    }),
    prisma.order.count({
      where: {
        resellerId,
        ...siteFilter,
        OR: [{ fulfillmentState: "NEEDS_REVIEW" }, { paymentState: "NEEDS_REVIEW" }],
      },
    }),
    paidSalesBySite(resellerId, siteId),
    paidSalesByPackage(resellerId, siteId),
    orderPaymentMix(resellerId, siteId),
    prisma.device.count({ where: { resellerId } }),
    prisma.wifiPackage.count({ where: { resellerId, status: "ACTIVE" } }),
  ]);
  const [activeGrants, devices, pendingClaims] = await Promise.all([
    prisma.accessGrant.count({
      where: { resellerId, state: "ACTIVE", expiresAt: { gt: new Date() }, ...siteFilter },
    }),
    prisma.device.count({ where: { resellerId, ...siteFilter } }),
    prisma.deviceClaim.count({ where: { resellerId, state: "SUBMITTED", ...siteFilter } }),
  ]);
  const scopedSite = siteId ? sites.find((s) => s.id === siteId) ?? null : null;
  return {
    reseller,
    subscription: {
      state: subscription.state,
      plan: subscription.plan?.name ?? null,
      currentPeriodEnd: subscription.currentPeriodEnd,
    },
    wallet,
    salesToday,
    salesAllTime: salesAll,
    salesDaily,
    salesBySite,
    salesByPackage,
    paymentMix,
    activeGrants,
    sites,
    deviceCount: devices,
    pendingClaims,
    packageCount: packages,
    ordersNeedingReview: attention,
    scope: { siteId: scopedSite?.id ?? null, siteName: scopedSite?.name ?? null },
    totals: { sites: sites.length, devices: totalDevices, packages: totalPackages },
  };
}

export async function resellerOrders(resellerId: string, take = 100, siteId?: string) {
  return prisma.order.findMany({
    where: { resellerId, purpose: "WIFI_PACKAGE", ...(siteId ? { siteId } : {}) },
    include: {
      customer: { select: { phone: true, firstName: true, lastName: true } },
      site: { select: { name: true } },
      attempts: { select: { state: true, lastError: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
      grant: { select: { id: true, state: true, expiresAt: true } },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(take, 500),
  });
}

export async function resellerCustomers(resellerId: string, siteId?: string) {
  const customers = await prisma.customer.findMany({
    where: {
      resellerId,
      ...(siteId
        ? {
            orders: {
              some: {
                siteId,
                purpose: "WIFI_PACKAGE" as const,
                paymentState: { in: ["PAID", "OVERPAID"] },
              },
            },
          }
        : {}),
    },
    include: {
      orders: {
        where: {
          purpose: "WIFI_PACKAGE",
          paymentState: { in: ["PAID", "OVERPAID"] },
          ...(siteId ? { siteId } : {}),
        },
        select: { amountTzs: true, paidAt: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  return customers.map((c) => ({
    id: c.id,
    phone: c.phone,
    name: [c.firstName, c.lastName].filter(Boolean).join(" "),
    purchases: c.orders.length,
    totalTzs: c.orders.reduce((a, o) => a + o.amountTzs, 0n),
    lastPurchaseAt: c.orders.map((o) => o.paidAt).filter(Boolean).sort().at(-1) ?? null,
  }));
}

export async function agentOverview(agentId: string) {
  const [agent, leads, attributions, wallet, accruals] = await Promise.all([
    prisma.agent.findUniqueOrThrow({ where: { id: agentId }, include: { user: { select: { name: true, email: true } } } }),
    prisma.lead.groupBy({ by: ["status"], where: { agentId }, _count: true }),
    prisma.referralAttribution.findMany({
      where: { agentId },
      include: { reseller: { select: { id: true, businessName: true, status: true, createdAt: true, subscription: { select: { state: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
    walletSummary("AGENT", agentId),
    prisma.commissionAccrual.groupBy({ by: ["state"], where: { agentId }, _sum: { amountTzs: true }, _count: true }),
  ]);
  return {
    agent: { name: agent.user.name, email: agent.user.email, referralCode: agent.referralCode, status: agent.status },
    leads: Object.fromEntries(leads.map((l) => [l.status, l._count])),
    referredResellers: attributions.map((a) => ({
      businessName: a.reseller.businessName,
      status: a.reseller.status,
      subscriptionState: a.reseller.subscription?.state ?? "NONE",
      source: a.source,
      since: a.effectiveAt,
    })),
    wallet,
    commissions: accruals.map((a) => ({ state: a.state, count: a._count, amountTzs: a._sum.amountTzs ?? 0n })),
  };
}

export async function agentLeads(agentId: string) {
  return prisma.lead.findMany({
    where: { agentId },
    include: { invitation: { select: { expiresAt: true, acceptedAt: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function agentCommissions(agentId: string) {
  return prisma.commissionAccrual.findMany({
    where: { agentId },
    include: { reseller: { select: { businessName: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function adminOverview() {
  const today = startOfDarDay();
  const [resellers, agents, activeSubs, trialing, salesToday, subsRevenue, pendingClaims, pendingWithdrawals, needsReview, controllers, outbox, quarantined] =
    await Promise.all([
      prisma.reseller.groupBy({ by: ["status"], _count: true }),
      prisma.agent.count({ where: { status: "ACTIVE" } }),
      prisma.subscription.count({ where: { state: "ACTIVE" } }),
      prisma.subscription.count({ where: { state: "TRIALING" } }),
      paidSales({ since: today }),
      prisma.subscriptionInvoice.aggregate({ where: { status: "PAID", paidAt: { gte: today } }, _sum: { amountTzs: true }, _count: true }),
      prisma.deviceClaim.count({ where: { state: "SUBMITTED" } }),
      prisma.withdrawal.count({ where: { state: "REQUESTED" } }),
      prisma.paymentAttempt.count({ where: { state: "NEEDS_REVIEW" } }),
      prisma.controller.findMany({ select: { id: true, name: true, mode: true, healthStatus: true, lastHealthAt: true } }),
      outboxStats(),
      prisma.webhookInboxEvent.count({ where: { state: "QUARANTINED" } }),
    ]);
  return {
    resellers: Object.fromEntries(resellers.map((r) => [r.status, r._count])),
    activeAgents: agents,
    subscriptions: { active: activeSubs, trialing },
    wifiSalesToday: salesToday,
    subscriptionRevenueToday: { count: subsRevenue._count, amountTzs: subsRevenue._sum.amountTzs ?? 0n },
    queues: { pendingDeviceClaims: pendingClaims, pendingWithdrawals, paymentsNeedingReview: needsReview, quarantinedWebhooks: quarantined },
    controllers,
    outbox,
  };
}

export async function adminResellers() {
  return prisma.reseller.findMany({
    include: {
      owner: { select: { email: true, phone: true, name: true, emailVerifiedAt: true } },
      subscription: { select: { state: true, currentPeriodEnd: true } },
      attribution: { include: { agent: { select: { referralCode: true } } } },
      _count: { select: { sites: true, devices: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
}

/**
 * Full reseller record for the admin detail screen.
 *
 * One request feeds every tab (profile, plan, devices, payments, activity) so the
 * tabs switch without a round-trip. Money is aggregated with `_sum` rather than by
 * summing rows in the client, so a truncated list can never misstate a total.
 */
export async function adminResellerDetail(resellerId: string) {
  const reseller = await prisma.reseller.findUnique({
    where: { id: resellerId },
    include: {
      owner: {
        select: {
          id: true,
          email: true,
          phone: true,
          name: true,
          status: true,
          role: true,
          emailVerifiedAt: true,
          mfaEnabled: true,
          createdAt: true,
        },
      },
      attribution: { include: { agent: { include: { user: { select: { name: true, email: true } } } } } },
      subscription: { include: { plan: true } },
      sites: {
        orderBy: { createdAt: "desc" },
        include: { mapping: { include: { controller: { select: { name: true, mode: true, healthStatus: true } } } }, _count: { select: { devices: true } } },
      },
      devices: {
        orderBy: { createdAt: "desc" },
        take: 200,
        include: { site: { select: { name: true } }, controller: { select: { name: true } } },
      },
      _count: { select: { sites: true, devices: true, customers: true, orders: true, packages: true, voucherGroups: true } },
    },
  });
  if (!reseller) return null;

  const [orders, invoices, withdrawals, activity, wallet, lifetime, todaySales] = await Promise.all([
    prisma.order.findMany({
      where: { resellerId },
      orderBy: { createdAt: "desc" },
      take: 60,
      include: {
        site: { select: { name: true } },
        customer: { select: { phone: true, firstName: true, lastName: true } },
        attempts: { orderBy: { createdAt: "desc" }, take: 1, select: { provider: true, state: true, providerReference: true } },
      },
    }),
    prisma.subscriptionInvoice.findMany({ where: { resellerId }, orderBy: { createdAt: "desc" }, take: 60 }),
    prisma.withdrawal.findMany({ where: { ownerType: "RESELLER", ownerId: resellerId }, orderBy: { createdAt: "desc" }, take: 40 }),
    prisma.auditEvent.findMany({
      where: { resellerId },
      orderBy: { createdAt: "desc" },
      take: 60,
      include: { actor: { select: { email: true, role: true } } },
    }),
    walletSummary("RESELLER", resellerId),
    prisma.order.aggregate({
      where: { resellerId, purpose: "WIFI_PACKAGE", paymentState: { in: ["PAID", "OVERPAID"] } },
      _sum: { amountTzs: true },
      _count: true,
    }),
    paidSales({ resellerId, since: startOfDarDay() }),
  ]);

  const subscriptionRevenue = await prisma.subscriptionInvoice.aggregate({
    where: { resellerId, status: "PAID" },
    _sum: { amountTzs: true },
    _count: true,
  });

  return {
    reseller,
    wallet,
    kpis: {
      guestRevenueTzs: lifetime._sum.amountTzs ?? 0n,
      guestOrders: lifetime._count,
      todayRevenueTzs: todaySales.amountTzs,
      todayOrders: todaySales.count,
      subscriptionPaidTzs: subscriptionRevenue._sum.amountTzs ?? 0n,
      subscriptionInvoices: subscriptionRevenue._count,
    },
    orders,
    invoices,
    withdrawals,
    activity,
  };
}

/**
 * Agent list for the admin screen.
 *
 * Commission figures are rolled up server-side with grouped aggregates rather than
 * by shipping every accrual row, so the payload stays flat as the network grows.
 */
export async function adminAgents() {
  const [agents, commission, activeReferrals] = await Promise.all([
    prisma.agent.findMany({
      include: {
        user: { select: { name: true, email: true, phone: true, status: true } },
        _count: { select: { attributions: true, leads: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.commissionAccrual.groupBy({
      by: ["agentId"],
      _sum: { amountTzs: true, paidTzs: true },
      _count: true,
    }),
    prisma.referralAttribution.groupBy({
      by: ["agentId"],
      where: { reseller: { status: "ACTIVE" } },
      _count: true,
    }),
  ]);

  const commissionByAgent = new Map(commission.map((row) => [row.agentId, row]));
  const activeByAgent = new Map(activeReferrals.map((row) => [row.agentId, row._count]));

  return agents.map((agent) => {
    const rollup = commissionByAgent.get(agent.id);
    return {
      ...agent,
      commission: {
        creditedTzs: rollup?._sum.amountTzs ?? 0n,
        paidTzs: rollup?._sum.paidTzs ?? 0n,
        accrualCount: rollup?._count ?? 0,
      },
      activeReferrals: activeByAgent.get(agent.id) ?? 0,
    };
  });
}

/**
 * Full agent record for the admin detail screen.
 *
 * Mirrors `adminResellerDetail`: one request feeds every tab (profile, referrals,
 * commissions, leads, payouts, activity) and money is aggregated server-side with
 * `_sum` so a truncated row list can never misstate a total.
 */
export async function adminAgentDetail(agentId: string) {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          phone: true,
          name: true,
          status: true,
          role: true,
          emailVerifiedAt: true,
          mfaEnabled: true,
          createdAt: true,
        },
      },
      _count: { select: { attributions: true, leads: true, invitations: true, policies: true } },
    },
  });
  if (!agent) return null;

  const [wallet, referrals, leads, accruals, policies, withdrawals, earning, activity, leadStatuses] = await Promise.all([
    walletSummary("AGENT", agentId),
    prisma.referralAttribution.findMany({
      where: { agentId },
      orderBy: { effectiveAt: "desc" },
      take: 100,
      include: {
        reseller: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            status: true,
            createdAt: true,
            subscription: { select: { state: true, currentPeriodEnd: true } },
            _count: { select: { orders: true } },
          },
        },
      },
    }),
    prisma.lead.findMany({
      where: { agentId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { invitation: { select: { expiresAt: true, acceptedAt: true } } },
    }),
    prisma.commissionAccrual.findMany({
      where: { agentId },
      orderBy: { createdAt: "desc" },
      take: 60,
      include: { reseller: { select: { businessName: true } } },
    }),
    prisma.commissionPolicy.findMany({
      where: { OR: [{ agentId }, { agentId: null }] },
      orderBy: [{ effectiveFrom: "desc" }],
      take: 20,
    }),
    prisma.withdrawal.findMany({ where: { ownerType: "AGENT", ownerId: agentId }, orderBy: { createdAt: "desc" }, take: 40 }),
    prisma.commissionAccrual.aggregate({ where: { agentId }, _sum: { amountTzs: true, paidTzs: true }, _count: true }),
    prisma.auditEvent.findMany({
      where: { OR: [{ targetType: "Agent", targetId: agentId }, { action: { startsWith: "agent." }, targetId: agentId }] },
      orderBy: { createdAt: "desc" },
      take: 60,
      include: { actor: { select: { email: true, role: true } } },
    }),
    prisma.lead.groupBy({ by: ["status"], where: { agentId }, _count: true }),
  ]);

  const activeReferrals = referrals.filter((r) => r.reseller.status === "ACTIVE").length;
  const paidAccruals = accruals.filter((a) => a.state === "PAID").length;
  const leadsConverted = leadStatuses.find((l) => l.status === "ACCEPTED")?._count ?? 0;
  const leadsTotal = leadStatuses.reduce((sum, l) => sum + l._count, 0);

  return {
    agent,
    wallet,
    kpis: {
      /** Lifetime commission ever credited to this agent. */
      creditedTzs: earning._sum.amountTzs ?? 0n,
      creditedCount: earning._count,
      paidTzs: earning._sum.paidTzs ?? 0n,
      paidCount: paidAccruals,
      referrals: referrals.length,
      activeReferrals,
      leadsTotal,
      leadsConverted,
    },
    referrals,
    leads,
    accruals,
    policies,
    withdrawals,
    activity,
  };
}

export async function auditLog(filter: { resellerId?: string; action?: string; take?: number }) {
  return prisma.auditEvent.findMany({
    where: { resellerId: filter.resellerId, action: filter.action ? { startsWith: filter.action } : undefined },
    include: { actor: { select: { email: true, role: true } } },
    orderBy: { createdAt: "desc" },
    take: Math.min(filter.take ?? 100, 500),
  });
}
