#!/usr/bin/env node
/**
 * Runs a Next.js app on the port the root `.env` asks for.
 *
 * Wired into each Next.js app as:
 *     "dev":   "node ../../scripts/next-run.mjs dev"
 *     "start": "node ../../scripts/next-run.mjs start"
 *
 * The app package.json used to pin `next dev --port 3000` / `--port 3001`, which
 * made `WEB_PORT` / `PORTAL_PORT` dead configuration and broke `pnpm dev` with
 * EADDRINUSE whenever another project on the machine held those ports. The port
 * now comes from `scripts/lib/dev-ports.mjs`, which reads the same root `.env`
 * the API and worker use.
 *
 * Loading `.env` here has a second effect: `NEXT_PUBLIC_API_URL`,
 * `NEXT_PUBLIC_PORTAL_URL` and friends are inlined into the dev bundle from the
 * environment, so web and portal finally agree on the URLs the README documents
 * instead of falling back to hardcoded `localhost:3001` defaults.
 *
 * Docker is unaffected: the runtime images run `.next/standalone`'s `server.js`
 * directly and take `PORT` from the image environment.
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { findListener, probePort, resolveAppPort } from "./lib/dev-ports.mjs";

const MODES = new Set(["dev", "start"]);

const [mode, ...extraArgs] = process.argv.slice(2);
if (!MODES.has(mode)) {
  process.stderr.write(`usage: node scripts/next-run.mjs <${[...MODES].join("|")}> [next args…]\n`);
  process.exit(2);
}

const appDir = process.cwd();

// Pin NODE_ENV before the root `.env` is read. `next dev` must run as
// development and `next start` as production; a NODE_ENV=development line in
// `.env` would otherwise leak into a production server started this way.
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = mode === "dev" ? "development" : "production";
}

let resolved;
try {
  resolved = resolveAppPort(appDir);
} catch (error) {
  process.stderr.write(`[next-run] ${error.message}\n`);
  process.exit(1);
}
if (!resolved) {
  process.stderr.write(`[next-run] ${appDir} is not one of the apps with a configured port (see scripts/lib/dev-ports.mjs).\n`);
  process.exit(1);
}

const nextCli = resolveNextCli(appDir);

// Fail before spawning when the port is taken. Turborepo starts all four apps in
// parallel and `dev` is persistent, so a second `pnpm dev` (or an orphan left by
// a previous one) otherwise produces a raw `EADDRINUSE` stack from deep inside
// Next.js, with no hint that the cause is another copy of this same stack.
if (await probePort(resolved.port)) {
  reportPortInUse(resolved);
  process.exit(1);
}

process.stdout.write(
  `[next-run] ${mode} on port ${resolved.port} (${resolved.variable}` +
    `${resolved.envFile ? ` from ${resolved.envFile}` : ", no root .env found"})\n`,
);

const child = spawn(process.execPath, [nextCli, mode, "--port", String(resolved.port), ...extraArgs], {
  cwd: appDir,
  stdio: "inherit",
  // The environment already contains the root `.env` values loaded above.
  env: process.env,
});

// Next has to hear Ctrl-C and Turborepo's SIGTERM, or a stopped `pnpm dev`
// leaves an orphaned server holding the port — the very failure this fixes.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  process.stderr.write(`[next-run] failed to start Next.js: ${error.message}\n`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

/** Explain a taken port and stop, instead of letting Next throw EADDRINUSE. */
function reportPortInUse({ port, variable, envFile }) {
  const listener = findListener(port);
  const cwd = listener?.cwd ? relative(process.cwd(), listener.cwd) || "." : null;

  const lines = [
    "",
    `✖ Port ${port} is already in use, so this app cannot start.`,
    "",
    `    app        ${readPackageNameLabel()}`,
    `    port       ${port} (${variable}${envFile ? ` in ${relative(process.cwd(), envFile) || envFile}` : ""})`,
    `    listener   ${listener ? `pid ${listener.pid} — ${summariseCommand(listener.command)}` : "could not be identified (lsof unavailable)"}`,
    cwd ? `    listener   cwd ${cwd}` : null,
    "",
    "  Most often this is a previous `pnpm dev` that is still alive — Turborepo",
    "  starts its children in parallel, and they outlive the parent, so stopping",
    "  the terminal is not always enough.",
    "",
    "  Fix it one of two ways:",
    "",
    listener ? `    1. Stop the process holding the port:   kill ${listener.pid}` : "    1. Stop the process holding the port.",
    `    2. Listen somewhere else: set ${variable} in the root .env to a free port`,
    "       and move WEB_PUBLIC_URL / PORTAL_PUBLIC_URL / NEXT_PUBLIC_* and",
    "       CSRF_TRUSTED_ORIGINS with it.",
    "",
  ];

  process.stderr.write(`${lines.filter((line) => line !== null).join("\n")}\n`);
}

function readPackageNameLabel() {
  try {
    const pkg = JSON.parse(readFileSync(join(appDir, "package.json"), "utf8"));
    return pkg.name ?? appDir;
  } catch {
    return appDir;
  }
}

/** Keep the listener's command readable: `node -e '…'` is otherwise one long line. */
function summariseCommand(command, maxLength = 90) {
  if (!command) return "unknown command";
  const flattened = command.replace(/\s+/g, " ").trim();
  return flattened.length <= maxLength ? flattened : `${flattened.slice(0, maxLength - 1)}…`;
}

/** Resolve the Next.js CLI through the app's own node_modules (pnpm layout safe). */
function resolveNextCli(app) {
  const require = createRequire(join(app, "package.json"));
  const manifestPath = require.resolve("next/package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.next;
  if (!bin) throw new Error(`next ${manifest.version} exposes no CLI bin`);
  return join(dirname(manifestPath), bin);
}