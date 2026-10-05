import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Applies migrations to the *_test database before integration suites run. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://advo:replace_for_your_environment@localhost:5432/advo_test";
  if (!new URL(url).pathname.endsWith("_test")) {
    throw new Error("TEST_DATABASE_URL must point at a *_test database");
  }
  const dbPackage = resolve(dirname(fileURLToPath(import.meta.url)), "../../../db");
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: dbPackage,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
