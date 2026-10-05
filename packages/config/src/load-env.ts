import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "dotenv";

/**
 * Side-effect import for every Node entry point (API, worker, CLI scripts):
 *   import "@advo/config/load-env";
 * Loads the workspace-root `.env` regardless of which package directory the process starts in.
 * Variables already present in the environment (Compose, CI, the shell) always win, and a
 * missing file is a no-op — containers get their configuration from Compose, not from a file.
 * ADVO_ENV_FILE_PATH points at a different file (e.g. a staging env on a jump host).
 */
function findWorkspaceRoot(start: string): string | null {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const root = findWorkspaceRoot(process.cwd());
const file = process.env.ADVO_ENV_FILE_PATH || (root ? join(root, ".env") : "");
if (file && existsSync(file)) {
  config({ path: file, quiet: true });
}
