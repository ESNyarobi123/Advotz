import { randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import { planPreset } from "@advo/contracts";
import { prisma } from "@advo/db";
import { AuthService } from "../modules/auth/auth.service.js";
import { createPolicy } from "../modules/commissions/commissions.service.js";
import { saveController } from "../modules/network/controllers.service.js";
import { SettingKey, getSetting, setSetting } from "../modules/settings/settings.service.js";
import { startTrial, upsertPlan } from "../modules/subscriptions/subscriptions.service.js";
import { isProduction } from "../common/providers.js";
import { backfillSettledReceipts, seedDemoActivity, seedDemoPayments, seedDemoWithdrawals } from "./seed-demo-activity.js";

const DEMO_TAG = "DEMO SEED — sample value, not a business decision";

export type DemoSeedResult = {
  created: string[];
  skipped: string[];
  credentials: Array<{ role: string; email: string; password: string }>;
};

function demoPassword() {
  return `Demo-${randomBytes(9).toString("base64url")}`;
}

/**
 * Fixed password for the demo Reseller account.
 *
 * The seed used to mint a random password and print it only on the run that
 * created the account, so a second `seed:demo` left you locked out of your own
 * demo data. Re-issuing a known password on every run keeps the demo usable.
 * This only ever runs outside production (see the guards at the top).
 */
const DEMO_RESELLER_PASSWORD = "Demo-Advo-2026!";

async function resetDemoPassword(userId: string, password: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await argon2.hash(password, { type: argon2.argon2id }) },
  });
  // Drop existing sessions so the new password is the only way in.
  await prisma.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

/**
 * Local demo fixtures. Every price, rate and account created here is flagged demo and only
 * exists outside production with the fake payment provider. Passwords are random per run.
 */
export async function seedDemo(): Promise<DemoSeedResult> {
  if (isProduction()) throw new Error("Demo seed refused: NODE_ENV=production");
  if ((process.env.PAYMENT_PROVIDER ?? "fake") !== "fake") throw new Error("Demo seed refused: PAYMENT_PROVIDER must be fake");

  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
  if (!admin) throw new Error("Run `pnpm admin:bootstrap` first — the demo seed never creates an Admin password.");

  const result: DemoSeedResult = { created: [], skipped: [], credentials: [] };
  const auth = new AuthService();

  if (await prisma.controller.count()) {
    result.skipped.push("controller (one already exists)");
  } else {
    await saveController(admin.id, { name: "Demo simulator (FAKE)", mode: "FAKE", isDefault: true });
    result.created.push("FAKE Omada controller (simulator)");
  }

  // The demo reseller should land on the plan a real signup would, and the catalog
  // should stay at the five starter plans — so reuse an existing trial plan first
  // and only mint the standalone demo plan on a database that has none.
  const starterTrialPlan = await prisma.platformPlan.findFirst({
    where: { active: true, lifecycle: "PUBLISHED", trialEligible: true },
    orderBy: { priceTzs: "asc" },
  });
  const existingDemoPlan = starterTrialPlan
    ? null
    : await prisma.platformPlan.findFirst({ where: { code: "demo-starter", active: true } });

  let plan = starterTrialPlan ?? existingDemoPlan;
  if (plan) {
    result.skipped.push(`plan ${plan.code} (reused for the demo trial)`);
  } else {
    plan = await upsertPlan(admin.id, {
      code: "demo-starter",
      name: "Demo Starter (demo price)",
      description: "Demo plan with the Brand Control feature set.",
      priceTzs: 15000n,
      periodDays: 30,
      trialEligible: true,
      trialDays: 7,
      maxSites: 2,
      maxDevices: 4,
      maxPackages: 6,
      lifecycle: "PUBLISHED",
      visibility: "PUBLIC",
      commercialPromise: "standard",
      features: planPreset("brand-control")!.features,
      isDemo: true,
    });
    result.created.push("plan demo-starter (isDemo)");
  }

  if (await prisma.commissionPolicy.findFirst({ where: { isDemo: true } })) {
    result.skipped.push("demo commission policy");
  } else {
    await createPolicy(admin.id, {
      name: "DEMO 10% of first subscription payment",
      trigger: "FIRST_SUBSCRIPTION_PAYMENT",
      mode: "PERCENTAGE",
      basisPoints: 1000,
      eligiblePlanCodes: [],
      holdDays: 0,
      effectiveFrom: new Date(Date.now() - 60_000),
      isDemo: true,
    });
    result.created.push("commission policy (isDemo, 10%)");
  }

  if (await getSetting(SettingKey.SALE_FEE_BPS)) {
    result.skipped.push("sale fee setting");
  } else {
    await setSetting(SettingKey.SALE_FEE_BPS, { basisPoints: 500 }, admin.id, DEMO_TAG);
    result.created.push("sale fee 5% (demo)");
  }

  let agent = await prisma.agent.findUnique({ where: { referralCode: "DEMO01" } });
  if (agent) {
    result.skipped.push("agent DEMO01");
  } else {
    const password = demoPassword();
    const created = await auth.createAgent(admin.id, {
      name: "Demo Agent",
      email: "agent@demo.advo.test",
      phone: "+255700000101",
      password,
      referralCode: "DEMO01",
    });
    agent = await prisma.agent.findUniqueOrThrow({ where: { id: created.agentId } });
    result.created.push("agent DEMO01");
    result.credentials.push({ role: "AGENT", email: "agent@demo.advo.test", password });
  }

  const resellerEmail = "reseller@demo.advo.test";
  const existingResellerUser = await prisma.user.findUnique({ where: { email: resellerEmail } });
  let resellerId: string;
  let ownerUserId: string;

  if (existingResellerUser) {
    result.skipped.push("reseller Demo Café");
    const existing = await prisma.reseller.findUnique({ where: { ownerUserId: existingResellerUser.id } });
    if (!existing) throw new Error("Demo reseller user exists without a reseller record");
    resellerId = existing.id;
    ownerUserId = existingResellerUser.id;
    await resetDemoPassword(ownerUserId, DEMO_RESELLER_PASSWORD);
    result.credentials.push({ role: "RESELLER", email: resellerEmail, password: DEMO_RESELLER_PASSWORD });
  } else {
    const password = DEMO_RESELLER_PASSWORD;
    const reg = await auth.registerReseller({
      businessName: "Demo Café (demo)",
      ownerName: "Demo Owner",
      email: resellerEmail,
      phone: "+255700000202",
      password,
      referralCode: agent.referralCode,
      acceptTerms: true,
    });
    if (reg.devVerificationToken) await auth.verifyContact(reg.devVerificationToken);
    await startTrial(reg.resellerId, plan.id, reg.userId);
    resellerId = reg.resellerId;
    ownerUserId = reg.userId;
    result.created.push("reseller Demo Café (verified, trial started, attributed to DEMO01)");
    result.credentials.push({ role: "RESELLER", email: resellerEmail, password });
  }

  result.created.push(...(await seedDemoActivity(resellerId, ownerUserId)));
  // Runs on its own guard so an environment seeded before payments existed still gets them.
  result.created.push(...(await seedDemoPayments(resellerId)));
  // The payments seed only covers the newest sales; the rest still need receipts
  // before a payout history has anything real to draw on.
  result.created.push(...(await backfillSettledReceipts(resellerId)));
  result.created.push(...(await seedDemoWithdrawals(resellerId)));

  return result;
}
