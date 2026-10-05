#!/usr/bin/env node
/**
 * Preflight guard for `next build`.
 *
 * Why this exists
 * ---------------
 * `next dev` and `next build` both write to the same `<app>/.next` directory.
 * If a production build runs while the dev server is still serving, the build
 * overwrites/wipes the dev server's on-disk chunks. The dev server keeps the
 * old manifest in memory, so the browser starts requesting chunks that no
 * longer exist and dies with:
 *
 *     Runtime ChunkLoadError
 *     Loading chunk app/(dashboard)/reseller/layout failed.
 *     (error: http://localhost:3000/_next/static/chunks/app/(dashboard)/reseller/layout.js)
 *
 * The damage is on disk, so restarting the dev server is not enough — `.next`
 * has to be deleted before the dev server is trustworthy again.
 *
 * This guard refuses to start the build in that situation, and explains the
 * fix instead of silently corrupting the dev server.
 *
 * Wired into each Next.js app as:
 *     "build": "node ../../scripts/guard-next-build.mjs && next build"
 *
 * Behaviour
 * ---------
 *   - Port free                      -> build proceeds (silent, the normal path).
 *   - Port held by a Next server     -> build aborts with remediation steps.
 *   - Port held by something else    -> build proceeds with a note.
 *   - Guard cannot decide            -> build proceeds (never block by accident).
 *   - ALLOW_BUILD_WITH_DEV=1         -> bypass the check.
 *
 * Docker images and CI are unaffected: nothing listens on the app port during
 * those builds, and the guard exits before it needs `lsof`.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { get } from "node:http";
import { connect } from "node:net";
import { join, relative, resolve } from "node:path";

const BYPASS = process.env.ALLOW_BUILD_WITH_DEV === "1";
const appDir = resolve(process.cwd());
const repoRoot = resolve(appDir, "..", "..");

const pkg = readPackageJson();
const appName = pkg?.name ?? "app";
const appLabel = relative(repoRoot, appDir) || appDir;

function readPackageJson() {
  try {
    return JSON.parse(readFileSync(join(appDir, "package.json"), "utf8"));
  } catch {
    return null;
  }
}

/**
 * Resolve the port this app's dev server listens on.
 *
 * Precedence:
 *   1. GUARD_DEV_PORT — explicit override for tests and unusual setups.
 *   2. `--port` in this app's `dev` script — the repository's source of truth.
 *   3. PORT           — only when the dev script does not pin a port.
 *
 * The dev script deliberately outranks PORT: a stray PORT exported by an
 * unrelated process in the shell must not send the guard after the wrong
 * service.
 */
function readDevPort() {
  const explicit = process.env.GUARD_DEV_PORT;
  if (explicit && /^\d+$/.test(explicit)) return Number(explicit);

  const fromScript = String(pkg?.scripts?.dev ?? "").match(/--port[\s=]+(\d+)/);
  if (fromScript) return Number(fromScript[1]);

  const fromEnv = process.env.PORT;
  if (fromEnv && /^\d+$/.test(fromEnv)) return Number(fromEnv);

  return null;
}

function probePort(port, timeoutMs = 700) {
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
function findListener(port) {
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

/** Fallback identification for environments without `lsof`. */
function probeHttp(port, timeoutMs = 1500) {
  return new Promise((settle) => {
    const request = get({ host: "127.0.0.1", port, path: "/", timeout: timeoutMs }, (response) => {
      settle({ poweredBy: String(response.headers["x-powered-by"] ?? "") });
      response.resume();
    });
    request.once("timeout", () => {
      request.destroy();
      settle(null);
    });
    request.once("error", () => settle(null));
  });
}

function abort(port, listener) {
  const listenerCwd = listener?.cwd ? relative(repoRoot, listener.cwd) || "." : null;
  const who = listener?.command ?? "a Next.js server";
  const pid = listener?.pid ?? "unknown";

  const lines = [
    "",
    `✖ Refusing to run \`next build\` for ${appName}.`,
    "",
    "  A Next.js server is already serving this app's dev port and the same .next",
    "  directory:",
    "",
    `    dev port   ${port}`,
    `    listener   pid ${pid} — ${who}`,
    listenerCwd ? `    listener   cwd ${listenerCwd}` : null,
    `    dist dir   ${relative(repoRoot, join(appDir, ".next"))}`,
    "",
    "  `next dev` and `next build` write to the same .next directory. A production",
    "  build wipes the dev server's chunks while it is still serving them, so the",
    "  browser starts failing with:",
    "",
    "      ChunkLoadError: Loading chunk app/<route>/layout failed.",
    "",
    "  Pick one:",
    "",
    "    1. Stop the dev server, then build (recommended):",
    "         pnpm dev      # Ctrl-C in the terminal running it",
    "         pnpm build",
    "",
    "    2. Build in a separate checkout or container — Docker and CI are unaffected.",
    "",
    "  To override, only if the port belongs to something else entirely:",
    "",
    `         ALLOW_BUILD_WITH_DEV=1 pnpm --filter ${appName} build`,
    "",
  ];

  process.stderr.write(`${lines.filter((line) => line !== null).join("\n")}\n`);
}

async function main() {
  const port = readDevPort();
  if (!port) return; // No dev port to reason about — never block.

  if (!(await probePort(port))) return; // Nothing listening — the normal path.

  if (BYPASS) {
    process.stdout.write(
      `[guard-next-build] Port ${port} is in use, continuing because ALLOW_BUILD_WITH_DEV=1.\n`,
    );
    return;
  }

  const listener = findListener(port);
  const commandSaysNext = listener?.command ? /next/i.test(listener.command) : null;

  // Only fall back to an HTTP probe when `lsof` could not tell us anything.
  let httpSaysNext = null;
  if (commandSaysNext === null) {
    const probe = await probeHttp(port);
    httpSaysNext = /next\.js/i.test(probe?.poweredBy ?? "");
  }

  const isNextServer = commandSaysNext ?? httpSaysNext ?? false;
  if (!isNextServer) {
    process.stdout.write(
      `[guard-next-build] Port ${port} is busy with a non-Next process; continuing.\n`,
    );
    return;
  }

  abort(port, listener);
  process.exitCode = 1;
}

main().catch((error) => {
  // The guard must never be the reason a build fails unexpectedly.
  process.stdout.write(`[guard-next-build] Skipped (${error?.message ?? error}).\n`);
});
