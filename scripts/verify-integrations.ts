/**
 * Safe integration readiness checks — never creates payments, payouts, sites or authorisations.
 *
 *   pnpm verify:integrations
 *
 * Snippe: credential presence, webhook-signature self-test with the configured secret, and TLS
 * reachability of SNIPPE_BASE_URL (status code only — no endpoint is assumed).
 * Omada: contract file validation against the capability list, and (OMADA_MODE=live) a
 * read-only controller inspection plus capability readback.
 * Live money movement is out of scope here; follow docs/runbooks.md#live-validation.
 */
import "@advo/config/load-env";
import { randomBytes } from "node:crypto";
import { loadServerEnv } from "@advo/config";
import { CAPABILITY_OPERATIONS, LiveOmadaAdapter, loadOpenApiContract, type OpenApiContract } from "@advo/omada";
import { computeSnippeSignature, verifySnippeWebhook } from "@advo/payments";

type Level = "ok" | "warn" | "fail" | "info";
const results: Array<{ level: Level; area: string; message: string }> = [];
const report = (level: Level, area: string, message: string) => results.push({ level, area, message });

async function reachability(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { method: "GET", redirect: "manual", signal: controller.signal });
    return { ok: true as const, status: res.status };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? (err.cause instanceof Error ? err.cause.message : err.message) : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

async function checkSnippe() {
  const provider = process.env.PAYMENT_PROVIDER ?? "fake";
  if (provider !== "snippe") {
    report("info", "snippe", `PAYMENT_PROVIDER=${provider} — Snippe not in use; simulated payments prove nothing about Snippe`);
    return;
  }
  const key = process.env.SNIPPE_API_KEY ?? "";
  const secret = process.env.SNIPPE_WEBHOOK_SECRET ?? "";
  report(key ? "ok" : "fail", "snippe", key ? "SNIPPE_API_KEY present" : "SNIPPE_API_KEY missing");
  report(secret ? "ok" : "fail", "snippe", secret ? "SNIPPE_WEBHOOK_SECRET present" : "SNIPPE_WEBHOOK_SECRET missing");
  report(process.env.SNIPPE_ACCOUNT_ID ? "ok" : "warn", "snippe", process.env.SNIPPE_ACCOUNT_ID ? "SNIPPE_ACCOUNT_ID set" : "SNIPPE_ACCOUNT_ID empty — inbox/idempotency keys fall back to a default account id");
  const webhookUrl = process.env.SNIPPE_WEBHOOK_URL ?? "";
  report(webhookUrl.startsWith("https://") ? "ok" : "warn", "snippe", webhookUrl ? `SNIPPE_WEBHOOK_URL=${webhookUrl}` : "SNIPPE_WEBHOOK_URL empty — Snippe cannot deliver webhooks");

  if (secret) {
    const raw = Buffer.from(JSON.stringify({ id: `evt_selftest_${randomBytes(4).toString("hex")}`, type: "selftest" }));
    const ts = String(Math.floor(Date.now() / 1000));
    const good = verifySnippeWebhook({ rawBody: raw, timestamp: ts, secret, signature: computeSnippeSignature(raw, ts, secret) });
    const bad = verifySnippeWebhook({ rawBody: Buffer.concat([raw, Buffer.from(" ")]), timestamp: ts, secret, signature: computeSnippeSignature(raw, ts, secret) });
    report(good.ok && !bad.ok ? "ok" : "fail", "snippe", "Webhook signature self-test (local HMAC only; does not prove Snippe's live format)");
  }

  const base = process.env.SNIPPE_BASE_URL ?? "https://api.snippe.sh";
  const r = await reachability(base);
  report(r.ok ? "ok" : "warn", "snippe", r.ok ? `TLS reachability ${base} → HTTP ${r.status} (reachability only)` : `Cannot reach ${base}: ${r.error}`);
  report(
    process.env.ALLOW_LIVE_FINANCIAL_TESTS === "true" ? "warn" : "info",
    "snippe",
    `ALLOW_LIVE_FINANCIAL_TESTS=${process.env.ALLOW_LIVE_FINANCIAL_TESTS ?? "false"} — this script never moves money either way`,
  );
}

function checkContract(): OpenApiContract | null {
  const path = process.env.OMADA_OPENAPI_CONTRACT_PATH ?? "";
  if (!path) {
    report(process.env.OMADA_MODE === "live" ? "warn" : "info", "omada", "OMADA_OPENAPI_CONTRACT_PATH empty — all Open API operations are unsupported");
    return null;
  }
  try {
    const contract = loadOpenApiContract(path);
    const ops = Object.entries(contract.operations);
    const verified = ops.filter(([, op]) => op.verified).map(([name]) => name);
    report("ok", "omada", `Contract ${path}: Controller ${contract.controllerVersion}, ${ops.length} operations (${verified.length} verified), source "${contract.documentSource}"`);
    for (const [name, op] of ops) {
      if (!op.verified) report("warn", "omada", `Operation ${name} declared but not verified (${op.method} ${op.path})`);
      else if (!op.evidence) report("warn", "omada", `Operation ${name} verified without an evidence note`);
    }
    return contract;
  } catch (err) {
    report("fail", "omada", `Contract ${path} invalid: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function checkOmada() {
  const mode = process.env.OMADA_MODE ?? "fake";
  const contract = checkContract();
  if (mode !== "live") {
    report("info", "omada", `OMADA_MODE=${mode} — simulator results prove nothing about Controller behaviour`);
    return;
  }
  const baseUrl = process.env.OMADA_BASE_URL ?? "";
  const omadacId = process.env.OMADA_CONTROLLER_ID ?? "";
  if (!baseUrl || !omadacId) {
    report("fail", "omada", "OMADA_MODE=live requires OMADA_BASE_URL and OMADA_CONTROLLER_ID");
    return;
  }
  const clientId = process.env.OMADA_CLIENT_ID ?? "";
  const clientSecret = process.env.OMADA_CLIENT_SECRET ?? "";
  const adapter = new LiveOmadaAdapter({
    baseUrl,
    omadacId,
    version: process.env.OMADA_CONTROLLER_VERSION ?? "",
    caCertPath: process.env.OMADA_CA_CERT_PATH || undefined,
    openApi: clientId && clientSecret ? { clientId, clientSecret, contract } : undefined,
    verifiedCapabilities: {},
  });
  const inspection = await adapter.inspectController();
  report(inspection.reachable ? "ok" : "fail", "omada", `Controller ${baseUrl}: ${inspection.reachable ? "reachable" : "unreachable"} — ${inspection.detail ?? ""} (version ${inspection.version || "unknown"})`);
  const caps = await adapter.getCapabilities();
  for (const op of CAPABILITY_OPERATIONS) {
    const c = caps[op];
    report(c.supported && c.verified ? "ok" : "info", "omada", `capability ${op}: ${c.supported ? (c.verified ? "supported, verified" : "declared, NOT verified") : "unsupported"}${c.reason ? ` — ${c.reason}` : ""}`);
  }
  report("info", "omada", "Portal authorisation, quota and adoption need lab evidence (tests/hardware); this script does not authorise clients");
}

async function main() {
  try {
    const env = loadServerEnv(process.env);
    report("ok", "config", `Environment valid (NODE_ENV=${env.NODE_ENV})`);
  } catch (err) {
    report("fail", "config", err instanceof Error ? err.message.replace(/\n/g, "; ") : String(err));
  }
  await checkSnippe();
  await checkOmada();

  const icon: Record<Level, string> = { ok: "PASS", warn: "WARN", fail: "FAIL", info: "INFO" };
  console.log("Integration readiness (read-only):");
  for (const r of results) console.log(`  ${icon[r.level]}  [${r.area}] ${r.message}`);
  const failed = results.filter((r) => r.level === "fail").length;
  console.log(failed ? `\n${failed} blocking problem(s).` : "\nNo blocking problems found. PASS lines are readiness checks, not proof of live behaviour.");
  process.exit(failed ? 1 : 0);
}

void main();
