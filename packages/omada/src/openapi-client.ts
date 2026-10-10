import { readFileSync } from "node:fs";
import { z } from "zod";
import { ControllerError, UnsupportedCapabilityError } from "./errors.js";
import type { ControllerTransport } from "./transport.js";

/**
 * Management Open API operations are NOT hard-coded: exact paths live only in each
 * Controller's "Online API Document". An operator transcribes the verified routes into a
 * contract file (see docs/integrations/omada-contracts.md). Operations missing from the
 * contract are unsupported.
 */
const operationSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  /** Placeholders: {omadacId} {siteId} {clientMac} {deviceMac} */
  path: z.string().startsWith("/"),
  /** JSON body with "{{field}}" placeholders substituted from the call input. */
  bodyTemplate: z.unknown().optional(),
  /** Dot path to the value to return, e.g. "result.siteId". */
  resultPath: z.string().optional(),
  verified: z.boolean(),
  evidence: z.string().optional(),
});

export const openApiContractSchema = z.object({
  controllerVersion: z.string(),
  documentSource: z.string(),
  token: z.object({
    method: z.literal("POST"),
    path: z.string().startsWith("/"),
    /** Where client credentials go. {{clientId}} {{clientSecret}} {{omadacId}} are substituted. */
    query: z.record(z.string(), z.string()).optional(),
    bodyTemplate: z.unknown().optional(),
    accessTokenPath: z.string(),
    expiresInPath: z.string().optional(),
  }),
  operations: z.record(z.string(), operationSchema),
});

export type OpenApiContract = z.infer<typeof openApiContractSchema>;

export function loadOpenApiContract(path: string): OpenApiContract {
  return openApiContractSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

function substitute(value: unknown, vars: Record<string, unknown>): unknown {
  if (typeof value === "string") {
    const whole = value.match(/^\{\{(\w+)\}\}$/);
    if (whole) {
      const found = vars[whole[1]!];
      // A placeholder that is the entire value may be an object (a request body).
      return found === undefined ? value : found;
    }
    return value.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
      const found = vars[k];
      return found === undefined || typeof found === "object" ? "" : String(found);
    });
  }
  if (Array.isArray(value)) return value.map((v) => substitute(v, vars));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v, vars)]));
  }
  return value;
}

function pick(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), obj);
}

export class OmadaOpenApiClient {
  private token: { value: string; expiresAt: number } | null = null;
  private refreshing: Promise<string> | null = null;

  constructor(
    private readonly transport: ControllerTransport,
    private readonly contract: OpenApiContract | null,
    private readonly creds: { omadacId: string; clientId: string; clientSecret: string },
  ) {}

  has(operation: string): boolean {
    return Boolean(this.contract?.operations[operation]);
  }

  isVerified(operation: string): boolean {
    return Boolean(this.contract?.operations[operation]?.verified);
  }

  private async fetchToken(): Promise<string> {
    if (!this.contract) throw new UnsupportedCapabilityError("openapi", "No Open API contract configured");
    const t = this.contract.token;
    const vars = { ...this.creds };
    const query = t.query
      ? "?" + new URLSearchParams(Object.fromEntries(Object.entries(t.query).map(([k, v]) => [k, String(substitute(v, vars))]))).toString()
      : "";
    const res = await this.transport.request("POST", `${String(substitute(t.path, vars))}${query}`, {
      body: t.bodyTemplate === undefined ? undefined : substitute(t.bodyTemplate, vars),
    });
    const token = pick(res.body, t.accessTokenPath);
    if (res.status !== 200 || typeof token !== "string") {
      const errorCode = pick(res.body, "errorCode");
      throw new ControllerError(`Open API token request failed (HTTP ${res.status})`, "auth", false, typeof errorCode === "number" ? errorCode : undefined);
    }
    const expiresIn = t.expiresInPath ? Number(pick(res.body, t.expiresInPath)) : 3600;
    this.token = { value: token, expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000 };
    return token;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    if (!this.refreshing) {
      this.refreshing = this.fetchToken().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  async call(operation: string, vars: Record<string, unknown>): Promise<unknown> {
    const op = this.contract?.operations[operation];
    if (!op) throw new UnsupportedCapabilityError(operation, `Operation ${operation} is not in the verified Open API contract`);
    const allVars = { omadacId: this.creds.omadacId, ...vars };
    const path = op.path.replace(/\{(\w+)\}/g, (_, k: string) => encodeURIComponent(String(allVars[k as keyof typeof allVars] ?? "")));
    const token = await this.accessToken();
    const res = await this.transport.request(op.method, path, {
      body: op.bodyTemplate === undefined ? undefined : substitute(op.bodyTemplate, allVars),
      // The Omada guide requires the "AccessToken=" prefix (not Bearer).
      headers: { Authorization: `AccessToken=${token}` },
    });
    const errorCode = pick(res.body, "errorCode");
    if (res.status !== 200 || errorCode !== 0) {
      throw new ControllerError(
        `Open API ${operation} failed (HTTP ${res.status}, errorCode ${String(errorCode)})`,
        res.status >= 500 ? "network" : "rejected",
        res.status >= 500,
        typeof errorCode === "number" ? errorCode : undefined,
        String(pick(res.body, "msg") ?? "").slice(0, 200),
      );
    }
    return op.resultPath ? pick(res.body, op.resultPath) : res.body;
  }
}
