import type { MessageKey } from "@advo/i18n";

/**
 * Tanzanian mobile-money wallets the portal accepts.
 *
 * `name` is a brand wordmark and is deliberately not translated; `networkKey`
 * is the operator behind the wallet, which is what a guest recognises on their
 * own handset line ("Vodacom", not "M-Pesa").
 */
export const MONEY_OPTIONS = [
  {
    id: "mpesa",
    name: "M-Pesa",
    networkKey: "portal.networkVodacom",
    tint: "#e60000",
  },
  {
    id: "airtel",
    name: "Airtel Money",
    networkKey: "portal.networkAirtel",
    tint: "#e30613",
  },
  {
    id: "mixx",
    name: "Mixx by Yas",
    networkKey: "portal.networkYas",
    tint: "#0a4ea2",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  name: string;
  networkKey: MessageKey;
  tint: string;
}>;

export type MoneyOption = (typeof MONEY_OPTIONS)[number];

/**
 * Best-effort mobile-network guess from a Tanzanian number's prefix.
 *
 * This is a *hint for the guest*, not a routing decision. The payment provider
 * takes only a phone number and resolves the operator itself, so the guess can
 * be wrong without anything breaking — which is why it is allowed to be a
 * prefix table rather than a lookup service. New prefixes (and number
 * portability) will make it stale, and that is survivable.
 */
export function detectNetwork(raw: string): MoneyOption | null {
  const digits = raw.replace(/[^\d]/g, "").replace(/^255/, "0");
  const prefix = digits.startsWith("0")
    ? digits.slice(1, 3)
    : digits.slice(0, 2);
  if (!/^\d{2}$/.test(prefix)) return null;
  if (["75", "76", "74"].includes(prefix)) return MONEY_OPTIONS[0];
  if (["78", "68", "69", "67"].includes(prefix)) return MONEY_OPTIONS[1];
  if (["65", "71", "77"].includes(prefix)) return MONEY_OPTIONS[2];
  return null;
}
