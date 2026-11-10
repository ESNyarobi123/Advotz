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
 *
 * A port held by an orphaned copy of the same app is reclaimed automatically:
 * the listener's cwd and its `next-run → next dev → next-server` ancestors have
 * to match this app, so another checkout or project is still reported, never
 * killed. Set `ADVO_NO_PORT_RECLAIM=1` to always stop and report instead.
 */

import { spawn, execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { findListener, probePort, resolveAppPort } from "./lib/dev-ports.mjs";

const MODES = new Set(["dev", "start"]);

/** How long a reclaimed dev server may take to release its port. */
const RECLAIM_TIMEOUT_MS = 6_000;

/** Processes this launcher spawns for one app (and nothing else). */
const NEXT_PROCESS =
  /next-server|next-run\.mjs|[\\/]next[\\/]dist[\\/]bin[\\/]next\b/;

const [mode, ...extraArgs] = process.argv.slice(2);
if (!MODES.has(mode)) {
  process.stderr.write(
    `usage: node scripts/next-run.mjs <${[...MODES].join("|")}> [next args…]\n`,
  );
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
  process.stderr.write(
    `[next-run] ${appDir} is not one of the apps with a configured port (see scripts/lib/dev-ports.mjs).\n`,
  );
  process.exit(1);
}

const nextCli = resolveNextCli(appDir);

// Fail before spawning when the port is taken. Turborepo starts all four apps in
// parallel and `dev` is persistent, so a second `pnpm dev` (or an orphan left by
// a previous one) otherwise produces a raw `EADDRINUSE` stack from deep inside
// Next.js, with no hint that the cause is another copy of this same stack.
if (await probePort(resolved.port)) {
  // One case is safe to resolve automatically: the listener is an orphaned copy
  // of *this* app (same directory, Next process). Turborepo children outlive
  // their parent, so quitting the terminal — or the IDE closing the shell that
  // started `pnpm dev` — strands a server that no signal reaches. Anything else
  // (a different checkout, another project) is left alone and reported.
  const stale = findStaleCopy(resolved.port, appDir);
  if (stale.length > 0 && (await reclaimPort(resolved.port, stale))) {
    process.stdout.write(
      `[next-run] reclaimed port ${resolved.port} from a previous dev server (pid ${stale.join(", ")})\n`,
    );
  } else {
    reportPortInUse(resolved);
    process.exit(1);
  }
}

process.stdout.write(
  `[next-run] ${mode} on port ${resolved.port} (${resolved.variable}` +
    `${resolved.envFile ? ` from ${resolved.envFile}` : ", no root .env found"})\n`,
);

const child = spawn(
  process.execPath,
  [nextCli, mode, "--port", String(resolved.port), ...extraArgs],
  {
    cwd: appDir,
    stdio: "inherit",
    // The environment already contains the root `.env` values loaded above.
    env: process.env,
  },
);

// Next has to hear Ctrl-C and Turborepo's SIGTERM, or a stopped `pnpm dev`
// leaves an orphaned server holding the port — the very failure this fixes.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  process.stderr.write(
    `[next-run] failed to start Next.js: ${error.message}\n`,
  );
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

/**
 * PIDs of an orphaned copy of *this* app holding `port`, deepest first.
 *
 * A listener counts as ours only when its working directory is this app and it
 * sits in this app's own `next-run → next dev → next-server` chain. Turborepo
 * and the calling shell are shared by the other three apps, so the walk up the
 * parents stops at the first process that is not ours.
 */
function findStaleCopy(port, appDir) {
  if (process.env.ADVO_NO_PORT_RECLAIM === "1") return [];

  const listener = findListener(port);
  const target = realPath(appDir);
  if (!listener || !target || realPath(listener.cwd) !== target) return [];

  const pids = [];
  let pid = listener.pid;
  for (let depth = 0; pid && pid !== "1" && depth < 6; depth += 1) {
    const command = readCommand(pid);
    if (
      !command ||
      realPath(readCwd(pid)) !== target ||
      !NEXT_PROCESS.test(command)
    )
      break;
    pids.push(pid);
    pid = readParent(pid);
  }
  return pids;
}

/** SIGTERM the stale chain, escalate to SIGKILL if the port stays held. */
async function reclaimPort(port, pids) {
  signalAll(pids, "SIGTERM");
  if (await waitForFreePort(port, RECLAIM_TIMEOUT_MS)) return true;

  signalAll(pids, "SIGKILL");
  return waitForFreePort(port, 2_000);
}

function signalAll(pids, signal) {
  for (const pid of pids) {
    try {
      process.kill(Number(pid), signal);
    } catch {
      /* already exited */
    }
  }
}

async function waitForFreePort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (!(await probePort(port))) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((settle) => setTimeout(settle, 200));
  }
}

/** Absolute, symlink-free path, or null when the path is unknown. */
function realPath(path) {
  if (!path) return null;
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

function readCommand(pid) {
  try {
    return (
      execFileSync("ps", ["-o", "command=", "-p", pid], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 4000,
      }).trim() || null
    );
  } catch {
    return null;
  }
}

function readCwd(pid) {
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

function readParent(pid) {
  try {
    const out = execFileSync("ps", ["-o", "ppid=", "-p", pid], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 4000,
    }).trim();
    return /^\d+$/.test(out) ? out : null;
  } catch {
    return null;
  }
}

/** Explain a taken port and stop, instead of letting Next throw EADDRINUSE. */
function reportPortInUse({ port, variable, envFile }) {
  const listener = findListener(port);
  const cwd = listener?.cwd
    ? relative(process.cwd(), listener.cwd) || "."
    : null;

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
    listener
      ? `    1. Stop the process holding the port:   kill ${listener.pid}`
      : "    1. Stop the process holding the port.",
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
  return flattened.length <= maxLength
    ? flattened
    : `${flattened.slice(0, maxLength - 1)}…`;
}

/** Resolve the Next.js CLI through the app's own node_modules (pnpm layout safe). */
function resolveNextCli(app) {
  const require = createRequire(join(app, "package.json"));
  const manifestPath = require.resolve("next/package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const bin =
    typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.next;
  if (!bin) throw new Error(`next ${manifest.version} exposes no CLI bin`);
  return join(dirname(manifestPath), bin);
}
