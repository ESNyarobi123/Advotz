import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { API_URL, PORTAL_URL, STATE_FILE, WEB_URL } from "./env.js";

async function reachable(url: string) {
  try {
    const res = await fetch(url, { redirect: "manual" });
    return res.status < 500;
  } catch {
    return false;
  }
}

export default async function globalSetup() {
  if (process.env.E2E_SKIP_SETUP === "1" && existsSync(STATE_FILE)) return;
  const databaseUrl = process.env.E2E_DATABASE_URL;
  if (!databaseUrl || !/\/[^/?]+_smoke(\?|$)/.test(databaseUrl)) {
    throw new Error("Set E2E_DATABASE_URL to a disposable *_smoke database (it is truncated and reseeded).");
  }
  for (const url of [`${API_URL}/api/v1/health/live`, `${WEB_URL}/login`, PORTAL_URL]) {
    if (!(await reachable(url))) throw new Error(`Stack not reachable at ${url}; start api/web/portal first (see docs/runbooks.md#local-e2e).`);
  }
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  execFileSync("pnpm", ["--filter", "@advo/api", "smoke"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl, SMOKE_API_URL: API_URL, SMOKE_STATE_FILE: STATE_FILE },
  });
}
