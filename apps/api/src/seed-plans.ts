import "@advo/config/load-env";
import {
  archiveLegacyCatalogPlans,
  refreshStarterPlans,
  seedPlanCatalog,
  seedPlans,
} from "@advo/backend";
import { prisma } from "@advo/db";

/**
 * `pnpm db:seed:plans` creates the starter catalog.
 * `pnpm db:seed:plans --refresh` additionally republishes the five starter codes
 * onto the current presets when they have drifted, and migrates their
 * subscribers — see `refreshStarterPlans` for why that is a separate, opt-in step.
 *
 * `pnpm db:seed:plans --catalog` creates the two-axis catalog (4 capacity tiers ×
 * Advo Partner / Independent). `--archive-legacy` additionally retires the
 * pre-matrix plans from sale; existing subscribers keep their entitlements.
 */
const refresh = process.argv.includes("--refresh");
const catalog = process.argv.includes("--catalog");
const archiveLegacy = process.argv.includes("--archive-legacy");

async function main() {
  if (refresh) {
    const r = await refreshStarterPlans();
    console.log(
      "[plans-seed] Refresh — publishing the current presets as new versions.",
    );
    for (const row of r.refreshed) {
      console.log(
        `  refreshed ${row.code}: v${row.from} → v${row.to}, ${row.migrated} subscription(s) moved`,
      );
    }
    for (const note of r.unchanged) console.log(`  unchanged ${note}`);
    console.log(
      "[plans-seed] Nothing was repriced and no admin-authored plan was touched.",
    );
    return;
  }

  if (catalog) {
    const r = await seedPlanCatalog();
    console.log(
      "[plans-seed] Two-axis catalog (capacity tier × commercial type) — prices are flagged demo.",
    );
    for (const c of r.created) console.log(`  created  ${c}`);
    for (const s of r.skipped) console.log(`  skipped  ${s}`);
  } else {
    const r = await seedPlans();
    console.log(
      "[plans-seed] Starter plan catalog — every price below is flagged demo and is not a business decision.",
    );
    for (const c of r.created) console.log(`  created  ${c}`);
    for (const s of r.skipped) console.log(`  skipped  ${s}`);
  }

  if (archiveLegacy) {
    const r = await archiveLegacyCatalogPlans();
    console.log(
      "[plans-seed] Retired the pre-matrix plans from sale (subscribers unaffected).",
    );
    for (const a of r.archived) console.log(`  archived ${a}`);
    for (const m of r.missing) console.log(`  already gone ${m}`);
  }
}

main()
  .catch((err: unknown) => {
    console.error(
      `[plans-seed] ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
