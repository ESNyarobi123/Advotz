import type { MeResponse, SessionUser } from "@advo/contracts";

export type ApiClientOptions = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  /** Send the session cookie (dashboards). Guest portal calls do not need it. */
  withCredentials?: boolean;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Typed frontend client maintained against @advo/contracts. Money arrives as decimal strings. */
export function createApiClient(options: ApiClientOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function raw(path: string, init?: RequestInit): Promise<Response> {
    const hasBody = init?.body !== undefined;
    const res = await fetchImpl(`${options.baseUrl}/api/v1${path}`, {
      ...init,
      credentials: options.withCredentials === false ? "omit" : "include",
      headers: {
        accept: "application/json",
        ...(hasBody ? { "content-type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string; code?: string; details?: unknown };
      throw new ApiError(res.status, body.code ?? `HTTP_${res.status}`, body.message ?? `Request failed (${res.status})`, body.details);
    }
    return res;
  }

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await raw(path, init);
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  const send = <T>(method: string) => (path: string, body?: unknown) =>
    request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

  return {
    raw,
    request,
    get: <T>(path: string) => request<T>(path),
    post: <T = unknown>(path: string, body?: unknown) => send<T>("POST")(path, body ?? {}),
    put: <T = unknown>(path: string, body?: unknown) => send<T>("PUT")(path, body ?? {}),
    patch: <T = unknown>(path: string, body?: unknown) => send<T>("PATCH")(path, body ?? {}),
    del: <T = unknown>(path: string) => request<T>(path, { method: "DELETE" }),
    me: () => request<MeResponse>("/auth/me"),
    login: (email: string, password: string, mfaCode?: string) =>
      request<{ user: SessionUser }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, ...(mfaCode ? { mfaCode } : {}) }),
      }),
    logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST", body: "{}" }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** Integer TZS from a decimal string/number, formatted for display without floating-point maths. */
export function formatTzs(value: string | number | bigint | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const s = typeof value === "string" ? value : value.toString();
  const negative = s.startsWith("-");
  const digits = negative ? s.slice(1) : s;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "−" : ""}TZS ${grouped}`;
}

export const BUSINESS_TIMEZONE = "Africa/Dar_es_Salaam";

export function formatDateTime(value: string | Date | null | undefined, locale = "en-GB"): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: BUSINESS_TIMEZONE }).format(d);
}

/**
 * Milliseconds the given zone is ahead of UTC at `date` (positive east of it).
 *
 * `Intl` can format a wall clock in any zone but cannot hand back its offset, so
 * the offset is recovered by formatting the instant in the zone, reading that wall
 * clock back as if it were UTC, and subtracting. That is exact to the second and
 * survives a DST zone too, which Tanzania is not.
 */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  // `hour` formats midnight as 24 in some locales; normalise it back to 0.
  const hour = get("hour") % 24;
  const wallAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return wallAsUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * An instant as the value a `<input type="datetime-local">` expects, in the
 * business zone (not the browser's), so an Admin abroad still edits Dar time.
 */
export function zonedInputValue(
  value: string | Date | null | undefined,
  timeZone = BUSINESS_TIMEZONE,
): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const offset = zoneOffsetMs(date, timeZone);
  const wall = new Date(date.getTime() + offset);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}T${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`;
}

/**
 * The inverse: a `datetime-local` wall clock read as business-zone time and
 * returned as a UTC ISO string.
 *
 * This is the value that must go over the wire. Sending the raw
 * `"2026-11-15T19:45"` lets the *server* decide what it means, and a server
 * running UTC reads it as 19:45Z — three hours after the Admin meant, so a
 * published campaign looks like it is scheduled for later and never appears.
 */
export function zonedInputToIso(
  value: string | null | undefined,
  timeZone = BUSINESS_TIMEZONE,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  // A value that already names an instant (…Z or …+03:00) is unambiguous and must
  // not be read as a wall clock, or every edit would shift it again.
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) {
    const explicit = new Date(trimmed);
    return Number.isNaN(explicit.getTime()) ? null : explicit.toISOString();
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(trimmed);
  if (!match) {
    const fallback = new Date(trimmed);
    return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString();
  }
  const [, y, mo, d, h, mi] = match.map(Number) as unknown as number[];
  const guess = Date.UTC(y!, mo! - 1, d!, h!, mi!);
  // Two passes: the first offset is computed from the wrong instant by exactly
  // that offset, the second one lands on the right side of a DST boundary.
  const first = zoneOffsetMs(new Date(guess), timeZone);
  const instant = guess - first;
  const second = zoneOffsetMs(new Date(instant), timeZone);
  return new Date(guess - second).toISOString();
}

export function formatDuration(seconds: number, locale: "en" | "sw" = "en"): string {
  const units: Array<[number, string, string]> =
    locale === "sw"
      ? [[86400, "siku", "siku"], [3600, "saa", "saa"], [60, "dakika", "dakika"]]
      : [[86400, "day", "days"], [3600, "hour", "hours"], [60, "minute", "minutes"]];
  for (const [size, one, many] of units) {
    if (seconds >= size && seconds % size === 0) {
      const n = seconds / size;
      return locale === "sw" ? `${one} ${n}` : `${n} ${n === 1 ? one : many}`;
    }
  }
  return `${Math.round(seconds / 60)} ${locale === "sw" ? "dakika" : "minutes"}`;
}

export function formatBytes(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${n} B`;
}

export function formatSpeed(kbps: number | null | undefined): string {
  if (!kbps) return "—";
  return kbps >= 1024 ? `${(kbps / 1024).toFixed(kbps % 1024 === 0 ? 0 : 1)} Mbps` : `${kbps} kbps`;
}
