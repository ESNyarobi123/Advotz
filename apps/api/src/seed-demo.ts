import "@advo/config/load-env";
import { seedDemo } from "@advo/backend";
import { prisma } from "@advo/db";

seedDemo()
  .then((r) => {
    console.log("[demo-seed] Local demo fixtures — every price/rate below is flagged demo and is not a business decision.");
    for (const c of r.created) console.log(`  created  ${c}`);
    for (const s of r.skipped) console.log(`  skipped  ${s}`);
    if (r.credentials.length) {
      console.log("[demo-seed] Demo credentials (Reseller password is fixed so it survives a re-seed; Agent is random per run):");
      for (const c of r.credentials) console.log(`  ${c.role.padEnd(8)} ${c.email}  ${c.password}`);
    }
  })
  .catch((err: unknown) => {
    console.error(`[demo-seed] ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
