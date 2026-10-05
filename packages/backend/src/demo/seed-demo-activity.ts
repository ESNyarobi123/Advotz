import { prisma } from "@advo/db";
import { getPaymentProvider } from "../common/providers.js";
import { createVoucherGroup } from "../modules/catalog/vouchers.service.js";
import { agentAccount, platformAccount, postJournal, resellerAccount, type AccountRef } from "../modules/ledger/ledger.service.js";
import { saleFeeBasisPoints, withdrawalFeeTzs } from "../modules/settings/settings.service.js";

/**
 * Demo activity for the reseller dashboards.
 *
 * The base seed only creates accounts and a plan, so every dashboard renders a
 * wall of zeros. This adds the records a working Reseller would already have —
 * sites, packages, vouchers, customers and two weeks of paid orders — so the
 * KPIs, tables and charts show real shapes.
 *
 * Everything here is demo data: it is refused in production by the caller, and
 * the function is idempotent so re-running the seed is safe.
 */

const DAR_OFFSET_MS = 3 * 3600_000;
const TREND_DAYS = 14;

/** Midnight at the start of the current Africa/Dar_es_Salaam day. */
function startOfDarDay(now = new Date()) {
  const local = new Date(now.getTime() + DAR_OFFSET_MS);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - DAR_OFFSET_MS);
}

/** Instant for `daysAgo` days back at a Dar-local wall-clock time. */
function darInstant(daysAgo: number, hour: number, minute = 0) {
  const day = startOfDarDay().getTime() - daysAgo * 86_400_000;
  return new Date(day + hour * 3600_000 + minute * 60_000);
}

/** Deterministic LCG so repeated seeds produce the same dataset. */
function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const DEMO_SITES = [
  { name: "Café Mlimani", slug: "demo-mlimani", location: "Dar es Salaam" },
  { name: "Hoteli Bahari", slug: "demo-bahari", location: "Kigamboni" },
  { name: "Kituo cha Mbezi", slug: "demo-mbezi", location: "Mbezi Beach" },
];

const DEMO_PACKAGES = [
  { name: "Saa 6", priceTzs: 500n, durationSeconds: 6 * 3600 },
  { name: "Siku 1", priceTzs: 1_000n, durationSeconds: 86_400 },
  { name: "Siku 3", priceTzs: 2_500n, durationSeconds: 3 * 86_400 },
  { name: "Wiki 1", priceTzs: 5_000n, durationSeconds: 7 * 86_400 },
];

const DEMO_CUSTOMERS = [
  { phone: "+255712345601", firstName: "Asha", lastName: "Mwakasege" },
  { phone: "+255712345602", firstName: "Juma", lastName: "Kileo" },
  { phone: "+255712345603", firstName: "Neema", lastName: "Mushi" },
  { phone: "+255712345604", firstName: "Baraka", lastName: "Ndosi" },
  { phone: "+255712345605", firstName: "Zawadi", lastName: "Mwinyi" },
  { phone: "+255712345606", firstName: "Hamisi", lastName: "Rajabu" },
  { phone: "+255712345607", firstName: "Rehema", lastName: "Salum" },
  { phone: "+255712345608", firstName: "Emmanuel", lastName: "Lyimo" },
];

type DemoPackageRow = {
  id: string;
  revisionId: string;
  name: string;
  priceTzs: bigint;
  durationSeconds: number;
};

export async function seedDemoActivity(resellerId: string, actorUserId: string): Promise<string[]> {
  const created: string[] = [];

  if (await prisma.site.count({ where: { resellerId } })) {
    return ["demo activity already present — skipped"];
  }

  /* ── Sites ───────────────────────────────────────────────────────────── */
  const sites = [];
  for (const site of DEMO_SITES) {
    sites.push(
      await prisma.site.create({
        data: {
          resellerId,
          name: site.name,
          slug: site.slug,
          location: site.location,
          state: "READY",
          portalTitle: `${site.name} WiFi`,
          portalMessage: "Karibu! Chagua kifurushi chako cha internet.",
        },
      }),
    );
  }
  created.push(`${sites.length} sites`);

  /* ── Packages (each needs a revision) ────────────────────────────────── */
  const packages: DemoPackageRow[] = [];
  for (const pkg of DEMO_PACKAGES) {
    const row = await prisma.wifiPackage.create({ data: { resellerId, name: pkg.name } });
    const revision = await prisma.packageRevision.create({
      data: {
        packageId: row.id,
        resellerId,
        revision: 1,
        name: pkg.name,
        priceTzs: pkg.priceTzs,
        durationSeconds: pkg.durationSeconds,
        downloadKbps: 4096,
        uploadKbps: 1024,
        maxDevices: 2,
      },
    });
    await prisma.wifiPackage.update({ where: { id: row.id }, data: { currentRevisionId: revision.id } });

    packages.push({
      id: row.id,
      revisionId: revision.id,
      name: pkg.name,
      priceTzs: pkg.priceTzs,
      durationSeconds: pkg.durationSeconds,
    });

    // Offer every package at every site.
    for (const site of sites) {
      await prisma.packageSiteAssignment.create({ data: { packageId: row.id, siteId: site.id, resellerId } });
    }
  }
  created.push(`${packages.length} packages`);

  /* ── Vouchers ────────────────────────────────────────────────────────── */
  // Goes through the real service so codes get the same keyed-hash lookup and
  // encryption the redeem path expects.
  const weekly = packages[packages.length - 1]!;
  const voucherCount = 24;
  await createVoucherGroup(resellerId, actorUserId, {
    name: "Demo vouchers — Wiki 1",
    packageId: weekly.id,
    count: voucherCount,
  });
  // Mark the first few as redeemed so the screen shows a mix of states.
  const fresh = await prisma.voucher.findMany({
    where: { resellerId, state: "UNUSED" },
    orderBy: { createdAt: "asc" },
    take: 6,
    select: { id: true },
  });
  if (fresh.length > 0) {
    await prisma.voucher.updateMany({
      where: { id: { in: fresh.map((v) => v.id) } },
      data: { state: "REDEEMED", redeemedAt: new Date() },
    });
  }
  created.push(`${voucherCount} vouchers`);

  /* ── Customers ───────────────────────────────────────────────────────── */
  const customers = [];
  for (const customer of DEMO_CUSTOMERS) {
    customers.push(await prisma.customer.create({ data: { resellerId, ...customer } }));
  }
  created.push(`${customers.length} customers`);

  /* ── Orders, spread across the last two weeks ────────────────────────── */
  const random = makeRandom(20261001);
  const orders: Array<Record<string, unknown>> = [];
  let sequence = 0;

  for (let daysAgo = TREND_DAYS - 1; daysAgo >= 0; daysAgo -= 1) {
    // Uplift at the weekend so the trend line has a readable shape.
    const weekday = new Date(startOfDarDay().getTime() - daysAgo * 86_400_000).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    const count = (weekend ? 14 : 8) + Math.floor(random() * 8);

    for (let i = 0; i < count; i += 1) {
      const pkg = packages[Math.floor(random() * packages.length)]!;
      const site = sites[Math.floor(random() * sites.length)]!;
      const roll = random();
      const state = roll > 0.96 ? "NEEDS_REVIEW" : roll > 0.93 ? "REFUNDED" : "PAID";
      const paid = state === "PAID";
      const at = darInstant(daysAgo, 7 + Math.floor(random() * 14), Math.floor(random() * 60));

      orders.push({
        purpose: "WIFI_PACKAGE",
        resellerId,
        siteId: site.id,
        customerId: customers[Math.floor(random() * customers.length)]!.id,
        packageRevisionId: pkg.revisionId,
        amountTzs: pkg.priceTzs,
        priceSnapshot: { name: pkg.name, durationSeconds: pkg.durationSeconds, priceTzs: Number(pkg.priceTzs) },
        paymentState: state,
        fulfillmentState: paid ? "FULFILLED" : "NOT_STARTED",
        paidAt: paid ? at : null,
        createdAt: at,
        requestIdempotencyKey: `demo-order-${sequence++}`,
        clientMac: `02:00:${String(Math.floor(random() * 255)).padStart(2, "0")}:00:00:${String(
          Math.floor(random() * 255),
        ).padStart(2, "0")}`,
      });
    }
  }

  await prisma.order.createMany({ data: orders as never });
  created.push(`${orders.length} orders over ${TREND_DAYS} days`);

  /* ── Live access grants, so "Active Users" is not zero ───────────────── */
  const recent = await prisma.order.findMany({
    where: { resellerId, paymentState: "PAID" },
    select: { id: true, siteId: true, packageRevisionId: true, priceSnapshot: true },
    orderBy: { createdAt: "desc" },
    take: 18,
  });

  let grants = 0;
  for (const order of recent) {
    if (!order.siteId || !order.packageRevisionId) continue;
    const snapshot = order.priceSnapshot as { durationSeconds?: number } | null;
    const durationSeconds = snapshot?.durationSeconds ?? 86_400;
    const activatedAt = darInstant(Math.floor(random() * 3), 9);
    await prisma.accessGrant.create({
      data: {
        resellerId,
        siteId: order.siteId,
        orderId: order.id,
        packageRevisionId: order.packageRevisionId,
        packageSnapshot: order.priceSnapshot as never,
        durationSeconds,
        maxDevices: 2,
        state: "ACTIVE",
        activationDeadline: new Date(activatedAt.getTime() + 3600_000),
        activatedAt,
        confirmedAt: activatedAt,
        expiresAt: new Date(activatedAt.getTime() + durationSeconds * 1000),
      },
    });
    grants += 1;
  }
  created.push(`${grants} active access grants`);

  /* ── Devices, so the network counts are real ─────────────────────────── */
  for (const [index, site] of sites.entries()) {
    await prisma.device.create({
      data: {
        resellerId,
        siteId: site.id,
        mac: `E8:DE:27:00:00:${String(index + 1).padStart(2, "0")}`,
        model: "EAP225",
        hardwareVersion: "3.0",
        firmware: "5.1.0",
        observedStatus: "online",
        lastSeenAt: new Date(),
      },
    });
  }
  created.push(`${sites.length} devices`);

  return created;
}

/**
 * Payment activity for the admin payments board.
 *
 * The order seed above only records what the reseller sees; the money side
 * (`PaymentAttempt`, the receipt journal and `WebhookInboxEvent`) is what the
 * Finance screens read. Without it every payments tile is a zero and no state
 * filter has anything to show.
 *
 * Two deliberate properties:
 * - A slice of completed WiFi sales is left with **no** provider fee and gets a
 *   `RESELLER_PENDING_SETTLEMENT` receipt, so the "awaiting settlement" queue
 *   and the Settle-fee action are real and can be exercised.
 * - Every journal posted here is balanced, so the ledger's trial balance stays
 *   balanced even though the data is demo.
 *
 * Idempotent: it returns early once any attempt exists for the reseller.
 */
export async function seedDemoPayments(resellerId: string): Promise<string[]> {
  const created: string[] = [];
  if (await prisma.paymentAttempt.count({ where: { order: { resellerId } } })) {
    return ["demo payments already present — skipped"];
  }
  const random = makeRandom(20261002);
  const provider = getPaymentProvider().name;

  const paidOrders = await prisma.order.findMany({
    where: { resellerId, paymentState: { in: ["PAID", "OVERPAID", "REFUNDED", "NEEDS_REVIEW"] } },
    orderBy: { createdAt: "desc" },
    take: 84,
    select: { id: true, amountTzs: true, paymentState: true, paidAt: true, createdAt: true, siteId: true },
  });
  const openOrders = await prisma.order.findMany({
    where: { resellerId, paymentState: { in: ["UNPAID", "CANCELLED"] } },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { id: true, amountTzs: true, createdAt: true },
  });

  // Orders that were never paid get the attempts a provider leaves behind in
  // every state other than success.
  const OPEN_MIX: Array<{ state: string; error: string | null; ref: boolean }> = [
    { state: "PENDING", error: null, ref: true },
    { state: "PENDING", error: null, ref: true },
    { state: "UNKNOWN", error: "Outcome unknown beyond provider idempotency window", ref: false },
    { state: "UNKNOWN", error: null, ref: true },
    { state: "FAILED", error: "Simulated validation decline", ref: true },
    { state: "FAILED", error: "Provider rejected the request", ref: true },
    { state: "EXPIRED", error: "Customer did not confirm in time", ref: true },
    { state: "VOIDED", error: null, ref: true },
    { state: "DISPATCHING", error: null, ref: false },
    { state: "CREATED", error: null, ref: false },
  ];

  // The order seed only records paid sales, so a demo would have no in-flight,
  // failed or expired attempt to look at. Create a small batch of orders that
  // never got paid — one per state the provider can leave behind.
  if (openOrders.length < OPEN_MIX.length) {
    const site = await prisma.site.findFirst({ where: { resellerId }, select: { id: true } });
    const customer = await prisma.customer.findFirst({ where: { resellerId }, select: { id: true } });
    const revision = await prisma.packageRevision.findFirst({
      where: { resellerId },
      orderBy: { createdAt: "asc" },
      select: { id: true, priceTzs: true, name: true, durationSeconds: true },
    });
    if (site && customer && revision) {
      for (const [index, spec] of OPEN_MIX.entries()) {
        const at = darInstant(index + 1, 8 + index, 15);
        const order = await prisma.order.create({
          data: {
            purpose: "WIFI_PACKAGE",
            resellerId,
            siteId: site.id,
            customerId: customer.id,
            packageRevisionId: revision.id,
            amountTzs: revision.priceTzs,
            priceSnapshot: {
              name: revision.name,
              durationSeconds: revision.durationSeconds,
              priceTzs: Number(revision.priceTzs),
            },
            paymentState: "UNPAID",
            fulfillmentState: "NOT_STARTED",
            requestIdempotencyKey: `demo-open-order-${index}`,
            clientMac: `02:00:AA:00:00:${String(index + 1).padStart(2, "0")}`,
            createdAt: at,
          },
          select: { id: true, amountTzs: true, createdAt: true },
        });
        openOrders.push(order);
      }
    }
  }

  const saleFeeBps = 500n; // Matches the 5 % demo sale fee the seed sets.
  const attempts: Array<Record<string, unknown>> = [];
  const journals: Array<{
    sourceKey: string;
    sourceType: string;
    lines: Array<{ account: AccountRef; debit?: bigint; credit?: bigint }>;
    description: string;
  }> = [];
  const inbox: Array<Record<string, unknown>> = [];
  let sequence = 0;
  let completed = 0;
  let unsettled = 0;

  const attemptId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

  for (const order of paidOrders) {
    const id = attemptId(++sequence);
    const reference = `pi_fake_demo_${String(sequence).padStart(6, "0")}`;
    const reference2 = `pi_fake_demo_${String(sequence).padStart(6, "0")}b`;
    const at = order.paidAt ?? order.createdAt;
    const amount = order.amountTzs;
    const mismatch = order.paymentState === "NEEDS_REVIEW";

    if (mismatch) {
      // The provider reported a different amount: the attempt can never be
      // silently completed, it waits for an operator.
      attempts.push({
        id,
        orderId: order.id,
        provider,
        providerAccountId: `${provider}-merchant`,
        providerReference: reference,
        idempotencyKey: `demo-attempt-${sequence}`,
        requestHash: `demo-${sequence}`,
        requestPayload: { demo: true, amountTzs: Number(amount) },
        state: "NEEDS_REVIEW",
        amountReceivedTzs: amount + 250n,
        feeTzs: null,
        lastError: `PAYMENT_AMOUNT_MISMATCH: expected ${amount} TZS, got ${amount + 250n} TZS`,
        createdAt: at,
        lastCheckedAt: at,
      });
      inbox.push({
        provider,
        providerAccountId: `${provider}-merchant`,
        eventId: `evt_demo_${sequence}`,
        eventType: "payment.completed",
        payload: { demo: true, reference },
        payloadHash: `demo-hash-${sequence}`,
        state: "QUARANTINED",
        reason: `AMOUNT_MISMATCH: expected ${amount} TZS, got ${amount + 250n} TZS`,
        attempts: 1,
        receivedAt: at,
      });
      continue;
    }

    // Every ninth completed sale arrived without the provider fee, so its money
    // is held pending settlement — the queue an operator must clear.
    const fee = sequence % 9 === 0 ? null : (amount * 2n) / 100n;
    completed += 1;
    attempts.push({
      id,
      orderId: order.id,
      provider,
      providerAccountId: `${provider}-merchant`,
      providerReference: reference,
      idempotencyKey: `demo-attempt-${sequence}`,
      requestHash: `demo-${sequence}`,
      requestPayload: { demo: true, amountTzs: Number(amount) },
      state: "COMPLETED",
      amountReceivedTzs: amount,
      feeTzs: fee,
      completedAt: at,
      lastCheckedAt: at,
      createdAt: new Date(at.getTime() - 90_000),
    });

    if (fee === null) {
      unsettled += 1;
      const platformFee = (amount * saleFeeBps) / 10_000n;
      journals.push({
        sourceKey: `payment:${id}`,
        sourceType: "wifi_sale_receipt",
        description: `WiFi package sale (order ${order.id})`,
        lines: [
          { account: platformAccount("PROVIDER_CLEARING"), debit: amount },
          { account: resellerAccount(resellerId, "RESELLER_PENDING_SETTLEMENT"), credit: amount - platformFee },
          { account: platformAccount("PLATFORM_SALE_FEE_REVENUE"), credit: platformFee },
        ],
      });
    } else if (sequence % 3 === 0) {
      const platformFee = (amount * saleFeeBps) / 10_000n;
      journals.push({
        sourceKey: `payment:${id}`,
        sourceType: "wifi_sale_receipt",
        description: `WiFi package sale (order ${order.id})`,
        lines: [
          { account: platformAccount("PROVIDER_CLEARING"), debit: amount },
          { account: platformAccount("PROVIDER_CLEARING"), credit: fee },
          { account: resellerAccount(resellerId, "RESELLER_PAYABLE"), credit: amount - fee - platformFee },
          { account: platformAccount("PLATFORM_SALE_FEE_REVENUE"), credit: platformFee },
        ],
      });
    }

    inbox.push({
      provider,
      providerAccountId: `${provider}-merchant`,
      eventId: `evt_demo_${sequence}`,
      eventType: "payment.completed",
      payload: { demo: true, reference },
      payloadHash: `demo-hash-${sequence}`,
      state: "PROCESSED",
      reason: null,
      attempts: 1,
      receivedAt: at,
      processedAt: new Date(at.getTime() + 2_000),
    });

    // An overpaid order carries a second, duplicate receipt that must never grant twice.
    if (order.paymentState === "OVERPAID") {
      const dupId = attemptId(++sequence);
      attempts.push({
        id: dupId,
        orderId: order.id,
        provider,
        providerAccountId: `${provider}-merchant`,
        providerReference: reference2,
        idempotencyKey: `demo-attempt-${sequence}`,
        requestHash: `demo-${sequence}`,
        requestPayload: { demo: true, duplicate: true },
        state: "COMPLETED",
        amountReceivedTzs: amount,
        feeTzs: (amount * 2n) / 100n,
        completedAt: new Date(at.getTime() + 600_000),
        createdAt: new Date(at.getTime() + 590_000),
      });
      inbox.push({
        provider,
        providerAccountId: `${provider}-merchant`,
        eventId: `evt_demo_${sequence}`,
        eventType: "payment.completed",
        payload: { demo: true, reference: reference2 },
        payloadHash: `demo-hash-${sequence}`,
        state: "IGNORED",
        reason: "order already paid",
        attempts: 1,
        receivedAt: new Date(at.getTime() + 600_000),
      });
    }
  }

  openOrders.forEach((order, index) => {
    const spec = OPEN_MIX[index % OPEN_MIX.length]!;
    sequence += 1;
    const id = attemptId(sequence);
    const reference = spec.ref ? `pi_fake_demo_${String(sequence).padStart(6, "0")}` : null;
    const createdAt = order.createdAt;
    attempts.push({
      id,
      orderId: order.id,
      provider,
      providerAccountId: `${provider}-merchant`,
      providerReference: reference,
      idempotencyKey: `demo-attempt-${sequence}`,
      requestHash: `demo-${sequence}`,
      requestPayload: { demo: true },
      state: spec.state,
      amountReceivedTzs: null,
      feeTzs: null,
      lastError: spec.error,
      expiresAt: new Date(createdAt.getTime() + 3_600_000),
      lastCheckedAt: spec.state === "UNKNOWN" ? createdAt : null,
      createdAt,
    });
    if (index % 3 === 0) {
      // Terminal states only: the outbox worker would rewrite a RECEIVED or
      // FAILED demo event on its next pass and the demo numbers would drift.
      const quarantined = index % 6 === 0;
      inbox.push({
        provider,
        providerAccountId: `${provider}-merchant`,
        eventId: `evt_demo_${sequence}`,
        eventType: "payment.failed",
        payload: { demo: true, reference },
        payloadHash: `demo-hash-${sequence}`,
        state: quarantined ? "QUARANTINED" : "IGNORED",
        reason: quarantined
          ? "Schema validation failed"
          : "attempt already terminal — nothing to apply",
        attempts: quarantined ? 1 : 0,
        receivedAt: createdAt,
        processedAt: new Date(createdAt.getTime() + 1_500),
      });
    }
  });

  await prisma.paymentAttempt.createMany({ data: attempts as never });
  if (inbox.length > 0) await prisma.webhookInboxEvent.createMany({ data: inbox as never });
  for (const entry of journals) {
    await postJournal(prisma, {
      sourceKey: entry.sourceKey,
      sourceType: entry.sourceType,
      description: entry.description,
      actorUserId: null,
      lines: entry.lines as never,
    });
  }
  created.push(`${attempts.length} payment attempts (${completed} completed, ${unsettled} awaiting settlement)`);
  created.push(`${inbox.length} webhook events`);

  return created;
}

/**
 * Receipts for the paid orders the payments seed's window did not reach.
 *
 * `seedDemoPayments` deliberately caps itself at the 84 most recent sales, which
 * left the rest of the reseller's paid orders with no money behind them — and
 * therefore a payable balance far too small to support a realistic payout
 * history. This closes that gap using the same posting shape as the live receipt
 * path (`platform/PROVIDER_CLEARING` debit, provider fee credit, reseller
 * payable and platform revenue credits), so the payments board, the reseller
 * wallet and the ledger all agree.
 *
 * Idempotent: it only ever looks at paid orders that still have no attempt, so a
 * second run finds nothing to do.
 */
export async function backfillSettledReceipts(resellerId: string): Promise<string[]> {
  const orders = await prisma.order.findMany({
    where: { resellerId, paymentState: "PAID", attempts: { none: {} } },
    select: { id: true, amountTzs: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  if (orders.length === 0) return ["no unpaid-receipt gap to close"];

  const random = makeRandom(20261003);
  const provider = getPaymentProvider().name;
  const bps = BigInt(await saleFeeBasisPoints());

  const attempts: Array<Record<string, unknown>> = [];
  const journals: JournalPosting[] = [];

  orders.forEach((order, index) => {
    const sequence = index + 1;
    const id = `c1000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
    // The provider's cut on a mobile-money collection, in basis points.
    const fee = (order.amountTzs * 25n) / 10000n;
    const platformFee = (order.amountTzs * bps) / 10000n;
    const net = order.amountTzs - fee - platformFee;
    const settledAt = new Date(order.createdAt.getTime() + 45_000 + Math.floor(random() * 90_000));

    attempts.push({
      id,
      orderId: order.id,
      provider,
      providerAccountId: `${provider}-merchant`,
      providerReference: `pi_fake_backfill_${String(sequence).padStart(6, "0")}`,
      idempotencyKey: `demo-backfill-${sequence}`,
      requestHash: `demo-backfill-${sequence}`,
      requestPayload: { demo: true },
      state: "COMPLETED",
      amountReceivedTzs: order.amountTzs,
      feeTzs: fee,
      completedAt: settledAt,
      lastCheckedAt: settledAt,
      expiresAt: new Date(order.createdAt.getTime() + 3_600_000),
      createdAt: new Date(order.createdAt.getTime() + 5_000 + Math.floor(random() * 30_000)),
    });

    journals.push({
      sourceKey: `payment:${id}`,
      sourceType: "wifi_sale_receipt",
      description: `Backfilled WiFi package sale (order ${order.id})`,
      lines: [
        { account: platformAccount("PROVIDER_CLEARING"), debit: order.amountTzs },
        { account: platformAccount("PROVIDER_CLEARING"), credit: fee },
        { account: resellerAccount(resellerId, "RESELLER_PAYABLE"), credit: net },
        { account: platformAccount("PLATFORM_SALE_FEE_REVENUE"), credit: platformFee },
      ],
    });
  });

  await prisma.paymentAttempt.createMany({ data: attempts as never });
  for (const entry of journals) {
    await postJournal(prisma, {
      sourceKey: entry.sourceKey,
      sourceType: entry.sourceType,
      description: entry.description,
      actorUserId: null,
      lines: entry.lines as never,
    });
  }

  return [`${orders.length} backfilled settled receipts`];
}

// ───────────────────────────── Withdrawals ──────────────────────────────

type JournalPosting = {
  sourceKey: string;
  sourceType: string;
  description: string;
  lines: Array<{ account: AccountRef; debit?: bigint; credit?: bigint }>;
};

/** One payout request. `attempt` is the state of the provider attempt behind it, if any. */
type PayoutSpec = {
  amount: bigint;
  providerFee: bigint;
  state: string;
  /** Hours before now the request was made. */
  ageHours: number;
  attempt: string | null;
  failureReason?: string;
  reviewReason?: string;
  /** The provider charged more than quoted on settlement; the platform absorbed it. */
  absorbedFeeTzs?: bigint;
};
/**
 * Withdrawal and payout activity for the admin withdrawals board.
 *
 * The base seed only produces sales, so every payouts tile, the reserve split and
 * the whole beneficiary mix were zeros. This creates payout destinations, a
 * payout request in each state the platform can leave one in, the provider
 * attempts behind them, the Agent accruals and allocations that back them, and
 * the matching ledger movements.
 *
 * Three deliberate properties:
 * - The one-open-reserve-per-beneficiary rule is respected. `Withdrawal_active_reserve_key`
 *   allows a beneficiary at most one row in REQUESTED/APPROVED/PROCESSING/UNKNOWN/NEEDS_REVIEW,
 *   so the open states are spread across distinct beneficiaries instead of being
 *   stacked on one — which is the only honest way to show them at the same time.
 * - Every journal mirrors the live payout path line for line — reserve, release,
 *   settlement and reversal — so the trial balance stays balanced and the
 *   `WITHDRAWAL_RESERVE` balance is the real sum of unsettled payouts.
 * - Open attempts are stamped `updatedAt: now` so the on-demand sweeper does not
 *   reconcile the demo away on its next pass.
 *
 * Idempotent: it returns early once any withdrawal exists.
 */
export async function seedDemoWithdrawals(resellerId: string, primaryAgentReferral = "KASSIM2026"): Promise<string[]> {
  if (await prisma.withdrawal.count()) return ["demo withdrawals already present — skipped"];

  const provider = getPaymentProvider().name;
  const providerAccountId = `${provider}-merchant`;
  const platformWithdrawalFee = await withdrawalFeeTzs();
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, select: { id: true } });
  const created: string[] = [];
  const now = Date.now();
  const at = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000);

  const journalQueue: JournalPosting[] = [];
  const withdrawalRows: Array<Record<string, unknown>> = [];
  const attemptRows: Array<Record<string, unknown>> = [];
  const allocationRows: Array<Record<string, unknown>> = [];
  const reservedByAccrual = new Map<string, bigint>();
  const paidByAccrual = new Map<string, bigint>();
  let attemptSequence = 0;

  /** Mirrors the live withdraw → settle paths, which is what keeps the ledger honest. */
  function payoutJournals(spec: PayoutSpec, withdrawalId: string, ownerType: "RESELLER" | "AGENT", ownerId: string) {
    const sourceAccountRef =
      ownerType === "RESELLER"
        ? resellerAccount(ownerId, "RESELLER_PAYABLE")
        : agentAccount(ownerId, "AGENT_AVAILABLE_PAYABLE");
    const reserve = { ownerType, ownerId, type: "WITHDRAWAL_RESERVE" } as const;
    const total = spec.amount + spec.providerFee + platformWithdrawalFee;

    journalQueue.push({
      sourceKey: `withdrawal-reserve:${withdrawalId}`,
      sourceType: "withdrawal_reserve",
      description: `Reserve for withdrawal ${withdrawalId}`,
      lines: [
        { account: sourceAccountRef, debit: total },
        { account: reserve, credit: total },
      ],
    });

    if (spec.state === "COMPLETED" || spec.state === "REVERSED") {
      const actualFee = spec.providerFee + (spec.absorbedFeeTzs ?? 0n);
      const lines: JournalPosting["lines"] = [
        { account: reserve, debit: total },
        { account: platformAccount("PROVIDER_CLEARING"), credit: spec.amount + actualFee },
        { account: platformAccount("PLATFORM_WITHDRAWAL_FEE_REVENUE"), credit: platformWithdrawalFee },
      ];
      if (actualFee > spec.providerFee) {
        // The beneficiary was never charged more than approved; the platform absorbs it.
        lines.push({ account: platformAccount("PROVIDER_FEE_EXPENSE"), debit: actualFee - spec.providerFee });
      }
      journalQueue.push({
        sourceKey: `payout-complete:${withdrawalId}`,
        sourceType: "payout_completed",
        description: `Payout completed for withdrawal ${withdrawalId}`,
        lines,
      });
    }

    if (spec.state === "REVERSED") {
      // Only the principal comes back; fees are not assumed refunded.
      journalQueue.push({
        sourceKey: `payout-reversed:${withdrawalId}`,
        sourceType: "payout_reversed",
        description: `Payout reversed for withdrawal ${withdrawalId}`,
        lines: [
          { account: platformAccount("PROVIDER_CLEARING"), debit: spec.amount },
          { account: sourceAccountRef, credit: spec.amount },
        ],
      });
    }

    if (spec.state === "FAILED" || spec.state === "REJECTED") {
      journalQueue.push({
        sourceKey: spec.state === "REJECTED" ? `withdrawal-release:${withdrawalId}` : `payout-failed:${withdrawalId}`,
        sourceType: spec.state === "REJECTED" ? "withdrawal_release" : "payout_failed",
        description:
          spec.state === "REJECTED"
            ? `Rejected withdrawal ${withdrawalId}`
            : `Payout failed for withdrawal ${withdrawalId}; reserve released`,
        lines: [
          { account: reserve, debit: total },
          { account: sourceAccountRef, credit: total },
        ],
      });
    }
  }

  /** Creates one request plus whatever attempt, allocation and journal trail it implies. */
  function buildPayout(options: {
    ownerType: "RESELLER" | "AGENT";
    ownerId: string;
    destination: { id: string; recipientName: string; phone: string; verifiedAt: Date | null };
    requestIdempotencyKey: string;
    spec: PayoutSpec;
    sequence: number;
    accrualId?: string;
  }) {
    const { ownerType, ownerId, spec, sequence } = options;
    const id = `d1000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
    const total = spec.amount + spec.providerFee + platformWithdrawalFee;
    const createdAt = at(spec.ageHours);
    const reviewed = spec.state !== "REQUESTED";

    withdrawalRows.push({
      id,
      ownerType,
      ownerId,
      destinationId: options.destination.id,
      destinationSnapshot: {
        recipientName: options.destination.recipientName,
        phone: options.destination.phone,
        verifiedAt: options.destination.verifiedAt,
      },
      amountTzs: spec.amount,
      providerFeeTzs: spec.providerFee,
      platformFeeTzs: platformWithdrawalFee,
      totalDebitTzs: total,
      feeQuoteSnapshot: {
        provider,
        providerFeeTzs: spec.providerFee.toString(),
        platformFeeTzs: platformWithdrawalFee.toString(),
        quotedAt: createdAt.toISOString(),
      },
      quotedAt: createdAt,
      state: spec.state,
      reviewReason: spec.reviewReason ?? (reviewed ? "Decision recorded by the demo seed" : null),
      reviewedBy: reviewed ? (admin?.id ?? null) : null,
      reviewedAt: reviewed ? new Date(createdAt.getTime() + 20 * 60_000) : null,
      failureReason: spec.failureReason ?? null,
      requestIdempotencyKey: options.requestIdempotencyKey,
      createdAt,
      updatedAt: new Date(),
    });

    if (spec.attempt) {
      attemptSequence += 1;
      // A dispatch that never reached the provider has no reference to reconcile against.
      const reference =
        spec.attempt === "CREATED" || spec.attempt === "UNKNOWN" ? null : `pi_fake_payout_${String(attemptSequence).padStart(6, "0")}`;
      const attemptAt = new Date(createdAt.getTime() + 15 * 60_000);
      attemptRows.push({
        id: `e1000000-0000-4000-8000-${String(attemptSequence).padStart(12, "0")}`,
        withdrawalId: id,
        provider,
        providerAccountId,
        providerReference: reference,
        idempotencyKey: `demo-payout-${attemptSequence}`,
        requestHash: `demo-payout-${attemptSequence}`,
        requestPayload: {
          amountTzs: Number(spec.amount),
          phoneNumber: options.destination.phone,
          recipientName: options.destination.recipientName,
          narration: "Advo TZ payout",
        },
        state: spec.attempt,
        feeTzs: spec.state === "COMPLETED" || spec.state === "REVERSED" ? spec.providerFee + (spec.absorbedFeeTzs ?? 0n) : null,
        lastError: spec.attempt === "FAILED" || spec.attempt === "UNKNOWN" ? (spec.failureReason ?? null) : null,
        lastCheckedAt: spec.attempt === "PENDING" || spec.attempt === "UNKNOWN" ? attemptAt : null,
        createdAt: attemptAt,
        // Keeps the on-demand sweeper from reconciling the demo rules away.
        updatedAt: new Date(),
      });
    }

    if (options.accrualId) {
      const allocationState =
        spec.state === "COMPLETED" ? "paid" : spec.state === "FAILED" || spec.state === "REJECTED" ? "released" : "reserved";
      allocationRows.push({ withdrawalId: id, accrualId: options.accrualId, amountTzs: total, state: allocationState, createdAt });
      if (allocationState === "reserved") reservedByAccrual.set(options.accrualId, (reservedByAccrual.get(options.accrualId) ?? 0n) + total);
      if (allocationState === "paid") paidByAccrual.set(options.accrualId, (paidByAccrual.get(options.accrualId) ?? 0n) + total);
    }

    payoutJournals(spec, id, ownerType, ownerId);
    return id;
  }

  async function makeDestination(ownerType: "RESELLER" | "AGENT", ownerId: string, recipientName: string, phone: string) {
    // Reused on a re-run: a partial seed must not leave a second destination behind.
    const existing = await prisma.payoutDestination.findFirst({ where: { ownerType, ownerId, phone } });
    if (existing) return existing;
    return prisma.payoutDestination.create({
      data: { ownerType, ownerId, recipientName, phone, verifiedAt: at(480), createdAt: at(480) },
    });
  }

  /**
   * An Agent can only withdraw commission they have already earned, so each Agent
   * payout is backed by a real accrual with its hold and release journals.
   *
   * Keyed on `(sourcePaymentId, agentId, trigger)` so a re-run after a later
   * failure reuses the accrual instead of colliding with it — and therefore never
   * posts the same commission twice.
   */
  async function creditAgentAccrual(
    agentId: string,
    template: { invoiceId: string; resellerId: string; policyId: string; policySnapshot: unknown; trigger: string },
    amount: bigint,
    sourcePaymentId: string,
  ) {
    const existing = await prisma.commissionAccrual.findFirst({
      where: { agentId, sourcePaymentId, trigger: template.trigger as never },
      select: { id: true },
    });
    if (existing) return existing.id;

    const accrual = await prisma.commissionAccrual.create({
      data: {
        agentId,
        resellerId: template.resellerId,
        invoiceId: template.invoiceId,
        sourcePaymentId,
        trigger: template.trigger as never,
        policyId: template.policyId,
        policySnapshot: template.policySnapshot as never,
        eligibleBaseTzs: amount * 10n,
        amountTzs: amount,
        state: "AVAILABLE",
        availableAt: at(600),
        createdAt: at(600),
      },
    });
    journalQueue.push(
      {
        sourceKey: `demo-accrual-hold:${accrual.id}`,
        // Matches `commissions.service.ts`, so demo journals group with real ones
        // instead of splitting "commission accrual" into two ledger events.
        sourceType: "commission_accrual",
        description: "Demo commission earned by an Agent",
        lines: [
          { account: platformAccount("COMMISSION_EXPENSE"), debit: amount },
          { account: agentAccount(agentId, "AGENT_PENDING_PAYABLE"), credit: amount },
        ],
      },
      {
        sourceKey: `demo-accrual-release:${accrual.id}`,
        sourceType: "commission_release",
        description: "Demo commission hold released",
        lines: [
          { account: agentAccount(agentId, "AGENT_PENDING_PAYABLE"), debit: amount },
          { account: agentAccount(agentId, "AGENT_AVAILABLE_PAYABLE"), credit: amount },
        ],
      },
    );
    return accrual.id;
  }

  // ── Reseller side ──
  const resellerDestinations = await Promise.all([
    makeDestination("RESELLER", resellerId, "Demo Owner", "+255700000202"),
    makeDestination("RESELLER", resellerId, "Café Mlimani branch", "+255712345678"),
  ]);
  await prisma.payoutDestination.createMany({
    data: [
      {
        ownerType: "RESELLER",
        ownerId: resellerId,
        recipientName: "Old number (archived)",
        phone: "+255686000111",
        verifiedAt: at(400),
        archivedAt: at(60),
        createdAt: at(400),
      },
    ],
    skipDuplicates: true,
  });

  const resellerSpecs: PayoutSpec[] = [
    { amount: 12_000n, providerFee: 250n, state: "REQUESTED", ageHours: 61, attempt: null },
    { amount: 32_000n, providerFee: 400n, state: "COMPLETED", ageHours: 96, attempt: "COMPLETED", absorbedFeeTzs: 100n },
    { amount: 18_500n, providerFee: 400n, state: "COMPLETED", ageHours: 200, attempt: "COMPLETED" },
    {
      amount: 11_000n,
      providerFee: 250n,
      state: "FAILED",
      ageHours: 150,
      attempt: "FAILED",
      failureReason: "validation: recipient wallet is not registered",
    },
    {
      amount: 7_500n,
      providerFee: 250n,
      state: "REJECTED",
      ageHours: 220,
      attempt: null,
      reviewReason: "Beneficiary phone number does not match the account holder",
    },
    {
      amount: 10_000n,
      providerFee: 250n,
      state: "REVERSED",
      ageHours: 300,
      attempt: "REVERSED",
      failureReason: "Reversed by provider",
    },
  ];

  resellerSpecs.forEach((spec, index) => {
    buildPayout({
      ownerType: "RESELLER",
      ownerId: resellerId,
      destination: resellerDestinations[index % resellerDestinations.length]!,
      requestIdempotencyKey: `demo-reseller-payout-${index + 1}`,
      spec,
      sequence: index + 1,
    });
  });
  created.push(`${resellerSpecs.length} reseller payout requests`);

  // ── Agent side ──
  // One accrual template supplies the invoice/policy/reseller the accruals must
  // reference; only the Agent and the source payment need to differ.
  const primaryAgent = await prisma.agent.findUnique({ where: { referralCode: primaryAgentReferral }, select: { id: true } });
  const template = primaryAgent
    ? await prisma.commissionAccrual.findFirst({
        where: { agentId: primaryAgent.id },
        orderBy: { createdAt: "asc" },
        select: { invoiceId: true, resellerId: true, policyId: true, policySnapshot: true, trigger: true },
      })
    : null;

  if (primaryAgent && template) {
    const destination = await makeDestination("AGENT", primaryAgent.id, "Kassim Majaliwa", "+255755123456");
    const accrualId = await creditAgentAccrual(primaryAgent.id, template, 22_000n, "c2000000-0000-4000-8000-000000000001");

    const specs: PayoutSpec[] = [
      { amount: 6_000n, providerFee: 250n, state: "REQUESTED", ageHours: 9, attempt: null },
      { amount: 8_000n, providerFee: 300n, state: "COMPLETED", ageHours: 120, attempt: "COMPLETED" },
      {
        amount: 5_000n,
        providerFee: 250n,
        state: "FAILED",
        ageHours: 210,
        attempt: "FAILED",
        failureReason: "validation: recipient wallet is not registered",
      },
    ];
    specs.forEach((spec, index) => {
      buildPayout({
        ownerType: "AGENT",
        ownerId: primaryAgent.id,
        destination,
        requestIdempotencyKey: `demo-agent-payout-${index + 1}`,
        spec,
        sequence: 100 + index,
        accrualId,
      });
    });

    // The remaining open states each need their own beneficiary: the reserve rule
    // permits one open payout per owner.
    const OPEN_STATE_AGENTS: Array<{ referralCode: string; recipientName: string; phone: string; accrual: bigint; spec: PayoutSpec }> = [
      {
        referralCode: "AGENTONE",
        recipientName: "Agent 224807",
        phone: "+255600224807",
        accrual: 30_000n,
        spec: { amount: 25_000n, providerFee: 400n, state: "APPROVED", ageHours: 30, attempt: "CREATED" },
      },
      {
        referralCode: "AGENTTWO",
        recipientName: "Agent 509810",
        phone: "+255600509810",
        accrual: 20_000n,
        spec: { amount: 15_000n, providerFee: 400n, state: "PROCESSING", ageHours: 5, attempt: "PENDING" },
      },
      {
        referralCode: "DEMO01",
        recipientName: "Demo Agent",
        phone: "+255700000101",
        accrual: 14_000n,
        spec: {
          amount: 9_000n,
          providerFee: 250n,
          state: "UNKNOWN",
          ageHours: 40,
          attempt: "UNKNOWN",
          failureReason: "gateway_timeout: provider did not answer within 30s; outcome unknown",
        },
      },
      {
        referralCode: "AGENTTEST1",
        recipientName: "Test Agent Baraka",
        phone: "+255700000002",
        accrual: 20_000n,
        spec: {
          amount: 14_000n,
          providerFee: 400n,
          state: "NEEDS_REVIEW",
          ageHours: 55,
          attempt: "PENDING",
          failureReason: "Destination no longer verified/active",
        },
      },
    ];

    let sequence = 200;
    for (const entry of OPEN_STATE_AGENTS) {
      const agent = await prisma.agent.findUnique({ where: { referralCode: entry.referralCode }, select: { id: true, status: true } });
      // A suspended Agent must not be seen withdrawing.
      if (!agent || agent.status !== "ACTIVE") continue;
      const agentDestination = await makeDestination("AGENT", agent.id, entry.recipientName, entry.phone);
      const agentAccrualId = await creditAgentAccrual(agent.id, template, entry.accrual, `c2000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`);
      buildPayout({
        ownerType: "AGENT",
        ownerId: agent.id,
        destination: agentDestination,
        requestIdempotencyKey: `demo-agent-open-${entry.referralCode}`,
        spec: entry.spec,
        sequence,
        accrualId: agentAccrualId,
      });
      sequence += 1;
    }
    created.push(`agent payouts across ${OPEN_STATE_AGENTS.length + 1} Agent beneficiaries`);
  }

  await prisma.withdrawal.createMany({ data: withdrawalRows as never });
  if (attemptRows.length > 0) await prisma.payoutAttempt.createMany({ data: attemptRows as never });
  if (allocationRows.length > 0) await prisma.withdrawalAllocation.createMany({ data: allocationRows as never });

  for (const [accrualId, reserved] of reservedByAccrual) {
    await prisma.commissionAccrual.update({
      where: { id: accrualId },
      data: { reservedTzs: reserved, paidTzs: paidByAccrual.get(accrualId) ?? 0n },
    });
  }

  for (const entry of journalQueue) {
    await postJournal(prisma, {
      sourceKey: entry.sourceKey,
      sourceType: entry.sourceType,
      description: entry.description,
      actorUserId: null,
      lines: entry.lines as never,
    });
  }

  created.push(`${withdrawalRows.length} payout requests, ${attemptRows.length} provider attempts`);
  return created;
}
