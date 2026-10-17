import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function slugifyBusinessName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const suffix = randomBytes(3).toString("hex");
  return `${base || "reseller"}-${suffix}`;
}

/** Compact idempotency key: prefix + 24 chars (Snippe max 30). */
export function compactIdempotencyKey(prefix = "a"): string {
  const id = randomBytes(18).toString("base64url").slice(0, 24);
  return `${prefix}${id}`.slice(0, 30);
}

/** Stable JSON: object keys sorted so the same request always hashes identically. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(typeof value === "bigint" ? value.toString() : value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

function deriveKey(secret: string, purpose: string): Buffer {
  return createHash("sha256").update(`${purpose}:${secret}`).digest();
}

function encryptionSecret(): string {
  const secret = process.env.SECRETS_ENCRYPTION_KEY;
  if (!secret || secret.length < 16) {
    throw new Error("SECRETS_ENCRYPTION_KEY is not configured");
  }
  return secret;
}

const KEY_VERSION = "v1";

/** AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext> (base64url). */
export function encryptSecret(plaintext: string): string {
  const key = deriveKey(encryptionSecret(), "secrets");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [KEY_VERSION, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(payload: string): string {
  const [version, ivB64, tagB64, ctB64] = payload.split(".");
  if (version !== KEY_VERSION || !ivB64 || !tagB64 || !ctB64) {
    throw new Error("Unsupported ciphertext format");
  }
  const key = deriveKey(encryptionSecret(), "secrets");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Deterministic bearer token for a record (e.g. an order's public status token), so an
 * idempotent replay can return the same token without the plaintext being stored.
 */
export function derivePublicToken(purpose: string, id: string): string {
  return createHmac("sha256", deriveKey(encryptionSecret(), `public-token:${purpose}`)).update(id).digest("base64url");
}

/** Keyed lookup hash for voucher codes; case/spacing-insensitive. */
export function voucherLookupHash(code: string): string {
  const key = process.env.VOUCHER_LOOKUP_HMAC_KEY;
  if (!key || key.length < 16) {
    throw new Error("VOUCHER_LOOKUP_HMAC_KEY is not configured");
  }
  return createHmac("sha256", key).update(normalizeVoucherCode(code)).digest("hex");
}

export function normalizeVoucherCode(code: string): string {
  // Spaces/dashes ignored. Keeps A–Z so legacy 12-symbol batches still redeem.
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Six-digit numeric code for counter sales (000000–999999).
 *
 * ≈ 20 bits of entropy: fine for a captive portal that already rate-limits
 * redemptions per IP and MAC. Printed large and unambiguous — no letters.
 */
export function generateVoucherCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function constantTimeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// ───────────── TOTP (RFC 6238, SHA-1, 30s, 6 digits) ─────────────

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(): string {
  const bytes = randomBytes(20);
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32[parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

function base32Decode(input: string): Buffer {
  let bits = "";
  for (const ch of input.replace(/=+$/, "").toUpperCase()) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) throw new Error("Invalid base32");
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function totpCode(secret: string, atMs = Date.now()): string {
  const counter = Math.floor(atMs / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const bin =
    ((hmac[offset]! & 0x7f) << 24) |
    (hmac[offset + 1]! << 16) |
    (hmac[offset + 2]! << 8) |
    hmac[offset + 3]!;
  return (bin % 1_000_000).toString().padStart(6, "0");
}

/** Returns the 30-second time step the code belongs to (±1 step drift), or null when it does not match. */
export function matchTotpStep(secret: string, code: string, atMs = Date.now()): number | null {
  const cleaned = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(cleaned)) return null;
  for (const drift of [-1, 0, 1]) {
    const at = atMs + drift * 30_000;
    if (constantTimeEqualHex(totpCode(secret, at), cleaned)) {
      return Math.floor(at / 1000 / 30);
    }
  }
  return null;
}

export function verifyTotp(secret: string, code: string, atMs = Date.now()): boolean {
  return matchTotpStep(secret, code, atMs) !== null;
}

/**
 * Development-only fixed TOTP code.
 *
 * A 30-second rotating code is the entire point of TOTP, which makes iterating on
 * Admin-only screens tedious: every sign-in needs a phone in hand. When
 * `DEV_FIXED_OTP` holds a 6-digit code and we are not in production, that single
 * code is accepted indefinitely instead.
 *
 * The environment check is evaluated first, so a production process can never
 * accept it even if the variable leaks into the runtime — the same fence the fake
 * payment and Omada providers sit behind.
 */
export function isDevFixedOtp(code: string): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const configured = process.env.DEV_FIXED_OTP?.trim();
  if (!configured || !/^\d{6}$/.test(configured)) return false;
  return constantTimeEqualHex(configured, code.replace(/\s/g, ""));
}
