import { ApiError, createApiClient } from "@advo/api-client";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const api = createApiClient({ baseUrl: API_URL });

export { ApiError };

/** Kept for existing auth pages. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return api.request<T>(path, init);
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    type Issue = { path?: string | Array<string | number>; message: string };
    const d = err.details as Issue[] | { issues?: Issue[] } | undefined;
    const issues = (Array.isArray(d) ? d : d?.issues)?.map((i) => ({ ...i, path: Array.isArray(i.path) ? i.path.join(".") : i.path }));
    if (issues?.length) return issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join("; ");
    return err.message;
  }
  return err instanceof Error ? err.message : "Something went wrong";
}

/** Random, client-generated idempotency key so a double-click or retry cannot duplicate money movement. */
export function newIdempotencyKey(prefix: string): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "") : `${Date.now()}${Math.random()}`;
  return `${prefix}-${rand}`.slice(0, 64);
}
