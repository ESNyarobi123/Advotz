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
