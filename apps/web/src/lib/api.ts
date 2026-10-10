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
    const issues = rawDetails(err);
    if (issues.length) {
      const lines = issues.map((i) => {
        const label = detailLabel(i);
        return label ? `${label}: ${i.message}` : String(i.message);
      });
      return lines.join("; ");
    }
    return err.message;
  }
  return err instanceof Error ? err.message : "Something went wrong";
}

/** One machine-readable line attached to an API error, ready to render. */
export type ErrorDetail = { label: string; message: string };

/**
 * An API error's `details`, normalised for display.
 *
 * The API attaches details in two shapes, and both reach the same list:
 *
 *   - `{ key, message }` — a plan-policy violation from a
 *     `403 FEATURE_LOCKED_BY_PLAN`, e.g. `branding.colors_edit`;
 *   - `{ path, message }` — a schema issue from any `400 VALIDATION_ERROR`,
 *     where `path` is a field name or an array of path segments.
 *
 * Reading only one of the two leaves the other shape rendering an empty label —
 * and, since React keys come from the label, every row then shares one key. That
 * is a real case, not a hypothetical: a `portalTitle` that is one character too
 * long produces a validation error, and two such errors produce two undefined
 * keys.
 *
 * Identical entries are collapsed: the same problem reported twice is one line to
 * the person reading it.
 */
export function errorDetails(err: unknown): ErrorDetail[] {
  if (!(err instanceof ApiError)) return [];
  const seen = new Set<string>();
  const out: ErrorDetail[] = [];
  for (const item of rawDetails(err)) {
    // A detail with no message tells the reader nothing, and the error's own
    // message is already shown above the list.
    if (typeof item.message !== "string" || !item.message.trim()) continue;
    const message = item.message.trim();
    const label = detailLabel(item);
    const dedupe = `${label}\u0000${message}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({ label, message });
  }
  return out;
}

/** The `details` array, whichever of the two envelopes it arrived in. */
function rawDetails(err: ApiError): Array<Record<string, unknown>> {
  const d = err.details as Array<Record<string, unknown>> | { issues?: Array<Record<string, unknown>> } | undefined;
  const list = Array.isArray(d) ? d : Array.isArray(d?.issues) ? d.issues : [];
  return list.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
}

/** The violation key or the schema path of one detail, as a single string. */
function detailLabel(item: Record<string, unknown>): string {
  for (const value of [item.key, item.path]) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const joined = value.filter((part): part is string | number => typeof part === "string" || typeof part === "number").join(".");
      if (joined) return joined;
    }
  }
  return "";
}

/** Random, client-generated idempotency key so a double-click or retry cannot duplicate money movement. */
export function newIdempotencyKey(prefix: string): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "") : `${Date.now()}${Math.random()}`;
  return `${prefix}-${rand}`.slice(0, 64);
}
