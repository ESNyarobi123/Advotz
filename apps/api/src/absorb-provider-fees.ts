/**
 * Moves already-booked provider (gateway) fees off Reseller wallets and onto the
 * platform's own cost line.
 *
 * A Reseller must only ever see Advo's fee deducted: a TZS 1,500 package on a
 * 5 % plan is 1,425 in the wallet, whether or not Snippe took 37 to collect the
 * money. Sales booked before that rule took the gateway fee out of the
 * Reseller's share, so their balances are short by exactly that fee. This posts
 * one corrective journal per affected receipt.
 *
 * Dry-run by default: it prints every receipt it would repair and the shortfall,
 * and changes nothing until `--confirm ABSORB` is passed.
 *
 *   pnpm --filter @advo/api payments:absorb-fees                    # preview
 *   pnpm --filter @advo/api payments:absorb-fees --confirm ABSORB   # execute
 */
import "@advo/config/load-env";
import { planFeeAbsorption, absorbProviderFee } from "@advo/backend";

const CONFIRM_WORD = "ABSORB";

const tzs = (value: bigint) =>
  `TZS ${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

async function main() {
  const confirmIndex = process.argv.indexOf("--confirm");
  const confirmation = confirmIndex >= 0 ? process.argv[confirmIndex + 1] : undefined;
  const execute = confirmation === CONFIRM_WORD;

  if (confirmIndex >= 0 && !execute) {
    console.error(`Refusing to run: --confirm must be followed by ${CONFIRM_WORD}.`);
    process.exit(1);
  }

  const rows = await planFeeAbsorption();
  if (rows.length === 0) {
    console.log("Every completed sale already credits the Reseller price less Advo's fee. Nothing to do.");
    return;
  }

  let total = 0n;
  console.log(
    `\n${execute ? "Absorbing" : "Would absorb"} the gateway fee on ${rows.length} sale receipt(s):\n`,
  );
  for (const row of rows) {
    total += row.gapTzs;
    console.log(
      `- ${row.businessName} · order ${row.orderId.slice(0, 8)} · ` +
        `price ${tzs(row.grossTzs)} · gateway fee ${tzs(row.providerFeeTzs)} · ` +
        `credited ${tzs(row.creditedTzs)} → ${tzs(row.expectedTzs)} ` +
        `(top up ${tzs(row.gapTzs)})`,
    );
  }
  console.log(`\nTotal moved from the platform's cost line to Reseller wallets: ${tzs(total)}`);

  if (!execute) {
    console.log(`\nPreview only. Re-run with --confirm ${CONFIRM_WORD} to post the corrections.`);
    return;
  }

  let posted = 0;
  for (const row of rows) {
    if (await absorbProviderFee(row)) posted += 1;
  }
  console.log(`\nDone. posted=${posted} total=${tzs(total)}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("@advo/db");
    await prisma.$disconnect();
  });
