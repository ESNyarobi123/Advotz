/**
 * Helpers for reading Prisma `groupBy` results.
 *
 * Both the payments and withdrawals boards aggregate in the database and then
 * need the same two shapes: a `state -> count` map for the distribution cards,
 * and a `state -> money` map so a card can show the amount behind a bucket, not
 * just how many rows are in it. Keeping one implementation means a zero-value
 * bucket can never be `undefined` on one screen and `0` on the other.
 */

/** `[{ state: "FAILED", _count: 3 }, ...]` → `{ FAILED: 3 }`. */
export const countByState = (rows: ReadonlyArray<Record<string, unknown>>, key: string) =>
  Object.fromEntries(rows.map((row) => [String(row[key]), Number(row._count ?? 0)])) as Record<string, number>;

/** `[{ state: "FAILED", _sum: { amountTzs: 100n } }, ...]` → `{ FAILED: 100n }`. */
export const sumByState = (rows: ReadonlyArray<Record<string, unknown>>, key: string, field: string) =>
  Object.fromEntries(
    rows.map((row) => {
      const sums = row._sum as Record<string, unknown> | null | undefined;
      const value = sums?.[field];
      return [String(row[key]), typeof value === "bigint" ? value : 0n];
    }),
  ) as Record<string, bigint>;

/** Sums the buckets named in `states`, treating a missing bucket as zero. */
export const sumStates = (amounts: Record<string, bigint>, states: readonly string[]) =>
  states.reduce((total, state) => total + (amounts[state] ?? 0n), 0n);

/** Counts the buckets named in `states`, treating a missing bucket as zero. */
export const countStates = (counts: Record<string, number>, states: readonly string[]) =>
  states.reduce((total, state) => total + (counts[state] ?? 0), 0);
