import { describe, expect, it } from "vitest";
import { calculateCommission } from "./commissions/commissions.service.js";
import { csvCell } from "./catalog/vouchers.service.js";
import { enforcementGaps } from "./catalog/packages.service.js";
import { allUnsupported } from "@advo/omada";
import {
  decryptSecret,
  derivePublicToken,
  encryptSecret,
  generateTotpSecret,
  generateVoucherCode,
  normalizeVoucherCode,
  totpCode,
  verifyTotp,
  voucherLookupHash,
} from "../common/crypto.js";

describe("commission calculation (integer TZS, basis points)", () => {
  const pct = (bps: number, cap: bigint | null = null) => ({ mode: "PERCENTAGE" as const, basisPoints: bps, fixedTzs: null, maxPerInvoiceTzs: cap });

  it("floors percentage commissions", () => {
    expect(calculateCommission(pct(1000), 20_000n)).toBe(2_000n);
    expect(calculateCommission(pct(333), 10_001n)).toBe(333n); // 333.0333 → 333
    expect(calculateCommission(pct(1), 9_999n)).toBe(0n);
  });

  it("applies caps and never exceeds the eligible base", () => {
    expect(calculateCommission(pct(5000, 1_000n), 20_000n)).toBe(1_000n);
    expect(calculateCommission({ mode: "FIXED", fixedTzs: 50_000n, basisPoints: null, maxPerInvoiceTzs: null }, 20_000n)).toBe(20_000n);
  });

  it("rejects out-of-range basis points", () => {
    expect(() => calculateCommission(pct(10_001), 1_000n)).toThrow();
  });
});

describe("voucher codes and CSV export", () => {
  it("generates six-digit numeric codes and normalizes input", () => {
    const code = generateVoucherCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(normalizeVoucherCode(`${code.slice(0, 3)}-${code.slice(3)}`)).toBe(code);
    expect(normalizeVoucherCode(`${code.slice(0, 3)} ${code.slice(3)}`)).toBe(code);
    expect(voucherLookupHash(code)).toBe(voucherLookupHash(`${code.slice(0, 3)}-${code.slice(3)}`));
  });

  it("neutralises spreadsheet formula injection", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("+1")).toBe(`"'+1"`);
    expect(csvCell("-1")).toBe(`"'-1"`);
    expect(csvCell("@a")).toBe(`"'@a"`);
    expect(csvCell("482917")).toBe(`"482917"`);
  });
});

describe("secrets, tokens and TOTP", () => {
  it("round-trips AES-GCM secrets and rejects tampering", () => {
    const enc = encryptSecret("operator-password");
    expect(decryptSecret(enc)).toBe("operator-password");
    const parts = enc.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });

  it("derives stable, purpose-scoped public tokens", () => {
    expect(derivePublicToken("order", "x")).toBe(derivePublicToken("order", "x"));
    expect(derivePublicToken("order", "x")).not.toBe(derivePublicToken("voucher-grant", "x"));
  });

  it("verifies TOTP within one step of drift only", () => {
    const secret = generateTotpSecret();
    const t = 1_790_000_000_000;
    expect(verifyTotp(secret, totpCode(secret, t), t)).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, t - 30_000), t)).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, t - 120_000), t)).toBe(false);
  });
});

describe("package enforceability", () => {
  it("blocks packages when the Controller lacks the needed capability", () => {
    expect(enforcementGaps({ downloadKbps: null, uploadKbps: null, quotaType: "UNLIMITED" }, null)).toHaveLength(1);
    const caps = allUnsupported("not verified");
    expect(enforcementGaps({ downloadKbps: 1024, uploadKbps: null, quotaType: "TOTAL" }, caps).length).toBeGreaterThanOrEqual(3);
  });
});
