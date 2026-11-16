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
 *
 * Two opt-ins exist because the catalog seed is normally write-once:
 *
 * - `--apply` republishes every catalog plan onto the seed file, which is how a
 *   confirmed price sheet reaches an environment that already has rows.
 * - `--confirmed` clears the "Demo price" flag, i.e. the business has agreed the
 *   numbers. Without it the catalog stays labelled as a proposal.
 * - `--archive-extra=advw1,advw2` retires plan codes that no seed ever created,
 *   which is how stray hand-made rows stop competing with the sheet.
 */
const refresh = process.argv.includes("--refresh");
const archiveLegacy = process.argv.includes("--archive-legacy");
const apply = process.argv.includes("--apply");
const confirmed = process.argv.includes("--confirmed");
// `--apply` only means something for the catalog, so it implies `--catalog`.
const catalog = process.argv.includes("--catalog") || apply;
/** Extra plan codes to retire, for rows no seed ever created: `--archive-extra=advw1,advw2`. */
const extraArg = process.argv.find((arg) => arg.startsWith("--archive-extra="));
const archiveExtra = (extraArg?.slice("--archive-extra=".length) ?? "")
  .split(",")
  .map((code) => code.trim())
  .filter(Boolean);

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
    const r = await seedPlanCatalog({ apply, isDemo: !confirmed });
    console.log(
      confirmed
        ? "[plans-seed] Two-axis catalog — prices confirmed, no longer flagged demo."
        : "[plans-seed] Two-axis catalog (capacity tier × commercial type) — prices are flagged demo.",
    );
    for (const c of r.created) console.log(`  created  ${c}`);
    for (const u of r.updated) console.log(`  updated  ${u}`);
    for (const s of r.skipped) console.log(`  skipped  ${s}`);
  } else {
    const r = await seedPlans();
    console.log(
      "[plans-seed] Starter plan catalog — every price below is flagged demo and is not a business decision.",
    );
    for (const c of r.created) console.log(`  created  ${c}`);
    for (const s of r.skipped) console.log(`  skipped  ${s}`);
  }

  if (archiveLegacy || archiveExtra.length > 0) {
    const r = await archiveLegacyCatalogPlans(archiveExtra);
    console.log(
      "[plans-seed] Retired plans from sale (existing subscribers unaffected).",
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
