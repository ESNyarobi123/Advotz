/**
 * Clears reseller accounts from the database.
 *
 * Dry-run by default: it prints exactly which accounts would go, what would be
 * erased and what would be anonymised, and how many devices would be released.
 * Nothing is deleted until `--confirm CLEAR` is passed.
 *
 *   pnpm --filter @advo/api reseller:clear                       # preview
 *   pnpm --filter @advo/api reseller:clear --confirm CLEAR       # execute
 *   pnpm --filter @advo/api reseller:clear --confirm CLEAR --all # include CLOSED
 *   pnpm --filter @advo/api reseller:clear --confirm CLEAR --purge-ledger
 *
 * `--purge-ledger` is the factory reset: it also removes the reseller's ledger
 * journals and accounts, which normal deletion never touches. Take a database
 * backup first.
 */
import "@advo/config/load-env";
import { prisma } from "@advo/db";
import { deleteReseller, planPurge } from "@advo/backend";

const CONFIRM_WORD = "CLEAR";

type Row = {
  id: string;
  businessName: string;
  status: string;
  email: string;
  sites: number;
  devices: number;
  orders: number;
  invoices: number;
  ledgerLines: number;
};

async function inventory(includeClosed: boolean): Promise<Row[]> {
  const resellers = await prisma.reseller.findMany({
    where: includeClosed ? {} : { status: { not: "CLOSED" } },
    select: {
      id: true,
      businessName: true,
      status: true,
      owner: { select: { email: true } },
      _count: { select: { sites: true, devices: true, orders: true, invoices: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return Promise.all(
    resellers.map(async (reseller) => {
      const ledger = await prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT COUNT(*)::bigint AS n
          FROM "JournalLine" jl
          JOIN "LedgerAccount" la ON la.id = jl."accountId"
         WHERE la."ownerType" = 'RESELLER' AND la."ownerId" = ${reseller.id}
      `;
      return {
        id: reseller.id,
        businessName: reseller.businessName,
        status: reseller.status,
        email: reseller.owner.email,
        sites: reseller._count.sites,
        devices: reseller._count.devices,
        orders: reseller._count.orders,
        invoices: reseller._count.invoices,
        ledgerLines: Number(ledger[0]?.n ?? 0),
      };
    }),
  );
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const confirmIndex = process.argv.indexOf("--confirm");
  const confirmation = confirmIndex >= 0 ? process.argv[confirmIndex + 1] : undefined;
  const execute = confirmation === CONFIRM_WORD;
  const includeClosed = args.has("--all");
  const eraseLedger = args.has("--purge-ledger");

  if (confirmIndex >= 0 && !execute) {
    console.error(`Refusing to run: --confirm must be followed by ${CONFIRM_WORD}.`);
    process.exit(1);
  }

  const rows = await inventory(includeClosed);
  if (rows.length === 0) {
    console.log("No reseller accounts match. Nothing to do.");
    return;
  }

  console.log(`\n${execute ? "Erasing" : "Would erase"} ${rows.length} reseller account(s):\n`);
  for (const row of rows) {
    const plan = await planPurge(row.id);
    const outcome = eraseLedger || !plan.keepFinancials ? "erase" : "anonymize";
    const why = plan.keepFinancials && !eraseLedger ? ` (keeps: ${plan.reason.join(", ")})` : "";
    console.log(
      `- ${row.businessName} <${row.email}> [${row.status}] ` +
        `sites=${row.sites} devices=${row.devices} orders=${row.orders} invoices=${row.invoices} ledgerLines=${row.ledgerLines} ` +
        `→ ${outcome}${why}`,
    );
  }

  if (!execute) {
    console.log(
      `\nPreview only. Re-run with --confirm ${CONFIRM_WORD} to delete.` +
        (eraseLedger ? "" : "\nAdd --purge-ledger to remove the ledger rows too (factory reset)."),
    );
    return;
  }

  if (eraseLedger) {
    console.log("\n--purge-ledger is active: ledger journals and accounts will be removed too.");
  }

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
  if (!admin) {
    console.error("No ADMIN account exists, so the deletion cannot be audited. Aborting.");
    process.exit(1);
  }
  console.log(`Audit actor: ${admin.email}\n`);

  const failures: Array<{ email: string; error: string }> = [];
  let erased = 0;
  let anonymized = 0;
  let devices = 0;

  for (const row of rows) {
    if (eraseLedger) {
      // One transaction per account: a failure leaves that account untouched.
      const result = await eraseOneWithLedger(row, admin.id);
      if (result.ok) {
        erased += 1;
        devices += result.devices;
        console.log(`OK   ${row.email} → ${result.mode}`);
      } else {
        failures.push({ email: row.email, error: result.error });
        console.log(`FAIL ${row.email} → ${result.error}`);
      }
      continue;
    }

    try {
      const result = await deleteReseller(admin.id, row.id, "Database reset from the operator CLI");
      if (result.deleted === "erased") erased += 1;
      else anonymized += 1;
      devices += result.devicesReleased;
      console.log(`OK   ${row.email} → ${result.deleted}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ email: row.email, error: message });
      console.log(`FAIL ${row.email} → ${message}`);
    }
  }

  console.log(
    `\nDone. erased=${erased} anonymized=${anonymized} devicesReleased=${devices} failed=${failures.length}`,
  );
  if (failures.length > 0) {
    for (const failure of failures) console.log(`  - ${failure.email}: ${failure.error}`);
    process.exitCode = 1;
  }
}

/** Factory-reset path: ledger goes as well, so no anonymized rows remain. */
async function eraseOneWithLedger(
  row: Row,
  adminUserId: string,
): Promise<{ ok: true; mode: string; devices: number } | { ok: false; error: string }> {
  const owner = await prisma.user.findUnique({
    where: { email: row.email },
    select: { id: true, email: true, agent: { select: { id: true } } },
  });
  if (!owner) return { ok: false, error: "owner user row is missing" };
  if (owner.agent) return { ok: false, error: "owner is also an agent; close the agent first" };

  try {
    const { purgeResellerData } = await import("@advo/backend");
    const result = await prisma.$transaction(async (tx) => {
      await tx.authSession.updateMany({ where: { userId: owner.id }, data: { revokedAt: new Date() } });
      const purged = await purgeResellerData(tx, {
        resellerId: row.id,
        ownerUserId: owner.id,
        ownerEmail: owner.email,
        eraseLedger: true,
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: adminUserId,
          action: "reseller.deleted",
          targetType: "Reseller",
          targetId: row.id,
          reason: "Database reset from the operator CLI",
          metadata: { erased: true, ledgerPurged: true, businessName: row.businessName },
        },
      });
      return purged;
    });
    return { ok: true, mode: result.mode, devices: result.devicesReleased };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

main()
  .catch((error) => {
    console.error("FAILED", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
