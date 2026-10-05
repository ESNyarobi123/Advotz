/**
 * Validates the environment (same schema the API/worker use at startup) and the toolchain.
 *   pnpm verify:config
 */
import "@advo/config/load-env";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { loadServerEnv } from "@advo/config";

const problems: string[] = [];
const lines: string[] = [];

function checkEnv() {
  try {
    const env = loadServerEnv(process.env);
    lines.push(
      `env: NODE_ENV=${env.NODE_ENV} PAYMENT_PROVIDER=${env.PAYMENT_PROVIDER} OMADA_MODE=${env.OMADA_MODE}`,
      `env: BUSINESS_TIMEZONE=${env.BUSINESS_TIMEZONE} DEFAULT_CURRENCY=${env.DEFAULT_CURRENCY} RATE_LIMIT_BACKEND=${env.RATE_LIMIT_BACKEND}`,
    );
    if (env.NODE_ENV !== "production" && (env.PAYMENT_PROVIDER === "fake" || env.OMADA_MODE === "fake")) {
      lines.push("env: fake providers active — local simulation only");
    }
  } catch (err) {
    problems.push(err instanceof Error ? err.message : String(err));
  }
}

function checkToolchain() {
  const root = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { packageManager: string };
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  lines.push(`node: ${process.versions.node}`);
  if (nodeMajor < 24) problems.push(`Node ${process.versions.node} is below the supported baseline (24)`);
  if (nodeMajor % 2 === 1) lines.push("node: odd-numbered (non-LTS) release — production images use Node 24 LTS");

  const expectedPnpm = root.packageManager.replace(/^pnpm@/, "");
  try {
    const pnpm = execFileSync("pnpm", ["--version"], { encoding: "utf8" }).trim();
    lines.push(`pnpm: ${pnpm} (pinned ${expectedPnpm})`);
    if (pnpm !== expectedPnpm) problems.push(`pnpm ${pnpm} does not match packageManager pnpm@${expectedPnpm}`);
  } catch {
    problems.push("pnpm not found on PATH");
  }

  const dbRequire = createRequire(new URL("../packages/db/package.json", import.meta.url));
  const version = (name: string) => (JSON.parse(readFileSync(dbRequire.resolve(`${name}/package.json`), "utf8")) as { version: string }).version;
  try {
    const cli = version("prisma");
    const client = version("@prisma/client");
    lines.push(`prisma: cli ${cli}, client ${client}`);
    if (cli !== client) problems.push(`Prisma CLI ${cli} and client ${client} differ`);
  } catch (err) {
    problems.push(`Cannot resolve Prisma packages: ${err instanceof Error ? err.message : String(err)}`);
  }
}

checkEnv();
checkToolchain();
for (const line of lines) console.log(`  ${line}`);
if (problems.length) {
  console.error(`\nConfiguration problems:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log("\nConfiguration OK");
