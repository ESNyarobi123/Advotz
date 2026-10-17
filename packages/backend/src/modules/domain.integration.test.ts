import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@advo/db";
import { computeSnippeSignature, FakePaymentProvider, FAKE_SCENARIO_PHONES } from "@advo/payments";
import { FAKE_CLIENT_SCENARIOS, FakeOmadaAdapter } from "@advo/omada";
import { resetTestDatabase } from "../test/db.js";
import { AuthService } from "./auth/auth.service.js";
import { getWebhookSecret, setPaymentProviderForTests } from "../common/providers.js";
import { ingestSnippeWebhook } from "./payments/inbox.service.js";
import { drainOutbox } from "./outbox/outbox.dispatcher.js";
import { saveController } from "./network/controllers.service.js";
import { createDeviceWifi, createSite, getSite, listDevices, provisionSite, renameDevice, retryDeviceAdopt, submitDeviceClaim, updateSite } from "./network/sites.service.js";
import { createPackage } from "./catalog/packages.service.js";
import { archiveVoucherGroup, createVoucherGroup, deleteUnusedVouchers, exportVoucherGroupCsv, listVouchers } from "./catalog/vouchers.service.js";
import { assertCanSell, checkoutSubscription, expireSubscriptions, startTrial, upsertPlan } from "./subscriptions/subscriptions.service.js";
import { createPolicy, evaluateSubscriptionCommission } from "./commissions/commissions.service.js";
import { setSetting, SettingKey } from "./settings/settings.service.js";
import { createPortalContext, createPortalOrder, joinWithRecoveryToken, portalBootstrap, portalOrderStatus, redeemVoucher, submitPromotion } from "./portal/portal.service.js";
import { createPlatformListing, listPromotionRequests, updatePromotionRequestState } from "./platform/listings.service.js";
import { joinGrant, revokeGrant, sweepGrants } from "./access/grants.service.js";
import { accountBalance, agentAccount, platformAccount, postJournal, resellerAccount, trialBalance } from "./ledger/ledger.service.js";
import { createDestination, requestWithdrawal, reviewWithdrawal, verifyDestination } from "./withdrawals/withdrawals.service.js";
import { reconcilePaymentAttempt, settlePendingSale } from "./payments/payments.service.js";
import { runSweepers } from "./outbox/sweepers.js";

const auth = new AuthService();
const provider = new FakePaymentProvider("fake-merchant");
const IP = "203.0.113.10";
const payer = (phone = "+255712000111") => ({ phone, firstName: "Asha", lastName: "Juma", email: "asha@example.com" });

async function deliver(type: string, data: Record<string, unknown>, id = `evt_${Math.random().toString(36).slice(2)}`) {
  const raw = Buffer.from(JSON.stringify({ id, type, api_version: "2026-01-25", data }));
  const ts = Math.floor(Date.now() / 1000).toString();
  return ingestSnippeWebhook(raw, { "x-webhook-timestamp": ts, "x-webhook-signature": computeSnippeSignature(raw, ts, getWebhookSecret()) });
}

async function payAttempt(attemptRef: string, amount: bigint, fee = 100, accountHolderName?: string) {
  const a = Number(amount);
  return deliver("payment.completed", {
    reference: attemptRef,
    status: "completed",
    amount: { value: a, currency: "TZS" },
    settlement: { gross: { value: a, currency: "TZS" }, fees: { value: fee, currency: "TZS" }, net: { value: a - fee, currency: "TZS" } },
    // Snippe reports the mobile-money account holder; some scenarios carry a name.
    ...(accountHolderName ? { customer: { phone: "+255712000111", name: accountHolderName } } : {}),
  });
}

/** Drains the outbox, first making backed-off events due (simulates time passing). */
async function drainAll() {
  await prisma.outboxEvent.updateMany({ where: { dispatchedAt: null }, data: { nextAttemptAt: new Date(0) } });
  return drainOutbox(20);
}

async function latestAttempt(orderId: string) {
  return prisma.paymentAttempt.findFirstOrThrow({ where: { orderId }, orderBy: { createdAt: "desc" } });
}

async function inviteReseller(adminId: string, n: number, agentCode: string) {
  const agentUser = await prisma.user.findFirst({ where: { agent: { referralCode: agentCode } }, include: { agent: true } });
  let agent = agentUser;
  if (!agent) {
    await auth.createAgent(adminId, { name: `Agent ${agentCode}`, email: `${agentCode.toLowerCase()}@advo.test`, phone: `+25565500000${n}`, password: "AgentSecure123!", referralCode: agentCode });
    agent = await prisma.user.findFirstOrThrow({ where: { agent: { referralCode: agentCode } }, include: { agent: true } });
  }
  const actor = { id: agent.id, role: "AGENT" as const, email: agent.email, name: agent.name, status: "ACTIVE" as const, emailVerifiedAt: null, resellerId: null, agentId: agent.agent!.id, mfaEnabled: false, mfaPassed: false, sessionId: "test" };
  const invite = await auth.createInvitation(actor, {
    businessName: `Cafe ${n}`,
    contactName: `Owner ${n}`,
    email: `owner${n}@advo.test`,
    phone: `+25571300000${n}`,
    consentConfirmed: true,
  });
  const token = (invite as { devInvitationToken?: string }).devInvitationToken!;
  const accepted = await auth.acceptInvitation({ token, ownerName: `Owner ${n}`, password: "OwnerSecure123!", acceptTerms: true });
  const reseller = await prisma.reseller.findFirstOrThrow({ where: { owner: { email: `owner${n}@advo.test` } } });
  return { resellerId: reseller.id, ownerUserId: reseller.ownerUserId, agentId: agent.agent!.id, accepted };
}

describe("Advo TZ domain flows (fake provider + fake controller, simulated)", () => {
  let adminId: string;
  let planId: string;
  let A: Awaited<ReturnType<typeof inviteReseller>>;
  let B: Awaited<ReturnType<typeof inviteReseller>>;
  let siteA: string;
  let slugA: string;
  let packageA: string;
  const PRICE = 10_000n;

  beforeAll(async () => {
    await resetTestDatabase();
    FakeOmadaAdapter.resetSharedState();
    setPaymentProviderForTests(provider);
    const admin = await auth.bootstrapAdmin({ email: "admin@advo.test", password: "AdminSecurePass1", name: "Admin" });
    adminId = admin.userId;
    const plan = await upsertPlan(adminId, {
      code: "demo-starter", name: "Demo Starter", description: "Integration-test plan",
      priceTzs: 20_000n, periodDays: 30,
      trialEligible: true, trialDays: 7, maxSites: 2, maxDevices: 5, maxPackages: 5,
      lifecycle: "PUBLISHED", visibility: "PUBLIC", commercialPromise: "standard", isDemo: true,
    });
    planId = plan.id;
    await setSetting(SettingKey.SALE_FEE_BPS, { basisPoints: 1000 }, adminId, "test config");
    await setSetting(SettingKey.WITHDRAWAL_FEE_TZS, { fixedTzs: 0 }, adminId, "test config");
    await saveController(adminId, { name: "Simulated", mode: "FAKE", isDefault: true });
    await createPolicy(adminId, {
      name: "Demo first payment 10%", trigger: "FIRST_SUBSCRIPTION_PAYMENT", mode: "PERCENTAGE", basisPoints: 1000,
      eligiblePlanCodes: [], holdDays: 0, effectiveFrom: new Date(Date.now() - 86400_000), isDemo: true,
    });
    A = await inviteReseller(adminId, 1, "AGENTA");
    B = await inviteReseller(adminId, 2, "AGENTB");
  });

  afterAll(async () => {
    setPaymentProviderForTests(null);
    await prisma.$disconnect();
  });

  it("rejects unsigned and tampered webhooks", async () => {
    const raw = Buffer.from(JSON.stringify({ id: "evt_x", type: "payment.completed", data: {} }));
    const ts = Math.floor(Date.now() / 1000).toString();
    expect((await ingestSnippeWebhook(raw, { "x-webhook-timestamp": ts })).status).toBe(401);
    const sig = computeSnippeSignature(raw, ts, getWebhookSecret());
    const tampered = Buffer.from(raw.toString().replace("evt_x", "evt_y"));
    expect((await ingestSnippeWebhook(tampered, { "x-webhook-timestamp": ts, "x-webhook-signature": sig })).status).toBe(401);
  });

  it("paid subscription activates once and accrues one commission for the attributed Agent", async () => {
    const checkout = await checkoutSubscription(A.resellerId, { planId, idempotencyKey: "sub-checkout-0001", ...payer() });
    expect(checkout.payment.state).toBe("PENDING");
    const order = await prisma.order.findUniqueOrThrow({ where: { id: checkout.orderId } });
    const attempt = await latestAttempt(order.id);
    const first = await payAttempt(attempt.providerReference!, order.amountTzs, 300);
    expect(first.status).toBe(200);
    await drainAll();

    const sub = await prisma.subscription.findUniqueOrThrow({ where: { resellerId: A.resellerId } });
    expect(sub.state).toBe("ACTIVE");
    const accruals = await prisma.commissionAccrual.findMany({ where: { resellerId: A.resellerId } });
    expect(accruals).toHaveLength(1);
    expect(accruals[0]!.amountTzs).toBe(2_000n);
    expect(await accountBalance(prisma, agentAccount(A.agentId, "AGENT_AVAILABLE_PAYABLE"))).toBe(2_000n);

    // Same event redelivered + a fresh event for the same payment: no second activation or commission.
    const again = await payAttempt(attempt.providerReference!, order.amountTzs, 300);
    expect(again.status).toBe(200);
    await drainAll();
    expect(await prisma.commissionAccrual.count({ where: { resellerId: A.resellerId } })).toBe(1);
    expect(await prisma.journal.count({ where: { sourceKey: `payment:${attempt.id}` } })).toBe(1);
  });

  it("a trial alone never creates commission", async () => {
    await startTrial(B.resellerId, planId, B.ownerUserId);
    await drainAll();
    expect(await prisma.commissionAccrual.count({ where: { resellerId: B.resellerId } })).toBe(0);
  });

  it("provisions a site, adopts an EAP with the device login, and sells a package", async () => {
    const { site } = await createSite(A.resellerId, A.ownerUserId, { name: "Main Cafe", timezone: "Africa/Dar_es_Salaam" });
    siteA = site.id;
    slugA = site.slug;
    await drainAll();
    const provisioned = await getSite(A.resellerId, siteA);
    expect(provisioned.mapping?.state).toBe("PROVISIONED");
    expect(provisioned.state).toBe("AWAITING_DEVICE");

    const adopted = await submitDeviceClaim(A.resellerId, A.ownerUserId, {
      siteId: siteA, name: "Front desk AP", mac: "AA-BB-CC-00-00-01", model: "EAP225",
      deviceUsername: "admin", devicePassword: "admin",
    });
    expect(adopted.device.mac).toBe("aa:bb:cc:00:00:01");
    expect(adopted.device.observedStatus).toBe("active");
    expect(adopted.claim.state).toBe("ADOPTED");
    expect((await getSite(A.resellerId, siteA)).state).toBe("READY");

    const renamed = await renameDevice(A.resellerId, A.ownerUserId, adopted.device.id, { name: "Counter AP", model: "EAP650" });
    expect(renamed.name).toBe("Counter AP");
    expect(renamed.model).toBe("EAP650");
    const wifi = await createDeviceWifi(A.resellerId, adopted.device.id, {
      name: "Cafe Guest",
      password: "cafe-wifi",
      hidden: true,
      band: "both",
    });
    expect(wifi).toMatchObject({ name: "Cafe Guest", hidden: true, secured: true, band: "both" });
    const listed = await listDevices(A.resellerId);
    expect(listed.find((device) => device.id === adopted.device.id)?.wifi).toEqual([
      expect.objectContaining({ name: "Cafe Guest", band: "both", hidden: true, secured: true }),
    ]);
    await expect(
      retryDeviceAdopt(A.resellerId, adopted.device.id, { deviceUsername: "admin", devicePassword: "wrong-password" }),
    ).rejects.toThrow(/incorrect/i);

    const pkg = await createPackage(A.resellerId, A.ownerUserId, {
      name: "1 Hour", priceTzs: PRICE, durationSeconds: 3600, downloadKbps: 2048, uploadKbps: 1024,
      quotaType: "UNLIMITED", maxDevices: 2, activationWindowSeconds: 86400, siteIds: [siteA],
    });
    packageA = pkg.id;
  });

  it("persists the captive portal design (title, message and theme) on the site", async () => {
    const saved = await updateSite(A.resellerId, siteA, {
      portalTitle: "Karibu kwenye WiFi yetu",
      portalMessage: "Lipia kifurushi unachotaka hapa chini",
      portalTheme: {
        preset: "sunset", primary: "#e06838", accent: "#f6ad55", background: "#fff7f3",
        surface: "#ffffff", text: "#3a2418", radius: 20, buttonStyle: "gradient",
      },
    });
    expect(saved.portalTitle).toBe("Karibu kwenye WiFi yetu");
    expect(saved.portalTheme).toMatchObject({ preset: "sunset", primary: "#e06838", radius: 20, buttonStyle: "gradient" });

    // Survives a fresh read, so the portal app sees exactly what was designed.
    const reloaded = await getSite(A.resellerId, siteA);
    expect(reloaded.portalTheme).toMatchObject({ accent: "#f6ad55", background: "#fff7f3" });
  });

  it("persists portal content and serves it, with listings and promotion packages, to guests", async () => {
    const saved = await updateSite(A.resellerId, siteA, {
      portalContent: {
        advertCount: 2,
        advertIntervalMs: 6000,
        adverts: [
          { title: "Your business, seen here", copy: "Advertise with us", color: "#117dcc" },
          { title: "Fresh food nearby", copy: "", color: "#a94810" },
        ],
        businesses: [{ id: "biz-1", name: "Kimara Cafe", category: "Food & drinks", glyph: "☕", color: "#df9e56" }],
      },
    });
    expect(saved.portalContent).toMatchObject({ advertCount: 2, advertIntervalMs: 6000 });

    const reloaded = await getSite(A.resellerId, siteA);
    expect((reloaded.portalContent as { businesses: unknown[] }).businesses).toHaveLength(1);

    // Admin publishes one active job and one hidden opportunity; only the job reaches guests.
    await createPlatformListing({ kind: "JOB", title: "Shop Assistant", organization: "Retail partner", location: "Kimara", employmentType: "Full-time", summary: "Serve customers", description: "", sortOrder: 1, active: true });
    await createPlatformListing({ kind: "OPPORTUNITY", title: "Hidden training", organization: "", location: "", employmentType: "", summary: "", description: "", sortOrder: 2, active: false });

    const bootstrap = await portalBootstrap(slugA);
    expect(bootstrap.site.content.adverts).toHaveLength(2);
    expect(bootstrap.site.content.businesses[0]?.name).toBe("Kimara Cafe");
    expect(bootstrap.listings.map((l) => l.title)).toEqual(["Shop Assistant"]);
    expect(bootstrap.promotionPackages.length).toBeGreaterThan(0);
  });

  it("accepts a banner-promotion request from a guest and lists it for the reseller", async () => {
    await submitPromotion(
      slugA,
      {
        packageCode: "2W",
        fullName: "Neema Mushi",
        mobile: "+255712345678",
        email: "neema@example.com",
        business: "Kimara Salon",
        location: "Kimara Mwisho",
        description: "Hair and beauty services",
        offer: "Weekend discounts for students",
      },
      IP,
    );
    const rows = await listPromotionRequests(A.resellerId);
    expect(rows).toHaveLength(1);
    const [lead] = rows;
    expect(lead).toMatchObject({ siteId: siteA, packageCode: "2W", durationLabel: "2 weeks", business: "Kimara Salon", state: "NEW" });
    expect(lead!.priceTzs).toBe(18_000n);

    const updated = await updatePromotionRequestState(A.resellerId, lead!.id, "CONTACTED");
    expect(updated.state).toBe("CONTACTED");

    // A reseller only ever sees their own leads.
    expect(await listPromotionRequests(B.resellerId)).toHaveLength(0);
  });

  it("refuses to sell a quota package the Controller cannot enforce", async () => {
    await expect(
      createPackage(A.resellerId, A.ownerUserId, {
        name: "1GB", priceTzs: 2_000n, durationSeconds: 86400, quotaType: "TOTAL", quotaBytes: 1_000_000_000n,
        maxDevices: 1, activationWindowSeconds: 86400, siteIds: [siteA],
      }),
    ).rejects.toMatchObject({ status: 422 });
  });

  let orderToken: string;
  let firstExpiry: Date;

  it("guest purchase: payment → grant with a fixed expiry → device authorized", async () => {
    const ctx = await createPortalContext(slugA, { clientMac: "11:22:33:44:55:66", apMac: "aa:bb:cc:00:00:01", ssidName: "Cafe WiFi", radioId: "1" }, IP);
    const order = await createPortalOrder({ contextToken: ctx.contextToken, packageId: packageA, idempotencyKey: "portal-order-0001", ...payer() }, IP);
    orderToken = order.orderToken;
    const replay = await createPortalOrder({ contextToken: ctx.contextToken, packageId: packageA, idempotencyKey: "portal-order-0001", ...payer() }, IP);
    expect(replay.orderToken).toBe(order.orderToken);

    const dbOrder = await prisma.order.findFirstOrThrow({ where: { requestIdempotencyKey: "portal-order-0001" } });
    expect(await prisma.paymentAttempt.count({ where: { orderId: dbOrder.id } })).toBe(1);
    await payAttempt((await latestAttempt(dbOrder.id)).providerReference!, PRICE, 100);
    await drainAll();

    const status = await portalOrderStatus(orderToken);
    expect(status.paymentState).toBe("PAID");
    expect(status.fulfillmentState).toBe("FULFILLED");
    expect(status.access?.state).toBe("ACTIVE");
    const grant = await prisma.accessGrant.findFirstOrThrow({ where: { orderId: dbOrder.id } });
    firstExpiry = grant.expiresAt!;
    expect(grant.expiresAt!.getTime() - grant.activatedAt!.getTime()).toBe(3600_000);

    // Ledger: 10,000 gross − 100 provider fee − 1,000 platform fee (10%) = 8,900 reseller payable.
    expect(await accountBalance(prisma, resellerAccount(A.resellerId, "RESELLER_PAYABLE"))).toBe(8_900n);
  });

  it("takes a phone number as the whole form, then learns the payer's name from the provider", async () => {
    const ctx = await createPortalContext(slugA, { clientMac: "11:22:33:44:55:99", apMac: "aa:bb:cc:00:00:01", ssidName: "Cafe WiFi", radioId: "1" }, IP);
    const order = await createPortalOrder(
      { contextToken: ctx.contextToken, packageId: packageA, phone: "+255712000999", idempotencyKey: "portal-order-phone-only" },
      IP,
    );

    const dbOrder = await prisma.order.findFirstOrThrow({
      where: { requestIdempotencyKey: "portal-order-phone-only" },
      include: { customer: true },
    });
    // Nothing was asked for, so nothing is invented: a guest is a phone number.
    expect(dbOrder.customer!.firstName).toBeNull();
    expect(dbOrder.customer!.lastName).toBeNull();
    expect(dbOrder.customer!.email).toBeNull();

    // Snippe will not accept a payment without a customer block. It gets an
    // explicit placeholder on a domain that cannot deliver, tagged with the
    // number so two payers stay distinguishable in the provider's dashboard.
    const attempt = await latestAttempt(dbOrder.id);
    expect(attempt.requestPayload).toMatchObject({
      phoneNumber: "+255712000999",
      firstName: "Advo",
      lastName: "Guest",
      email: "255712000999@example.com",
    });

    await payAttempt(attempt.providerReference!, PRICE, 100, "Asha Juma");
    await drainAll();

    // The name the guest never had to type, straight from the mobile-money account.
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: dbOrder.customerId! } });
    expect(customer.firstName).toBe("Asha");
    expect(customer.lastName).toBe("Juma");
    expect(order.orderToken).toBeTruthy();
  });

  it("never overwrites a payer name we already hold with the provider's", async () => {
    const ctx = await createPortalContext(slugA, { clientMac: "11:22:33:44:55:aa", apMac: "aa:bb:cc:00:00:01", ssidName: "Cafe WiFi", radioId: "1" }, IP);
    await createPortalOrder({ contextToken: ctx.contextToken, packageId: packageA, idempotencyKey: "portal-order-named", ...payer("+255712001111") }, IP);

    const dbOrder = await prisma.order.findFirstOrThrow({ where: { requestIdempotencyKey: "portal-order-named" } });
    const attempt = await latestAttempt(dbOrder.id);
    await payAttempt(attempt.providerReference!, PRICE, 100, "Someone Else");
    await drainAll();

    // An API client that supplied a name outranks a name derived from a payment.
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: dbOrder.customerId! } });
    expect(customer.firstName).toBe("Asha");
    expect(customer.lastName).toBe("Juma");
    expect(customer.email).toBe("asha@example.com");
  });

  it("a second device joins the same grant without extending its expiry", async () => {
    const ctx2 = await createPortalContext(slugA, { clientMac: "11:22:33:44:55:77", apMac: "aa:bb:cc:00:00:01", ssidName: "Cafe WiFi", radioId: "0" }, IP);
    await joinWithRecoveryToken({ contextToken: ctx2.contextToken, recoveryToken: orderToken }, IP);
    await drainAll();
    const grant = await prisma.accessGrant.findFirstOrThrow({ where: { order: { requestIdempotencyKey: "portal-order-0001" } }, include: { devices: true } });
    expect(grant.devices.filter((d) => d.authState === "AUTHORIZED")).toHaveLength(2);
    expect(grant.expiresAt!.getTime()).toBe(firstExpiry.getTime());

    const ctx3 = await createPortalContext(slugA, { clientMac: "11:22:33:44:55:88", apMac: "aa:bb:cc:00:00:01", ssidName: "Cafe WiFi", radioId: "0" }, IP);
    await expect(joinWithRecoveryToken({ contextToken: ctx3.contextToken, recoveryToken: orderToken }, IP)).rejects.toMatchObject({ status: 409 });
  });

  it("Controller timeout after acceptance is reconciled with the same candidate expiry", async () => {
    const ctx = await createPortalContext(slugA, { clientMac: FAKE_CLIENT_SCENARIOS.timeoutAfterAccept, apMac: "aa:bb:cc:00:00:01", ssidName: "Cafe WiFi", radioId: "1" }, IP);
    await createPortalOrder({ contextToken: ctx.contextToken, packageId: packageA, idempotencyKey: "portal-order-timeout", ...payer("+255712000222") }, IP);
    const order = await prisma.order.findFirstOrThrow({ where: { requestIdempotencyKey: "portal-order-timeout" } });
    await payAttempt((await latestAttempt(order.id)).providerReference!, PRICE, 100);
    await drainOutbox(3);
    let grant = await prisma.accessGrant.findFirstOrThrow({ where: { orderId: order.id }, include: { devices: true } });
    expect(grant.devices[0]!.authState).toBe("UNKNOWN");
    const candidate = grant.candidateExpiresAt!.getTime();
    await drainAll();
    grant = await prisma.accessGrant.findFirstOrThrow({ where: { orderId: order.id }, include: { devices: true } });
    expect(grant.devices[0]!.authState).toBe("AUTHORIZED");
    expect(grant.state).toBe("ACTIVE");
    expect(grant.expiresAt!.getTime()).toBe(candidate);
  });

  it("a definite Controller rejection fails the device and clears the unconfirmed clock", async () => {
    const ctx = await createPortalContext(slugA, { clientMac: FAKE_CLIENT_SCENARIOS.rejected, apMac: "aa:bb:cc:00:00:01", ssidName: "Cafe WiFi", radioId: "1" }, IP);
    await createPortalOrder({ contextToken: ctx.contextToken, packageId: packageA, idempotencyKey: "portal-order-reject", ...payer("+255712000333") }, IP);
    const order = await prisma.order.findFirstOrThrow({ where: { requestIdempotencyKey: "portal-order-reject" } });
    await payAttempt((await latestAttempt(order.id)).providerReference!, PRICE, 100);
    await drainAll();
    const grant = await prisma.accessGrant.findFirstOrThrow({ where: { orderId: order.id }, include: { devices: true } });
    expect(grant.devices[0]!.authState).toBe("FAILED");
    expect(grant.state).toBe("PENDING_ACTIVATION");
    expect(grant.candidateExpiresAt).toBeNull();
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).fulfillmentState).toBe("FAILED");
  });

  it("sweeping an ended grant deauthorizes its devices on the Controller", async () => {
    const ctx = await createPortalContext(slugA, { clientMac: "11:22:33:44:55:e1", apMac: "aa:bb:cc:00:00:01", ssidName: "Cafe WiFi", radioId: "1" }, IP);
    await createPortalOrder({ contextToken: ctx.contextToken, packageId: packageA, idempotencyKey: "portal-order-expiry", ...payer("+255712000556") }, IP);
    const order = await prisma.order.findFirstOrThrow({ where: { requestIdempotencyKey: "portal-order-expiry" } });
    await payAttempt((await latestAttempt(order.id)).providerReference!, PRICE, 100);
    await drainAll();

    const before = await prisma.accessGrant.findFirstOrThrow({ where: { orderId: order.id }, include: { devices: true } });
    expect(before.state).toBe("ACTIVE");
    expect(before.devices[0]!.authState).toBe("AUTHORIZED");

    // The Controller's own authorization timer is not the guarantee: the sweep
    // revokes the device too, so a timer that is ignored cannot leave access open.
    await prisma.accessGrant.update({ where: { id: before.id }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    await sweepGrants();

    const lapsed = await prisma.accessGrant.findUniqueOrThrow({ where: { id: before.id }, include: { devices: true } });
    expect(lapsed.state).toBe("EXPIRED");
    expect(lapsed.devices[0]!.authState).toBe("REVOKE_PENDING");
    expect(await prisma.outboxEvent.count({ where: { eventType: "grant.revoke", aggregateId: lapsed.devices[0]!.id } })).toBe(1);

    await drainAll();
    const revoked = await prisma.accessGrant.findUniqueOrThrow({ where: { id: before.id }, include: { devices: true } });
    expect(revoked.devices[0]!.authState).toBe("REVOKED");
  });

  it("amount mismatch is quarantined and never grants access", async () => {
    const ctx = await createPortalContext(slugA, { clientMac: "11:22:33:44:55:99", apMac: "aa:bb:cc:00:00:01", ssidName: "Cafe WiFi", radioId: "1" }, IP);
    await createPortalOrder({ contextToken: ctx.contextToken, packageId: packageA, idempotencyKey: "portal-order-short", ...payer("+255712000444") }, IP);
    const order = await prisma.order.findFirstOrThrow({ where: { requestIdempotencyKey: "portal-order-short" } });
    await payAttempt((await latestAttempt(order.id)).providerReference!, 5_000n, 50);
    await drainAll();
    const fresh = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { grant: true } });
    expect(fresh.paymentState).toBe("NEEDS_REVIEW");
    expect(fresh.grant).toBeNull();
    expect(await prisma.webhookInboxEvent.count({ where: { state: "QUARANTINED" } })).toBeGreaterThanOrEqual(1);
  });

  it("a payment create timeout becomes UNKNOWN and reconciles to the provider's pending payment", async () => {
    const ctx = await createPortalContext(slugA, { clientMac: "11:22:33:44:55:aa", apMac: "aa:bb:cc:00:00:01", ssidName: "Cafe WiFi", radioId: "1" }, IP);
    const res = await createPortalOrder({ contextToken: ctx.contextToken, packageId: packageA, idempotencyKey: "portal-order-ptimeout", ...payer(FAKE_SCENARIO_PHONES.createTimeout) }, IP);
    expect(res.payment.state).toBe("UNKNOWN");
    const order = await prisma.order.findFirstOrThrow({ where: { requestIdempotencyKey: "portal-order-ptimeout" } });
    const attempt = await latestAttempt(order.id);
    await reconcilePaymentAttempt(attempt.id);
    const after = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(after.state).toBe("PENDING");
    expect(after.providerReference).toMatch(/^pi_fake_/);
    expect(after.idempotencyKey).toBe(attempt.idempotencyKey);
    expect(await prisma.paymentAttempt.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("voucher redemption creates exactly one grant; reuse joins the same grant", async () => {
    const group = await createVoucherGroup(A.resellerId, A.ownerUserId, { name: "Batch 1", packageId: packageA, count: 3 });
    const [voucher] = await listVouchers(A.resellerId, group.id);
    const ctx = await createPortalContext(slugA, { clientMac: "22:22:33:44:55:01", apMac: "aa:bb:cc:00:00:01", ssidName: "Cafe WiFi", radioId: "1" }, IP);
    const first = await redeemVoucher({ contextToken: ctx.contextToken, code: voucher!.code.toLowerCase().replace(/-/g, " ") }, IP);
    expect(first.recoveryToken).toBeTruthy();
    const ctx2 = await createPortalContext(slugA, { clientMac: "22:22:33:44:55:02", apMac: "aa:bb:cc:00:00:01", ssidName: "Cafe WiFi", radioId: "1" }, IP);
    await redeemVoucher({ contextToken: ctx2.contextToken, code: voucher!.code }, IP);
    await drainAll();
    const grants = await prisma.accessGrant.findMany({ where: { voucherId: voucher!.id }, include: { devices: true } });
    expect(grants).toHaveLength(1);
    expect(grants[0]!.devices).toHaveLength(2);
  });

  it("a sale without settlement data stays pending until an audited Admin settle", async () => {
    const ctx = await createPortalContext(slugA, { clientMac: "44:22:33:44:55:01", apMac: "aa:bb:cc:00:00:01", ssidName: "Cafe WiFi", radioId: "1" }, IP);
    await createPortalOrder({ contextToken: ctx.contextToken, packageId: packageA, idempotencyKey: "portal-order-nosettle", ...payer() }, IP);
    const dbOrder = await prisma.order.findFirstOrThrow({ where: { requestIdempotencyKey: "portal-order-nosettle" } });
    const attempt = await latestAttempt(dbOrder.id);
    await deliver("payment.completed", {
      reference: attempt.providerReference,
      status: "completed",
      amount: { value: Number(PRICE), currency: "TZS" },
    });
    await drainAll();
    const pendingAccount = resellerAccount(A.resellerId, "RESELLER_PENDING_SETTLEMENT");
    expect(await accountBalance(prisma, pendingAccount)).toBe(9_000n);
    const payableBefore = await accountBalance(prisma, resellerAccount(A.resellerId, "RESELLER_PAYABLE"));

    await settlePendingSale(attempt.id, 150n, adminId, "Snippe statement 2026-09");
    expect(await accountBalance(prisma, pendingAccount)).toBe(0n);
    expect(await accountBalance(prisma, resellerAccount(A.resellerId, "RESELLER_PAYABLE"))).toBe(payableBefore + 8_850n);
    const log = await prisma.auditEvent.findMany({ where: { action: "payment.settled", targetId: attempt.id } });
    expect(log).toHaveLength(1);
    expect(log[0]!.actorUserId).toBe(adminId);
    expect(log[0]!.reason).toBe("Snippe statement 2026-09");

    await expect(settlePendingSale(attempt.id, 0n, adminId, "retry")).rejects.toThrow("already been settled");
    expect(await prisma.auditEvent.count({ where: { action: "payment.settled", targetId: attempt.id } })).toBe(1);
  });

  it("tenant isolation: Reseller B cannot read or act on Reseller A's resources", async () => {
    await expect(getSite(B.resellerId, siteA)).rejects.toMatchObject({ status: 404 });
    const group = await prisma.voucherGroup.findFirstOrThrow({ where: { resellerId: A.resellerId } });
    await expect(listVouchers(B.resellerId, group.id)).rejects.toMatchObject({ status: 404 });
    const grant = await prisma.accessGrant.findFirstOrThrow({ where: { resellerId: A.resellerId } });
    await expect(revokeGrant(B.resellerId, B.ownerUserId, grant.id, "probe")).rejects.toMatchObject({ status: 404 });
    // A voucher code from A is invalid at a B context even though the code exists.
    const { site: siteB } = await createSite(B.resellerId, B.ownerUserId, { name: "B Spot", timezone: "Africa/Dar_es_Salaam" });
    await drainAll();
    const ctxB = await createPortalContext(siteB.slug, { clientMac: "33:22:33:44:55:01", gatewayMac: "aa:bb:cc:00:00:99", vid: "1" }, IP);
    const [vA] = (await listVouchers(A.resellerId, group.id)).filter((v) => v.state === "UNUSED");
    await expect(redeemVoucher({ contextToken: ctxB.contextToken, code: vA!.code }, IP)).rejects.toMatchObject({ status: 400 });
  });

  it("an uncertain payout keeps its reserve, reuses its key, and a failure returns the funds once", async () => {
    const b = { type: "RESELLER" as const, id: A.resellerId, userId: A.ownerUserId };
    const created = await createDestination(b, { recipientName: "Owner Timeout", phone: FAKE_SCENARIO_PHONES.payoutTimeout });
    await verifyDestination(b, created.destination.id, created.devVerificationCode!);
    const payable = resellerAccount(A.resellerId, "RESELLER_PAYABLE");
    const reserve = resellerAccount(A.resellerId, "WITHDRAWAL_RESERVE");
    const payableBefore = await accountBalance(prisma, payable);

    const w = await requestWithdrawal(b, { destinationId: created.destination.id, amountTzs: 5_000n, idempotencyKey: "wd-uncertain-1" });
    await reviewWithdrawal(adminId, w.id, "approve", "Payout timeout drill");
    await drainAll();
    await drainAll();

    // The send timed out; reconciliation retried with the same key and found the provider's payout.
    const attempts = await prisma.payoutAttempt.findMany({ where: { withdrawalId: w.id } });
    expect(attempts).toHaveLength(1);
    const attempt = attempts[0]!;
    expect(attempt.state).toBe("PENDING");
    expect(attempt.providerReference).toBeTruthy();
    expect(await accountBalance(prisma, reserve)).toBe(w.totalDebitTzs);
    expect(await accountBalance(prisma, payable)).toBe(payableBefore - w.totalDebitTzs);

    const failed = { reference: attempt.providerReference, status: "failed", amount: { value: 5_000, currency: "TZS" }, failure_reason: "Recipient rejected" };
    await deliver("payout.failed", failed);
    await deliver("payout.failed", failed);
    await drainAll();
    expect((await prisma.withdrawal.findUniqueOrThrow({ where: { id: w.id } })).state).toBe("FAILED");
    expect(await accountBalance(prisma, reserve)).toBe(0n);
    expect(await accountBalance(prisma, payable)).toBe(payableBefore);
    expect(await prisma.journal.count({ where: { sourceKey: `payout-failed:${attempt.id}` } })).toBe(1);
  });

  it("concurrent withdrawals cannot overspend the balance", async () => {
    const b = { type: "RESELLER" as const, id: A.resellerId, userId: A.ownerUserId };
    const created = await createDestination(b, { recipientName: "Owner One", phone: "+255713000001" });
    const dest = created.destination;
    await verifyDestination(b, dest.id, created.devVerificationCode!);
    const balance = await accountBalance(prisma, resellerAccount(A.resellerId, "RESELLER_PAYABLE"));
    const amount = (balance * 6n) / 10n;
    const results = await Promise.allSettled(
      [1, 2, 3, 4, 5].map((i) => requestWithdrawal(b, { destinationId: dest.id, amountTzs: amount, idempotencyKey: `wd-concurrent-${i}` })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const after = await accountBalance(prisma, resellerAccount(A.resellerId, "RESELLER_PAYABLE"));
    expect(after).toBeGreaterThanOrEqual(0n);

    const w = await prisma.withdrawal.findFirstOrThrow({ where: { ownerId: A.resellerId, state: "REQUESTED" } });
    await reviewWithdrawal(adminId, w.id, "approve", "Looks fine");
    await drainAll();
    const payout = await prisma.payoutAttempt.findFirstOrThrow({ where: { withdrawalId: w.id } });
    expect(payout.state).toBe("PENDING");
    await deliver("payout.completed", {
      reference: payout.providerReference,
      status: "completed",
      amount: { value: Number(w.amountTzs), currency: "TZS" },
      fees: { value: Number(w.providerFeeTzs), currency: "TZS" },
    });
    await drainAll();
    expect((await prisma.withdrawal.findUniqueOrThrow({ where: { id: w.id } })).state).toBe("COMPLETED");
    expect(await accountBalance(prisma, resellerAccount(A.resellerId, "WITHDRAWAL_RESERVE"))).toBe(0n);
  });

  it("jobs and exports preserve tenant boundaries: Reseller B cannot export or mutate A's voucher groups", async () => {
    const group = await prisma.voucherGroup.findFirstOrThrow({ where: { resellerId: A.resellerId } });
    await expect(exportVoucherGroupCsv(B.resellerId, B.ownerUserId, group.id)).rejects.toMatchObject({ status: 404 });
    await expect(deleteUnusedVouchers(B.resellerId, B.ownerUserId, group.id)).rejects.toMatchObject({ status: 404 });
    await expect(archiveVoucherGroup(B.resellerId, B.ownerUserId, group.id)).rejects.toMatchObject({ status: 404 });

    const exported = await exportVoucherGroupCsv(A.resellerId, A.ownerUserId, group.id);
    expect(exported.filename).toMatch(/^vouchers-.*\.csv$/);
    expect(exported.csv).toContain('"code","package","price_tzs"');
  });

  it("two successful payment attempts create overpayment handling and exactly one entitlement", async () => {
    const ctx = await createPortalContext(slugA, { clientMac: "55:22:33:44:55:01", apMac: "aa:bb:cc:00:00:01", ssidName: "Cafe WiFi", radioId: "1" }, IP);
    await createPortalOrder({ contextToken: ctx.contextToken, packageId: packageA, idempotencyKey: "portal-order-overpay", ...payer("+255712000555") }, IP);
    const order = await prisma.order.findFirstOrThrow({ where: { requestIdempotencyKey: "portal-order-overpay" } });
    const attempt1 = await latestAttempt(order.id);

    await payAttempt(attempt1.providerReference!, PRICE, 100);
    await drainAll();
    const orderPaid = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { grant: true } });
    expect(orderPaid.paymentState).toBe("PAID");
    expect(orderPaid.grant).not.toBeNull();

    const attempt2 = await prisma.paymentAttempt.create({
      data: {
        orderId: order.id,
        provider: "fake",
        providerAccountId: "fake-merchant",
        providerReference: `pi_fake_overpay_${Date.now()}`,
        idempotencyKey: `overpay-key-${Date.now()}`,
        requestPayload: attempt1.requestPayload!,
        requestHash: attempt1.requestHash,
        state: "PENDING",
      },
    });

    await payAttempt(attempt2.providerReference!, PRICE, 100);
    await drainAll();

    const orderOverpaid = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(orderOverpaid.paymentState).toBe("OVERPAID");

    const overpayJournal = await prisma.journal.findFirst({
      where: { sourceKey: `overpayment:${attempt2.id}` },
      include: { lines: { include: { account: true } } },
    });
    expect(overpayJournal).not.toBeNull();
    const liabilityLine = overpayJournal?.lines.find((l) => l.account.type === "OVERPAYMENT_LIABILITY");
    expect(liabilityLine?.creditTzs).toBe(PRICE);

    const grants = await prisma.accessGrant.findMany({ where: { orderId: order.id } });
    expect(grants).toHaveLength(1);
  });

  it("subscription renewal uses renewal policy, policy rate changes do not rewrite old commission, and unpaid invoices yield no commission", async () => {
    const renewalPolicy = await createPolicy(adminId, {
      name: "Demo renewal 5%",
      trigger: "SUBSCRIPTION_RENEWAL",
      mode: "PERCENTAGE",
      basisPoints: 500,
      holdDays: 0,
      effectiveFrom: new Date(Date.now() - 60_000),
      eligiblePlanCodes: [],
      isDemo: true,
    });

    const renewalCheckout = await checkoutSubscription(A.resellerId, {
      planId,
      idempotencyKey: `sub-renewal-${Date.now()}`,
      ...payer("+255713000001"),
    });
    const renewalOrder = await prisma.order.findUniqueOrThrow({ where: { id: renewalCheckout.orderId } });
    const attempt = await latestAttempt(renewalOrder.id);

    const unpaidEval = await evaluateSubscriptionCommission(renewalOrder.invoiceId!, attempt.id);
    expect(unpaidEval.result).toBe("not_eligible");

    await payAttempt(attempt.providerReference!, 20_000n, 150);
    await drainAll();

    const invoice = await prisma.subscriptionInvoice.findUniqueOrThrow({ where: { id: renewalOrder.invoiceId! } });
    expect(invoice.status).toBe("PAID");
    expect(invoice.isFirstPayment).toBe(false);

    const accrual = await prisma.commissionAccrual.findFirstOrThrow({
      where: { invoiceId: invoice.id, trigger: "SUBSCRIPTION_RENEWAL" },
    });
    expect(accrual.amountTzs).toBe(1_000n);
    expect(accrual.policyId).toBe(renewalPolicy.id);

    await createPolicy(adminId, {
      name: "Demo renewal rate change 15%",
      trigger: "SUBSCRIPTION_RENEWAL",
      mode: "PERCENTAGE",
      basisPoints: 1500,
      holdDays: 0,
      effectiveFrom: new Date(),
      eligiblePlanCodes: [],
      isDemo: true,
    });
    const unchangedAccrual = await prisma.commissionAccrual.findUniqueOrThrow({ where: { id: accrual.id } });
    expect(unchangedAccrual.amountTzs).toBe(1_000n);
  });

  it("subscription moves to PAST_DUE during grace period, halts new sales, and recovers on renewal", async () => {
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { resellerId: A.resellerId } });
    const oneDayAgo = new Date(Date.now() - 86400_000);
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { state: "ACTIVE", currentPeriodEnd: oneDayAgo },
    });

    await expireSubscriptions(new Date());
    const pastDueSub = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(pastDueSub.state).toBe("PAST_DUE");
    expect(await assertCanSell(A.resellerId)).toBe(false);

    await prisma.subscription.update({
      where: { id: sub.id },
      data: { currentPeriodEnd: new Date(Date.now() - 5 * 86400_000) },
    });
    await expireSubscriptions(new Date());
    const expiredSub = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(expiredSub.state).toBe("EXPIRED");
    expect(await assertCanSell(A.resellerId)).toBe(false);

    const checkout = await checkoutSubscription(A.resellerId, {
      planId,
      idempotencyKey: `sub-recover-${Date.now()}`,
      ...payer("+255713000001"),
    });
    const order = await prisma.order.findUniqueOrThrow({ where: { id: checkout.orderId } });
    const attempt = await latestAttempt(order.id);
    await payAttempt(attempt.providerReference!, 20_000n, 150);
    await drainAll();

    const restoredSub = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(restoredSub.state).toBe("ACTIVE");
    expect(restoredSub.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now());
    expect(await assertCanSell(A.resellerId)).toBe(true);
  });

  it("partial withdrawals allocate Agent earnings across accruals without marking an entire accrual paid prematurely", async () => {
    const b = { type: "AGENT" as const, id: A.agentId, userId: (await prisma.agent.findUniqueOrThrow({ where: { id: A.agentId } })).userId };
    const destCreated = await createDestination(b, { recipientName: "Agent Asha", phone: "+255655000001" });
    await verifyDestination(b, destCreated.destination.id, destCreated.devVerificationCode!);

    // Fund Agent A with balance and an accrual larger than the withdrawal amount
    await postJournal(prisma, {
      sourceKey: `test-agent-fund-${Date.now()}`,
      sourceType: "commission_release",
      description: "Fund agent for partial withdrawal test",
      lines: [
        { account: platformAccount("COMMISSION_EXPENSE"), debit: 20_000n },
        { account: agentAccount(A.agentId, "AGENT_AVAILABLE_PAYABLE"), credit: 20_000n },
      ],
    });
    const dummyInvoice = await prisma.subscriptionInvoice.findFirstOrThrow();
    const dummyPolicy = await prisma.commissionPolicy.findFirstOrThrow();
    const largeAccrual = await prisma.commissionAccrual.create({
      data: {
        agent: { connect: { id: A.agentId } },
        reseller: { connect: { id: A.resellerId } },
        invoice: { connect: { id: dummyInvoice.id } },
        policy: { connect: { id: dummyPolicy.id } },
        sourcePaymentId: crypto.randomUUID(),
        trigger: "SUBSCRIPTION_RENEWAL",
        eligibleBaseTzs: 100_000n,
        amountTzs: 12_000n,
        reservedTzs: 0n,
        paidTzs: 0n,
        policySnapshot: { name: "Test policy", mode: "PERCENTAGE" },
        createdAt: new Date(Date.now() - 3600_000),
        availableAt: new Date(Date.now() - 60_000),
        state: "AVAILABLE",
      },
    });

    const withdrawAmount = 5_000n;
    const w = await requestWithdrawal(b, { destinationId: destCreated.destination.id, amountTzs: withdrawAmount, idempotencyKey: `agent-wd-part-${Date.now()}` });
    expect(w.state).toBe("REQUESTED");

    const allocs = await prisma.withdrawalAllocation.findMany({ where: { withdrawalId: w.id } });
    expect(allocs.length).toBeGreaterThanOrEqual(1);
    expect(allocs.reduce((acc, a) => acc + a.amountTzs, 0n)).toBe(w.totalDebitTzs);
    expect(allocs.every((a) => a.state === "reserved")).toBe(true);

    await reviewWithdrawal(adminId, w.id, "approve", "Approved partial withdrawal");
    await drainAll();
    const payout = await prisma.payoutAttempt.findFirstOrThrow({ where: { withdrawalId: w.id } });
    await deliver("payout.completed", {
      reference: payout.providerReference,
      status: "completed",
      amount: { value: Number(withdrawAmount), currency: "TZS" },
      fees: { value: Number(w.providerFeeTzs), currency: "TZS" },
    });
    await drainAll();

    expect((await prisma.withdrawal.findUniqueOrThrow({ where: { id: w.id } })).state).toBe("COMPLETED");
    const allocsPaid = await prisma.withdrawalAllocation.findMany({ where: { withdrawalId: w.id } });
    expect(allocsPaid.every((a) => a.state === "paid")).toBe(true);
    const accrualAfterPaid = await prisma.commissionAccrual.findUniqueOrThrow({ where: { id: largeAccrual.id } });
    expect(accrualAfterPaid.reservedTzs).toBe(0n);
    expect(accrualAfterPaid.paidTzs).toBeGreaterThan(0n);
    expect(accrualAfterPaid.state).toBe("AVAILABLE");
  });

  it("a payout with provider fee higher than quoted is absorbed by the platform without overcharging the beneficiary", async () => {
    // Fund Reseller A's payable balance with a package sale
    const ctxFund = await createPortalContext(slugA, { clientMac: "11:22:33:44:99:91", apMac: "aa:bb:cc:00:00:01", ssidName: "Cafe WiFi", radioId: "1" }, IP);
    const fundKey = `fund-order-fee-${Date.now()}`;
    await createPortalOrder({ contextToken: ctxFund.contextToken, packageId: packageA, idempotencyKey: fundKey, ...payer() }, IP);
    const dbFundOrder = await prisma.order.findFirstOrThrow({ where: { requestIdempotencyKey: fundKey } });
    await payAttempt((await latestAttempt(dbFundOrder.id)).providerReference!, PRICE, 100);
    await drainAll();

    const b = { type: "RESELLER" as const, id: A.resellerId, userId: A.ownerUserId };
    const dest = await prisma.payoutDestination.findFirstOrThrow({ where: { ownerId: A.resellerId, archivedAt: null } });

    const payableBefore = await accountBalance(prisma, resellerAccount(A.resellerId, "RESELLER_PAYABLE"));
    const w = await requestWithdrawal(b, { destinationId: dest.id, amountTzs: 5_000n, idempotencyKey: `wd-fee-absorb-${Date.now()}` });
    await reviewWithdrawal(adminId, w.id, "approve", "Fee test");
    await drainAll();

    const payout = await prisma.payoutAttempt.findFirstOrThrow({ where: { withdrawalId: w.id } });
    const actualProviderFee = w.providerFeeTzs + 75n;

    await deliver("payout.completed", {
      reference: payout.providerReference,
      status: "completed",
      amount: { value: Number(w.amountTzs), currency: "TZS" },
      fees: { value: Number(actualProviderFee), currency: "TZS" },
    });
    await drainAll();

    expect((await prisma.withdrawal.findUniqueOrThrow({ where: { id: w.id } })).state).toBe("COMPLETED");
    const payableAfter = await accountBalance(prisma, resellerAccount(A.resellerId, "RESELLER_PAYABLE"));
    expect(payableAfter).toBe(payableBefore - w.totalDebitTzs);

    const journal = await prisma.journal.findFirstOrThrow({
      where: { sourceKey: `payout-complete:${payout.id}` },
      include: { lines: { include: { account: true } } },
    });
    const feeExpenseLine = journal.lines.find((l) => l.account.type === "PROVIDER_FEE_EXPENSE");
    expect(feeExpenseLine?.debitTzs).toBe(75n);
  });

  it("payout reversal restores principal to beneficiary wallet and resets allocations to AVAILABLE", async () => {
    const b = { type: "AGENT" as const, id: A.agentId, userId: (await prisma.agent.findUniqueOrThrow({ where: { id: A.agentId } })).userId };
    const dest = await prisma.payoutDestination.findFirstOrThrow({ where: { ownerId: A.agentId, archivedAt: null } });

    // Fund Agent A with balance and an accrual for this test
    await postJournal(prisma, {
      sourceKey: `test-agent-fund-rev-${Date.now()}`,
      sourceType: "commission_release",
      description: "Fund agent for reversal test",
      lines: [
        { account: platformAccount("COMMISSION_EXPENSE"), debit: 10_000n },
        { account: agentAccount(A.agentId, "AGENT_AVAILABLE_PAYABLE"), credit: 10_000n },
      ],
    });
    const dummyInvoiceRev = await prisma.subscriptionInvoice.findFirstOrThrow();
    const dummyPolicyRev = await prisma.commissionPolicy.findFirstOrThrow();
    const revAccrual = await prisma.commissionAccrual.create({
      data: {
        agent: { connect: { id: A.agentId } },
        reseller: { connect: { id: A.resellerId } },
        invoice: { connect: { id: dummyInvoiceRev.id } },
        policy: { connect: { id: dummyPolicyRev.id } },
        sourcePaymentId: crypto.randomUUID(),
        trigger: "SUBSCRIPTION_RENEWAL",
        eligibleBaseTzs: 100_000n,
        amountTzs: 8_000n,
        reservedTzs: 0n,
        paidTzs: 0n,
        policySnapshot: { name: "Test policy", mode: "PERCENTAGE" },
        createdAt: new Date(Date.now() - 3600_000),
        availableAt: new Date(Date.now() - 60_000),
        state: "AVAILABLE",
      },
    });

    const walletBefore = await accountBalance(prisma, agentAccount(A.agentId, "AGENT_AVAILABLE_PAYABLE"));
    const w = await requestWithdrawal(b, { destinationId: dest.id, amountTzs: 5_000n, idempotencyKey: `agent-wd-rev-${Date.now()}` });
    const walletAfterDebit = await accountBalance(prisma, agentAccount(A.agentId, "AGENT_AVAILABLE_PAYABLE"));
    expect(walletAfterDebit).toBe(walletBefore - w.totalDebitTzs);

    await reviewWithdrawal(adminId, w.id, "approve", "Approved for reversal drill");
    await drainAll();

    const payout = await prisma.payoutAttempt.findFirstOrThrow({ where: { withdrawalId: w.id } });
    await deliver("payout.completed", {
      reference: payout.providerReference,
      status: "completed",
      amount: { value: 5_000, currency: "TZS" },
      fees: { value: Number(w.providerFeeTzs), currency: "TZS" },
    });
    await drainAll();
    expect((await prisma.withdrawal.findUniqueOrThrow({ where: { id: w.id } })).state).toBe("COMPLETED");

    await deliver("payout.reversed", {
      reference: payout.providerReference,
      status: "reversed",
      amount: { value: 5_000, currency: "TZS" },
      failure_reason: "Account closed at target network",
    });
    await drainAll();

    const wReversed = await prisma.withdrawal.findUniqueOrThrow({ where: { id: w.id } });
    expect(wReversed.state).toBe("REVERSED");
    const walletAfter = await accountBalance(prisma, agentAccount(A.agentId, "AGENT_AVAILABLE_PAYABLE"));
    expect(walletAfter).toBe(walletAfterDebit + w.amountTzs);

    const dup = await deliver("payout.reversed", {
      reference: payout.providerReference,
      status: "reversed",
      amount: { value: 5_000, currency: "TZS" },
    });
    expect(dup.status).toBe(200);
    expect(await accountBalance(prisma, agentAccount(A.agentId, "AGENT_AVAILABLE_PAYABLE"))).toBe(walletAfter);

    const accrualRestored = await prisma.commissionAccrual.findUniqueOrThrow({ where: { id: revAccrual.id } });
    expect(accrualRestored.state).toBe("AVAILABLE");
  });

  it("failure event delivered after completion cannot roll back payment or payout funds", async () => {
    // Fund Reseller A
    const ctxFund = await createPortalContext(slugA, { clientMac: "11:22:33:44:99:92", apMac: "aa:bb:cc:00:00:01", ssidName: "Cafe WiFi", radioId: "1" }, IP);
    const fundLateKey = `fund-order-latefail-${Date.now()}`;
    await createPortalOrder({ contextToken: ctxFund.contextToken, packageId: packageA, idempotencyKey: fundLateKey, ...payer() }, IP);
    const dbFundOrder = await prisma.order.findFirstOrThrow({ where: { requestIdempotencyKey: fundLateKey } });
    await payAttempt((await latestAttempt(dbFundOrder.id)).providerReference!, PRICE, 100);
    await drainAll();

    const b = { type: "RESELLER" as const, id: A.resellerId, userId: A.ownerUserId };
    const dest = await prisma.payoutDestination.findFirstOrThrow({ where: { ownerId: A.resellerId, archivedAt: null } });

    const w = await requestWithdrawal(b, { destinationId: dest.id, amountTzs: 5_000n, idempotencyKey: `wd-late-fail-${Date.now()}` });
    await reviewWithdrawal(adminId, w.id, "approve", "Late fail test");
    await drainAll();
    const payout = await prisma.payoutAttempt.findFirstOrThrow({ where: { withdrawalId: w.id } });
    await deliver("payout.completed", {
      reference: payout.providerReference,
      status: "completed",
      amount: { value: 5_000, currency: "TZS" },
    });
    await drainAll();

    const payableBefore = await accountBalance(prisma, resellerAccount(A.resellerId, "RESELLER_PAYABLE"));

    await deliver("payout.failed", {
      reference: payout.providerReference,
      status: "failed",
      amount: { value: 5_000, currency: "TZS" },
      failure_reason: "Network timeout reported late",
    });
    await drainAll();

    const wLate = await prisma.withdrawal.findUniqueOrThrow({ where: { id: w.id } });
    expect(wLate.state).toBe("NEEDS_REVIEW");
    expect(wLate.failureReason).toContain("Failure reported after completion");
    expect(await accountBalance(prisma, resellerAccount(A.resellerId, "RESELLER_PAYABLE"))).toBe(payableBefore);

    const ctx = await createPortalContext(slugA, { clientMac: "99:22:33:44:55:01", apMac: "aa:bb:cc:00:00:01", ssidName: "Cafe WiFi", radioId: "1" }, IP);
    await createPortalOrder({ contextToken: ctx.contextToken, packageId: packageA, idempotencyKey: `portal-order-latefail-${Date.now()}`, ...payer("+255712000888") }, IP);
    const dbOrder = await prisma.order.findFirstOrThrow({ where: { requestIdempotencyKey: { startsWith: "portal-order-latefail-" } } });
    const attempt = await latestAttempt(dbOrder.id);
    await payAttempt(attempt.providerReference!, PRICE, 100);
    await drainAll();

    const orderPaid = await prisma.order.findUniqueOrThrow({ where: { id: dbOrder.id } });
    expect(orderPaid.paymentState).toBe("PAID");

    await deliver("payment.failed", {
      reference: attempt.providerReference,
      status: "failed",
      amount: { value: Number(PRICE), currency: "TZS" },
      failure_reason: "Late cancellation notice",
    });
    await drainAll();

    const orderStillPaid = await prisma.order.findUniqueOrThrow({ where: { id: dbOrder.id } });
    expect(orderStillPaid.paymentState).toBe("PAID");
  });

  it("duplicate concurrent signed events post money and entitlement once", async () => {
    const ctx = await createPortalContext(slugA, { clientMac: "66:22:33:44:55:01", apMac: "aa:bb:cc:00:00:01", ssidName: "Cafe WiFi", radioId: "1" }, IP);
    await createPortalOrder({ contextToken: ctx.contextToken, packageId: packageA, idempotencyKey: "portal-order-concurrent-wh", ...payer("+255712000666") }, IP);
    const order = await prisma.order.findFirstOrThrow({ where: { requestIdempotencyKey: "portal-order-concurrent-wh" } });
    const attempt = await latestAttempt(order.id);

    const eventPayload = {
      reference: attempt.providerReference,
      status: "completed",
      amount: { value: Number(PRICE), currency: "TZS" },
      settlement: { gross: { value: Number(PRICE), currency: "TZS" }, fees: { value: 100, currency: "TZS" }, net: { value: Number(PRICE) - 100, currency: "TZS" } },
    };
    const eventId = `evt_race_${Date.now()}`;

    const [res1, res2] = await Promise.all([
      deliver("payment.completed", eventPayload, eventId),
      deliver("payment.completed", eventPayload, eventId),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    const duplicates = [(res1.body as { duplicate?: boolean }).duplicate, (res2.body as { duplicate?: boolean }).duplicate].filter(Boolean);
    expect(duplicates).toHaveLength(1);

    await drainAll();
    const dbOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { grant: true } });
    expect(dbOrder.paymentState).toBe("PAID");
    expect(dbOrder.fulfillmentState).toBe("FULFILLED");
    expect(await prisma.accessGrant.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("completion after UI timeout recovers fulfillment via sweeper", async () => {
    const ctx = await createPortalContext(slugA, { clientMac: "77:22:33:44:55:01", apMac: "aa:bb:cc:00:00:01", ssidName: "Cafe WiFi", radioId: "1" }, IP);
    await createPortalOrder({ contextToken: ctx.contextToken, packageId: packageA, idempotencyKey: "portal-order-sweeper", ...payer("+255712000777") }, IP);
    const order = await prisma.order.findFirstOrThrow({ where: { requestIdempotencyKey: "portal-order-sweeper" } });
    const attempt = await latestAttempt(order.id);

    provider.setPaymentStatus(attempt.providerReference!, "completed");

    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { updatedAt: new Date(Date.now() - 3 * 60_000), lastCheckedAt: null },
    });

    const sweepRes = await runSweepers(new Date());
    expect(Number(sweepRes.paymentsReconciled)).toBeGreaterThanOrEqual(1);

    await drainAll();
    const freshAttempt = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(freshAttempt.state).toBe("COMPLETED");
    const freshOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(freshOrder.paymentState).toBe("PAID");
  });

  it("multiple concurrent devices cannot exceed package device limit", async () => {
    const group = await createVoucherGroup(A.resellerId, A.ownerUserId, { name: "Limit Group", packageId: packageA, count: 1 });
    const [voucher] = await listVouchers(A.resellerId, group.id);
    const ctx1 = await createPortalContext(slugA, { clientMac: "88:22:33:44:55:01", apMac: "aa:bb:cc:00:00:01", ssidName: "Cafe WiFi", radioId: "1" }, IP);
    const first = await redeemVoucher({ contextToken: ctx1.contextToken, code: voucher!.code }, IP);
    await drainAll();

    const grant = await prisma.accessGrant.findFirstOrThrow({ where: { voucherId: voucher!.id } });
    expect(grant.maxDevices).toBe(2);

    const macs = ["88:22:33:44:55:02", "88:22:33:44:55:03", "88:22:33:44:55:04", "88:22:33:44:55:05"];
    const contexts = await Promise.all(
      macs.map((clientMac) => createPortalContext(slugA, { clientMac, apMac: "aa:bb:cc:00:00:01", ssidName: "Cafe WiFi", radioId: "1" }, IP)),
    );

    const results = await Promise.allSettled(
      contexts.map((c) => joinWithRecoveryToken({ contextToken: c.contextToken, recoveryToken: first.recoveryToken! }, IP)),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(3);

    const devices = await prisma.accessGrantDevice.findMany({ where: { grantId: grant.id, authState: { notIn: ["REVOKED", "FAILED"] } } });
    expect(devices).toHaveLength(2);
  });

  it("failed site creation does not duplicate remote sites on retry", async () => {
    const { site, operationId } = await createSite(A.resellerId, A.ownerUserId, { name: "Idempotent Site", timezone: "Africa/Dar_es_Salaam" });
    await drainAll();

    const firstStatus = await provisionSite(operationId);
    expect(["SUCCEEDED", "busy"]).toContain(firstStatus);

    const mapping = await prisma.controllerSiteMapping.findUniqueOrThrow({ where: { siteId: site.id } });
    expect(mapping.state).toBe("PROVISIONED");
    const firstRemoteSiteId = mapping.remoteSiteId;
    expect(firstRemoteSiteId).toBeTruthy();

    await prisma.networkOperation.update({ where: { id: operationId }, data: { state: "PENDING" } });
    await provisionSite(operationId);

    const mappingAfter = await prisma.controllerSiteMapping.findUniqueOrThrow({ where: { siteId: site.id } });
    expect(mappingAfter.remoteSiteId).toBe(firstRemoteSiteId);
  });

  it("the ledger balances and journals are append-only", async () => {
    const tb = await trialBalance();
    expect(tb.balanced).toBe(true);
    const line = await prisma.journalLine.findFirstOrThrow();
    await expect(prisma.journalLine.update({ where: { id: line.id }, data: { debitTzs: line.debitTzs + 1n } })).rejects.toThrow();
    await expect(prisma.journal.deleteMany({})).rejects.toThrow();
  });
});
