import { describe, expect, it } from "vitest";
import { computeSnippeSignature, verifySnippeWebhook } from "./snippe-webhook-verifier.js";
import { FakePaymentProvider, FAKE_SCENARIO_PHONES } from "./fake.provider.js";

const secret = "whsec_test_only";
const body = Buffer.from('{"id":"evt_1","type":"payment.completed","data":{"reference":"pi_1"}}');
const now = 1_790_000_000;

function verify(overrides: Partial<Parameters<typeof verifySnippeWebhook>[0]> = {}) {
  const ts = String(now);
  return verifySnippeWebhook({
    rawBody: body,
    timestamp: ts,
    signature: computeSnippeSignature(body, ts, secret),
    secret,
    nowSeconds: now,
    ...overrides,
  });
}

describe("Snippe webhook verification (HMAC-SHA256 over `${ts}.${rawBody}`)", () => {
  it("accepts a correctly signed fresh event", () => {
    expect(verify()).toEqual({ ok: true, stale: false, timestampSeconds: now });
  });

  it("rejects a modified body even by one byte", () => {
    const tampered = Buffer.from(body.toString().replace("pi_1", "pi_2"));
    expect(verify({ rawBody: tampered })).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a signature made with another secret", () => {
    const ts = String(now);
    expect(verify({ signature: computeSnippeSignature(body, ts, "other") })).toMatchObject({ ok: false, reason: "bad_signature" });
  });

  it("binds the timestamp into the signature", () => {
    expect(verify({ timestamp: String(now + 1) })).toMatchObject({ ok: false, reason: "bad_signature" });
  });

  it("rejects missing headers, missing secret and malformed timestamps", () => {
    expect(verify({ signature: undefined })).toMatchObject({ reason: "missing_headers" });
    expect(verify({ secret: "" })).toMatchObject({ reason: "missing_secret" });
    expect(verify({ timestamp: "12ab" })).toMatchObject({ reason: "malformed_timestamp" });
  });

  it("rejects timestamps too far in the future", () => {
    const ts = String(now + 3600);
    expect(verify({ timestamp: ts, signature: computeSnippeSignature(body, ts, secret) })).toMatchObject({ reason: "future_timestamp" });
  });

  it("keeps signed retries inside the retry window and flags older ones as stale", () => {
    const retryTs = String(now - 45 * 60);
    expect(verify({ timestamp: retryTs, signature: computeSnippeSignature(body, retryTs, secret) })).toMatchObject({ ok: true, stale: false });
    const oldTs = String(now - 2 * 3600);
    expect(verify({ timestamp: oldTs, signature: computeSnippeSignature(body, oldTs, secret) })).toMatchObject({ ok: true, stale: true });
  });
});

describe("FakePaymentProvider (simulation only)", () => {
  const req = { amountTzs: 1000, phoneNumber: "+255712000111", firstName: "A", lastName: "B", email: "a@b.co" };

  it("returns the same reference for the same idempotency key", async () => {
    const p = new FakePaymentProvider();
    const a = await p.createMobilePayment(req, "key-1");
    const b = await p.createMobilePayment(req, "key-1");
    expect(a.reference).toBe(b.reference);
  });

  it("simulates an accepted-but-timed-out create that a lookup can find", async () => {
    const p = new FakePaymentProvider();
    await expect(p.createMobilePayment({ ...req, phoneNumber: FAKE_SCENARIO_PHONES.createTimeout }, "key-2")).rejects.toMatchObject({ ambiguous: true });
    const again = await p.createMobilePayment({ ...req, phoneNumber: FAKE_SCENARIO_PHONES.createTimeout }, "key-2");
    expect((await p.getPayment(again.reference)).status).toBe("pending");
  });

  it("enforces Snippe minimums", async () => {
    const p = new FakePaymentProvider();
    await expect(p.createMobilePayment({ ...req, amountTzs: 499 }, "key-3")).rejects.toMatchObject({ kind: "validation" });
  });
});
