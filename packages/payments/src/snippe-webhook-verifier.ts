import { createHmac, timingSafeEqual } from "node:crypto";

export type WebhookVerification =
  | { ok: true; stale: boolean; timestampSeconds: number }
  | { ok: false; reason: "missing_headers" | "missing_secret" | "malformed_timestamp" | "bad_signature" | "future_timestamp" };

export type VerifyOptions = {
  rawBody: Buffer;
  signature: string | undefined;
  timestamp: string | undefined;
  secret: string;
  nowSeconds?: number;
  /**
   * Snippe retries for ~45 minutes (immediate, +3, +6, +12, +24 min) using the original
   * event timestamp, so a 5-minute window would reject legitimate retries. Signed events
   * older than this are reported `stale` and must be confirmed by a provider lookup.
   */
  maxAgeSeconds?: number;
  futureSkewSeconds?: number;
};

/**
 * Verifies X-Webhook-Signature = hex(HMAC-SHA256(secret, `${timestamp}.${rawBody}`)) over the
 * exact received bytes (Snippe docs 2026-01-25). The body is never re-serialized.
 */
export function verifySnippeWebhook(opts: VerifyOptions): WebhookVerification {
  if (!opts.secret) return { ok: false, reason: "missing_secret" };
  if (!opts.signature || !opts.timestamp) return { ok: false, reason: "missing_headers" };
  if (!/^\d{1,12}$/.test(opts.timestamp)) return { ok: false, reason: "malformed_timestamp" };

  const expected = computeSnippeSignature(opts.rawBody, opts.timestamp, opts.secret);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(opts.signature.trim().toLowerCase(), "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }

  const ts = Number(opts.timestamp);
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (ts - now > (opts.futureSkewSeconds ?? 300)) {
    return { ok: false, reason: "future_timestamp" };
  }
  const stale = now - ts > (opts.maxAgeSeconds ?? 3600);
  return { ok: true, stale, timestampSeconds: ts };
}

export function computeSnippeSignature(rawBody: Buffer | string, timestamp: string | number, secret: string): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(`${timestamp}.`, "utf8");
  hmac.update(typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody);
  return hmac.digest("hex");
}
