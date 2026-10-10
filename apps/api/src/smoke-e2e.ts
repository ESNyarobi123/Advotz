/**
 * HTTP smoke test against a running API (fake payments + FAKE controller, OUTBOX_INLINE=true).
 * Everything it exercises is SIMULATED: it proves Advo's own HTTP/state behaviour, not Snippe
 * or Omada behaviour. Run against a disposable database only:
 *
 *   DATABASE_URL=…/advo_smoke SMOKE_API_URL=http://localhost:4100 pnpm --filter @advo/api smoke
 */
import "@advo/config/load-env";
import { writeFileSync } from "node:fs";
import { prisma } from "@advo/db";
import { AuthService, totpCode } from "@advo/backend";

const API = (process.env.SMOKE_API_URL ?? "http://localhost:4100") + "/api/v1";
const ORIGIN = "http://localhost:3000";
const results: Array<{ step: string; ok: boolean; detail?: string }> = [];

type Session = { cookie?: string };

async function call(s: Session, method: string, path: string, body?: unknown, opts: { origin?: string | null } = {}) {
  const headers: Record<string, string> = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (s.cookie) headers.cookie = s.cookie;
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  const res = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie?.includes("advo_session=")) s.cookie = setCookie.split(";")[0];
  const text = await res.text();
  let json: any = text;
  try {
    json = JSON.parse(text);
  } catch {
    /* CSV or empty */
  }
  return { status: res.status, json, text };
}

function check(step: string, ok: boolean, detail?: unknown) {
  results.push({ step, ok, detail: ok ? undefined : JSON.stringify(detail)?.slice(0, 400) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${ok ? "" : `  → ${JSON.stringify(detail)?.slice(0, 400)}`}`);
}

async function poll<T>(fn: () => Promise<T>, done: (v: T) => boolean, ms = 8000): Promise<T> {
  const until = Date.now() + ms;
  let v = await fn();
  while (!done(v) && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 250));
    v = await fn();
  }
  return v;
}

async function main() {
  const dbName = (await prisma.$queryRaw<{ d: string }[]>`SELECT current_database() AS d`)[0]!.d;
  if (!dbName.endsWith("_smoke")) throw new Error(`Refusing to run smoke test against "${dbName}"`);
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await new AuthService().bootstrapAdmin({ email: "admin@smoke.test", password: "AdminSmokePass1!", name: "Smoke Admin" });

  // ── Admin login + MFA enforcement ──
  const admin: Session = {};
  let r = await call(admin, "POST", "/auth/login", { email: "admin@smoke.test", password: "AdminSmokePass1!" });
  check("admin login", r.status === 201 && r.json.user.role === "ADMIN", r.json);
  r = await call(admin, "GET", "/admin/overview");
  check("admin route blocked until MFA", r.status === 403 && r.json.code === "MFA_REQUIRED", r.json);
  r = await call(admin, "POST", "/auth/mfa/setup");
  const secret = r.json.secret as string;
  const enrolCode = totpCode(secret);
  r = await call(admin, "POST", "/auth/mfa/enable", { code: enrolCode });
  check("MFA enrollment", r.status === 201 && r.json.mfaEnabled === true, r.json);
  r = await call({}, "POST", "/auth/login", { email: "admin@smoke.test", password: "AdminSmokePass1!", mfaCode: enrolCode });
  check("replayed authenticator code refused", r.status === 401 && r.json.code === "UNAUTHENTICATED", r.json);
  r = await call(admin, "GET", "/admin/overview");
  check("admin overview after MFA", r.status === 200 && typeof r.json.resellers === "object", r.json);
  r = await call({}, "POST", "/auth/login", { email: "admin@smoke.test", password: "AdminSmokePass1!" });
  check("admin login without code now refused", r.status === 401 && r.json.code === "MFA_REQUIRED", r.json);

  // ── CSRF: cookie-authenticated POST from an untrusted/missing origin ──
  r = await call(admin, "POST", "/admin/plans", {}, { origin: "https://evil.example" });
  check("untrusted Origin rejected", r.status === 403, r.json);
  r = await call(admin, "POST", "/admin/plans", {}, { origin: null });
  check("missing Origin with session cookie rejected", r.status === 403, r.json);

  // ── Admin configuration (demo-labelled) ──
  r = await call(admin, "POST", "/admin/plans", {
    code: "demo-basic", name: "Demo Basic (demo data)", priceTzs: 15000, periodDays: 30,
    trialEligible: true, trialDays: 7, maxSites: 2, maxDevices: 4, maxPackages: 6, isDemo: true,
  });
  check("create demo plan", r.status === 201 && r.json.priceTzs === "15000", r.json);
  const planId = r.json.id;
  r = await call(admin, "PUT", "/admin/settings/sale-fee", { basisPoints: 500, reason: "smoke config" });
  check("set sale fee 5%", r.status === 200, r.json);
  r = await call(admin, "POST", "/admin/controllers", { name: "Simulator", mode: "FAKE", isDefault: true });
  check("register FAKE controller", r.status === 201 && r.json.hasCredentials === false, r.json);
  r = await call(admin, "POST", "/admin/commission-policies", {
    name: "Demo 10% first payment", trigger: "FIRST_SUBSCRIPTION_PAYMENT", mode: "PERCENTAGE", basisPoints: 1000,
    holdDays: 0, effectiveFrom: new Date(Date.now() - 86400_000).toISOString(), isDemo: true,
  });
  check("create demo commission policy", r.status === 201, r.json);
  r = await call(admin, "POST", "/admin/agents", { name: "Smoke Agent", email: "agent@smoke.test", phone: "+255655000001", password: "AgentSmoke123!", referralCode: "SMOKE1" });
  check("create agent", r.status === 201, r.json);

  // ── Agent invites a Reseller ──
  const agent: Session = {};
  await call(agent, "POST", "/auth/login", { email: "agent@smoke.test", password: "AgentSmoke123!" });
  r = await call(agent, "POST", "/agent/invitations", { businessName: "Smoke Cafe", contactName: "Neema", email: "owner@smoke.test", phone: "+255713000009", consentConfirmed: true });
  check("agent invitation", r.status === 201 && Boolean(r.json.devInvitationToken), r.json);
  r = await call({}, "POST", "/auth/invite/accept", { token: r.json.devInvitationToken, ownerName: "Neema", password: "OwnerSmoke123!", acceptTerms: true });
  check("invitation accepted", r.status === 201, r.json);
  const reseller: Session = {};
  r = await call(reseller, "POST", "/auth/login", { email: "owner@smoke.test", password: "OwnerSmoke123!" });
  check("reseller login", r.status === 201 && r.json.user.resellerId, r.json);
  r = await call(reseller, "GET", "/admin/overview");
  check("reseller cannot reach admin API", r.status === 403, r.json);

  // ── Subscription purchase (simulated payment) ──
  r = await call(reseller, "POST", "/reseller/subscription/checkout", { planId, phone: "0712 000 555", firstName: "Neema", lastName: "M", email: "owner@smoke.test", idempotencyKey: "smoke-sub-001" });
  check("subscription checkout pending", r.status === 201 && r.json.payment.state === "PENDING", r.json);
  const pending = await call(admin, "GET", "/admin/payments?state=PENDING");
  const subAttempt = pending.json.find((p: any) => p.order.purpose === "PLATFORM_SUBSCRIPTION");
  r = await call({}, "POST", `/dev/simulate/payments/${subAttempt.id}`, { outcome: "completed", feeTzs: 200 });
  check("simulated signed webhook accepted", r.status === 201 && r.json.ingest.status === 200, r.json);
  const sub = await poll(() => call(reseller, "GET", "/reseller/subscription"), (x) => x.json.state === "ACTIVE");
  check("subscription ACTIVE", sub.json.state === "ACTIVE", sub.json);
  const agentView = await poll(() => call(agent, "GET", "/agent/overview"), (x) => x.json.wallet?.availableTzs === "1500");
  check("agent commission 10% = 1500 available", agentView.json.wallet?.availableTzs === "1500", agentView.json);

  // ── Site, device, package ──
  r = await call(reseller, "POST", "/reseller/sites", { name: "Smoke Cafe Kariakoo", location: "Kariakoo" });
  check("site requested", r.status === 201, r.json);
  const siteId = r.json.site.id;
  const slug = r.json.site.slug;
  const site = await poll(() => call(reseller, "GET", `/reseller/sites/${siteId}`), (x) => x.json.mapping?.state === "PROVISIONED");
  check("site provisioned on simulator", site.json.mapping?.state === "PROVISIONED", site.json);
  r = await call(reseller, "POST", "/reseller/device-claims", { siteId, name: "Smoke AP", mac: "AC:84:C6:00:00:01", model: "EAP225", deviceUsername: "admin", devicePassword: "admin" });
  check("device adopted on controller", r.status === 201 && r.json.device?.mac === "ac:84:c6:00:00:01" && r.json.device?.observedStatus === "active", r.json);
  r = await call(reseller, "POST", "/reseller/packages", { name: "Saa 1", priceTzs: 1000, durationSeconds: 3600, downloadKbps: 2048, uploadKbps: 1024, maxDevices: 1, siteIds: [siteId] });
  check("package created", r.status === 201 && r.json.currentRevision?.priceTzs === "1000", r.json);
  const packageId = r.json.id;

  // ── Guest portal purchase ──
  r = await call({}, "GET", `/portal/sites/${slug}`, undefined, { origin: null });
  check("portal lists sellable package", r.status === 200 && r.json.available === true && r.json.packages.length === 1, r.json);
  r = await call({}, "POST", `/portal/sites/${slug}/context`, { clientMac: "5C-CF-7F-00-00-01", apMac: "AC:84:C6:00:00:01", ssidName: "Smoke WiFi", radioId: "1", clientIp: "10.1.0.20" }, { origin: "http://localhost:3001" });
  check("portal context created", r.status === 201 && Boolean(r.json.contextToken), r.json);
  const contextToken = r.json.contextToken;
  r = await call({}, "POST", "/portal/orders", { contextToken, packageId, phone: "0754000111", firstName: "Juma", lastName: "K", email: "juma@example.com", idempotencyKey: "smoke-portal-001" }, { origin: "http://localhost:3001" });
  check("portal order pending payment", r.status === 201 && r.json.payment.state === "PENDING", r.json);
  const orderToken = r.json.orderToken;
  r = await call({}, "POST", `/dev/simulate/orders/${orderToken}/payment`, { outcome: "completed", feeTzs: 20 });
  const status = await poll(() => call({}, "GET", `/portal/orders/${orderToken}`, undefined, { origin: null }), (x) => x.json.access?.state === "ACTIVE");
  check("guest access ACTIVE with fixed expiry", status.json.access?.state === "ACTIVE" && Boolean(status.json.access?.expiresAt), status.json);

  // ── Vouchers ──
  r = await call(reseller, "POST", "/reseller/voucher-groups", { name: "Batch A", packageId, count: 5 });
  check("voucher batch generated", r.status === 201 && r.json.created === 5, r.json);
  r = await call(reseller, "GET", `/reseller/voucher-groups/${r.json.id}/export.csv`);
  check("voucher CSV export", r.status === 200 && r.text.startsWith('"code","package"') && r.text.split("\n").length === 6, r.text.slice(0, 120));
  const voucherCodes = r.text.split("\n").slice(1).map((line) => line.split(",")[0]!.replace(/"/g, ""));

  // ── Money views ──
  r = await call(reseller, "GET", "/reseller/wallet");
  check("reseller wallet = 1000 − 20 fee − 50 platform = 930", r.json.availableTzs === "930", r.json);
  r = await call(admin, "GET", "/admin/ledger/trial-balance");
  check("trial balance balanced", r.json.balanced === true, { debits: r.json.debitsTzs, credits: r.json.creditsTzs });

  // ── Tenant isolation over HTTP ──
  r = await call({}, "POST", "/auth/register", { businessName: "Other Biz", ownerName: "Other", email: "other@smoke.test", phone: "+255713000010", password: "OtherSmoke123!", acceptTerms: true });
  const other: Session = {};
  await call(other, "POST", "/auth/login", { email: "other@smoke.test", password: "OtherSmoke123!" });
  r = await call(other, "GET", `/reseller/sites/${siteId}`);
  check("other reseller gets 404 for foreign site", r.status === 404, r.json);

  if (process.env.SMOKE_STATE_FILE) {
    writeFileSync(process.env.SMOKE_STATE_FILE, JSON.stringify({
      admin: { email: "admin@smoke.test", password: "AdminSmokePass1!", totpSecret: secret },
      agent: { email: "agent@smoke.test", password: "AgentSmoke123!", referralCode: "SMOKE1" },
      reseller: { email: "owner@smoke.test", password: "OwnerSmoke123!" },
      site: { id: siteId, slug },
      package: { id: packageId, name: "Saa 1" },
      voucherCodes,
    }, null, 2));
  }

  const failed = results.filter((x) => !x.ok);
  console.log(`\n${results.length - failed.length}/${results.length} smoke checks passed (all behaviour simulated).`);
  await prisma.$disconnect();
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
