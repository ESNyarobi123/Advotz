import type { ZodType } from "zod";
import { badRequest } from "./errors.js";

export type HttpRequest = {
  headers: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string>;
  ip?: string;
  rawBody?: Buffer | string;
  body?: unknown;
};

export type HttpReply = {
  setCookie: (name: string, value: string, options: Record<string, unknown>) => void;
  clearCookie: (name: string, options?: Record<string, unknown>) => void;
  header: (name: string, value: string) => HttpReply;
  status: (code: number) => HttpReply;
  code: (code: number) => HttpReply;
  send: (payload?: unknown) => HttpReply;
};

/** Validates with zod; failures become a 400 VALIDATION_ERROR with field issues. */
export function parse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value ?? {});
  if (!result.success) {
    badRequest("Some fields are invalid", "VALIDATION_ERROR", result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  return result.data;
}

/** Optional enum query filter; unknown values become a 400 instead of reaching the database. */
export function enumQuery<T extends string>(value: string | undefined, allowed: Record<string, T>, name = "state"): T | undefined {
  if (value === undefined || value === "") return undefined;
  const values = Object.values(allowed);
  if (!(values as string[]).includes(value)) {
    badRequest(`Unknown ${name} filter`, "VALIDATION_ERROR", [{ path: name, message: `Expected one of: ${values.join(", ")}` }]);
  }
  return value as T;
}

export function headerString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function clientIp(req: HttpRequest): string {
  return req.ip ?? "unknown";
}
