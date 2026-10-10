import "@advo/config/load-env";
import { refreshStarterPlans, seedPlans } from "@advo/backend";
import { prisma } from "@advo/db";

/**
 * `pnpm db:seed:plans` creates the starter catalog.
 * `pnpm db:seed:plans --refresh` additionally republishes the five starter codes
 * onto the current presets when they have drifted, and migrates their
 * subscribers — see `refreshStarterPlans` for why that is a separate, opt-in step.
 */
const refresh = process.argv.includes("--refresh");

(refresh ? refreshStarterPlans() : seedPlans())
  .then((r) => {
    if (refresh) {
      console.log("[plans-seed] Refresh — publishing the current presets as new versions.");
      for (const row of (r as Awaited<ReturnType<typeof refreshStarterPlans>>).refreshed) {
        console.log(`  refreshed ${row.code}: v${row.from} → v${row.to}, ${row.migrated} subscription(s) moved`);
      }
      for (const note of (r as Awaited<ReturnType<typeof refreshStarterPlans>>).unchanged) console.log(`  unchanged ${note}`);
      console.log("[plans-seed] Nothing was repriced and no admin-authored plan was touched.");
      return;
    }
    console.log("[plans-seed] Starter plan catalog — every price below is flagged demo and is not a business decision.");
    const created = (r as Awaited<ReturnType<typeof seedPlans>>).created;
    for (const c of created) console.log(`  created  ${c}`);
    for (const s of (r as Awaited<ReturnType<typeof seedPlans>>).skipped) console.log(`  skipped  ${s}`);
  })
  .catch((err: unknown) => {
    console.error(`[plans-seed] ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
