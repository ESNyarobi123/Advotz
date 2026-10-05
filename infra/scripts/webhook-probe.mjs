// Sends a signed Snippe-shaped webhook through the public proxy, then the same body with one
// byte changed. Proves the proxy forwards exact bytes (signature verifies) and that tampering
// is rejected. Uses a non-existent reference, so no money moves.
//   WEBHOOK_URL=http://api.localhost:8080/api/v1/webhooks/snippe WEBHOOK_SECRET=… node infra/scripts/webhook-probe.mjs
import { createHmac, randomBytes } from "node:crypto";

const url = process.env.WEBHOOK_URL;
const secret = process.env.WEBHOOK_SECRET;
if (!url || !secret) throw new Error("WEBHOOK_URL and WEBHOOK_SECRET are required");

// Deliberate odd spacing and a non-ASCII character: any re-serialisation would break the HMAC.
const raw = `{"id":"evt_probe_${randomBytes(6).toString("hex")}",  "type":"payment.completed","api_version":"2026-01-25","created_at":"${new Date().toISOString()}","data":{"reference":"probe-no-such-ref","status":"completed","amount":{"value":1000,"currency":"TZS"},"metadata":{"note":"Dar es Salaam — probe"}}}`;

async function send(body, label) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", secret).update(`${ts}.`).update(Buffer.from(raw)).digest("hex");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-timestamp": ts, "x-webhook-signature": signature },
    body,
  });
  console.log(`${label}: HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
  return res.status;
}

const exact = await send(raw, "exact bytes ");
const tampered = await send(raw.replace("1000", "9000"), "tampered    ");
const ok = exact !== 401 && tampered === 401;
console.log(ok ? "PASS raw body preserved and tampering rejected" : "FAIL");
process.exit(ok ? 0 : 1);
