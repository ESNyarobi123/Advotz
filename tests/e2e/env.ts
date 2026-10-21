import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";

export const API_URL = process.env.E2E_API_URL ?? "http://localhost:4100";
// Fall back to the configured public URLs so a moved dev port (WEB_PORT /
// PORTAL_PORT in the root `.env`) does not leave e2e pointing at 3000/3001.
export const WEB_URL = process.env.E2E_WEB_URL ?? process.env.WEB_PUBLIC_URL ?? "http://localhost:3000";
export const PORTAL_URL = process.env.E2E_PORTAL_URL ?? process.env.PORTAL_PUBLIC_URL ?? "http://localhost:3001";
export const STATE_FILE = fileURLToPath(new URL("./.state/smoke.json", import.meta.url));

export type SmokeState = {
  admin: { email: string; password: string; totpSecret: string };
  agent: { email: string; password: string; referralCode: string };
  reseller: { email: string; password: string };
  site: { id: string; slug: string };
  package: { id: string; name: string };
  voucherCodes: string[];
};

export function loadState(): SmokeState {
  return JSON.parse(readFileSync(STATE_FILE, "utf8")) as SmokeState;
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits) — same parameters the API enrols. */
export function totp(secret: string, atMs = Date.now()): string {
  let bits = "";
  for (const ch of secret.replace(/=+$/, "").toUpperCase()) bits += BASE32.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 30_000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1]! & 0x0f;
  const bin = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(bin % 1_000_000).padStart(6, "0");
}

/**
 * The API accepts each TOTP step once, and the smoke run has just used the current one,
 * so wait for the next 30 s window before producing a code.
 */
export async function freshTotp(secret: string): Promise<string> {
  const next = (Math.floor(Date.now() / 30_000) + 1) * 30_000;
  await new Promise((resolve) => setTimeout(resolve, next - Date.now() + 250));
  return totp(secret);
}
