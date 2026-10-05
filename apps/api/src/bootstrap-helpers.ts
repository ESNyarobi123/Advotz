import { AppExceptionFilter } from "@advo/backend";
import { loadServerEnv, type ServerEnv } from "@advo/config";

export { AppExceptionFilter };

/** Validates the environment before anything listens; missing values fail fast with the list. */
export function loadServerEnvSafe(): ServerEnv {
  try {
    return loadServerEnv(process.env);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${message}\nCopy .env.example to .env at the repository root (host development) or set these in Compose.`);
  }
}
