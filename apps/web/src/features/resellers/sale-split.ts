/**
 * How one guest sale divides between Advo and the Reseller.
 *
 * The Reseller is only ever shown Advo's own fee. The payment provider's
 * collection fee (Snippe, or whichever gateway took the money) is a cost the
 * platform carries, so it never appears as a deduction from what the sale
 * earned: a TZS 1,500 package on a 5 % plan is "Advo fee 75, you keep 1,425",
 * never "less 37 for the gateway too".
 *
 * The percentage is the one snapshotted on the order at checkout
 * (`priceSnapshot.saleFeeBasisPoints`), so a later change to the platform fee
 * cannot rewrite the history of an old sale. Floor division matches the ledger
 * posting in `payments.service.ts` line for line.
 */
export function saleSplit(
  amountTzs: string | number | bigint,
  saleFeeBasisPoints?: number | null,
) {
  const gross =
    typeof amountTzs === "number"
      ? Math.round(amountTzs)
      : Number(typeof amountTzs === "bigint" ? amountTzs.toString() : amountTzs) || 0;
  const bps =
    saleFeeBasisPoints && saleFeeBasisPoints > 0 ? saleFeeBasisPoints : 0;
  const fee = Math.min(gross, Math.floor((gross * bps) / 10_000));
  return { gross, fee, net: gross - fee, basisPoints: bps };
}

/** "5 %" — one decimal only when the rate is not a whole number. */
export function saleFeePercent(basisPoints: number): string {
  const percent = basisPoints / 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(1)}%`;
}
