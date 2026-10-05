import { readFileSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { ControllerError } from "./errors.js";

export type TransportConfig = {
  baseUrl: string;
  caCertPath?: string;
  timeoutMs?: number;
};

export type TransportResponse = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
};

/**
 * Minimal JSON transport for Controller calls. TLS is verified; a private CA may be supplied
 * via OMADA_CA_CERT_PATH. Verification is never disabled globally.
 */
export class ControllerTransport {
  private readonly base: URL;
  private readonly ca?: Buffer;
  private readonly timeoutMs: number;

  constructor(config: TransportConfig) {
    this.base = new URL(config.baseUrl);
    if (this.base.protocol !== "https:" && process.env.NODE_ENV === "production") {
      throw new ControllerError("Controller base URL must use HTTPS in production", "config", false);
    }
    this.ca = config.caCertPath ? readFileSync(config.caCertPath) : undefined;
    this.timeoutMs = config.timeoutMs ?? 10_000;
  }

  async request(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    opts: { body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<TransportResponse> {
    const url = new URL(path.replace(/^\//, ""), this.base.href.endsWith("/") ? this.base.href : `${this.base.href}/`);
    if (url.origin !== this.base.origin) {
      throw new ControllerError("Refusing request outside the configured Controller origin", "config", false);
    }
    const payload = opts.body === undefined ? undefined : Buffer.from(JSON.stringify(opts.body), "utf8");
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(payload ? { "Content-Type": "application/json", "Content-Length": String(payload.length) } : {}),
      ...opts.headers,
    };
    const requester = url.protocol === "https:" ? httpsRequest : httpRequest;

    return new Promise<TransportResponse>((resolve, reject) => {
      let sent = false;
      const req = requester(
        url,
        { method, headers, ca: this.ca, timeout: this.timeoutMs },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            let body: unknown = text;
            try {
              body = text ? JSON.parse(text) : null;
            } catch {
              body = text.slice(0, 500);
            }
            resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
          });
        },
      );
      req.on("timeout", () => {
        req.destroy(new ControllerError(`Controller request timed out after ${this.timeoutMs}ms`, "timeout", sent));
      });
      req.on("error", (err) => {
        if (err instanceof ControllerError) return reject(err);
        reject(new ControllerError(`Controller network error: ${err.message}`, "network", sent));
      });
      if (payload) req.write(payload);
      req.end(() => {
        sent = true;
      });
    });
  }
}

export function extractCookies(setCookie: string | string[] | undefined): string {
  if (!setCookie) return "";
  const list = Array.isArray(setCookie) ? setCookie : [setCookie];
  return list.map((c) => c.split(";")[0]).join("; ");
}
