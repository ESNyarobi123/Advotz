import { prisma } from "@advo/db";

/**
 * Empties every application table. Refuses to run unless the connected database name ends in
 * `_test`, so an integration run can never wipe a development or production database.
 */
export async function resetTestDatabase() {
  const rows = await prisma.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  const name = rows[0]?.current_database ?? "";
  if (!name.endsWith("_test")) {
    throw new Error(`Refusing to reset database "${name}": integration tests require a *_test database`);
  }
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  // TRUNCATE does not fire the append-only row triggers on Journal/JournalLine.
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}
