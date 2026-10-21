/**
 * Dev ports for the Next.js apps, resolved from the workspace-root `.env`.
 *
 * Why this exists
 * ---------------
 * `WEB_PORT` and `PORTAL_PORT` have always been part of the server env schema
 * (`packages/config`) and are documented in `.env.example` under "Origins". The
 * two Next.js apps were the only consumers that ignored them: their package.json
 * pinned `next dev --port 3000` / `--port 3001`, so editing `.env` changed
 * nothing and `pnpm dev` died with
 *
 *     Error: listen EADDRINUSE: address already in use :::3000
 *
 * whenever another checkout on the machine held those ports.
 *
 * Both `scripts/next-run.mjs` (which starts the server) and
 * `scripts/guard-next-build.mjs` (which refuses to build over a running dev
 * server) resolve the port through this module, so the two can never disagree
 * about where an app is listening.
 *
 * Precedence, highest first:
 *   1. A variable exported in the shell (dotenv never overwrites it).
 *   2. The same variable in the root `.env` (or `ADVO_ENV_FILE_PATH`).
 *   3. The app's fallback below, matching the schema defaults in `packages/config`.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { connect } from "node:net";
import { config } from "dotenv";

/** Apps whose port is named in `.env`, keyed by workspace package name. */
const APP_PORTS = new Map([
  ["@advo/web", { variable: "WEB_PORT", fallback: 3000 }],
  ["@advo/portal", { variable: "PORTAL_PORT", fallback: 3001 }],
]);

/** Walk up from `start` until the workspace root (the directory holding pnpm-workspace.yaml). */
export function findRepoRoot(start) {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Load the root `.env` into `process.env` without overriding anything already
 * set — the same contract `@advo/config/load-env` gives the API and worker.
 * Returns the file that was used, or null when there is none.
 */
export function loadRootEnv(start) {
  const root = findRepoRoot(start);
  const file = process.env.ADVO_ENV_FILE_PATH || (root ? join(root, ".env") : "");
  if (!file || !existsSync(file)) return null;
  config({ path: file, quiet: true });
  return file;
}

function readPackageName(appDir) {
  try {
    return JSON.parse(readFileSync(join(appDir, "package.json"), "utf8")).name ?? null;
  } catch {
    return null;
  }
}

function parsePort(raw, variable) {
  const value = raw.trim();
  if (!/^\d+$/.test(value)) {
    throw new Error(`${variable} must be a TCP port number, got "${raw}"`);
  }
  const port = Number(value);
  if (port < 1 || port > 65535) {
    throw new Error(`${variable} must be between 1 and 65535, got ${port}`);
  }
  return port;
}

/**
 * Resolve where `appDir` should listen.
 *
 * Returns null when the app is not one of the two port-bearing Next.js apps, so
 * callers can fall back to their own rules instead of guessing.
 *
 * @returns {{ port: number, variable: string, envFile: string | null } | null}
 */
export function resolveAppPort(appDir) {
  const name = readPackageName(appDir);
  const spec = name ? APP_PORTS.get(name) : undefined;
  if (!spec) return null;

  const envFile = loadRootEnv(appDir);
  const raw = process.env[spec.variable];
  const port = raw && raw.trim() ? parsePort(raw, spec.variable) : spec.fallback;

  return { port, variable: spec.variable, envFile };
}

/**
 * True when something is accepting connections on `port`.
 *
 * Used instead of a bind test because the candidates may listen on IPv6 only
 * (`::`), which a 0.0.0.0 bind attempt would miss.
 */
export function probePort(port, timeoutMs = 700) {
  return new Promise((settle) => {
    const socket = connect({ host: "127.0.0.1", port });
    const done = (isOpen) => {
      socket.destroy();
      settle(isOpen);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

/** Best-effort listener lookup. Returns null when `lsof` is unavailable. */
export function findListener(port) {
  let pid;
  try {
    const out = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpc"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 4000,
    });
    for (const line of out.split("\n")) {
      if (line.startsWith("p")) pid = line.slice(1).trim();
    }
  } catch {
    return null;
  }
  if (!pid) return null;

  return { pid, command: processCommand(pid), cwd: processCwd(pid) };
}

function processCommand(pid) {
  try {
    const out = execFileSync("ps", ["-o", "command=", "-p", pid], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 4000,
    });
    return out.trim() || null;
  } catch {
    return null;
  }
}

function processCwd(pid) {
  try {
    const out = execFileSync("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 4000,
    });
    for (const line of out.split("\n")) {
      if (line.startsWith("n")) return line.slice(1).trim();
    }
  } catch {
    /* ignore */
  }
  return null;
}
