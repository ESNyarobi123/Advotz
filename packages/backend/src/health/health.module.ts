import { Controller, Get, Header, Headers, Module, Res } from "@nestjs/common";
import { prisma } from "@advo/db";
import { constantTimeEqualHex, hashToken } from "../common/crypto.js";
import { notFound, unauthorized } from "../common/errors.js";
import { rateLimitBackendHealth } from "../common/rate-limit.js";
import { collectMetrics, renderPrometheus } from "./metrics.js";

type Credential = "configured" | "missing" | "not_required";

function snippeCredential(): Credential {
  if (process.env.PAYMENT_PROVIDER !== "snippe") return "not_required";
  return process.env.SNIPPE_API_KEY && process.env.SNIPPE_WEBHOOK_SECRET ? "configured" : "missing";
}

@Controller("health")
export class HealthController {
  @Get("live")
  live() {
    return { status: "ok" };
  }

  /**
   * 503 only when this process cannot serve requests (database unreachable or required
   * credentials missing). A Redis outage is reported as degraded: rate limits fall back to
   * per-process counters. Omada/Snippe reachability is not probed here — a transient vendor
   * outage must not pull every API replica out of the load balancer.
   */
  @Get("ready")
  async ready(@Res({ passthrough: true }) reply: { status(code: number): unknown }) {
    const database = await prisma.$queryRaw<{ applied: bigint }[]>`
      SELECT count(*) AS applied FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`.then(
      (rows) => (Number(rows[0]?.applied ?? 0) > 0 ? ("up" as const) : ("unmigrated" as const)),
      (err: unknown) => (/_prisma_migrations/.test(String(err)) ? ("unmigrated" as const) : ("down" as const)),
    );
    const redis = await rateLimitBackendHealth();
    const snippe = snippeCredential();
    const ready = database === "up" && snippe !== "missing";
    reply.status(ready ? 200 : 503);
    return {
      status: ready ? (redis === "down" ? "degraded" : "ready") : "not_ready",
      database,
      redis,
      paymentProvider: process.env.PAYMENT_PROVIDER ?? "unset",
      snippeCredentials: snippe,
      omadaMode: process.env.OMADA_MODE ?? "unset",
    };
  }
}

/** Disabled (404) unless METRICS_TOKEN is set; the public proxy must not route /api/v1/internal. */
@Controller("internal")
export class MetricsController {
  @Get("metrics")
  @Header("Cache-Control", "no-store")
  async metrics(
    @Headers("authorization") authorization: string | undefined,
    @Res({ passthrough: true }) reply: { header(name: string, value: string): unknown },
  ) {
    const token = process.env.METRICS_TOKEN;
    if (!token) notFound("Not found");
    const presented = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!constantTimeEqualHex(hashToken(presented), hashToken(token))) unauthorized("Invalid metrics token");
    const body = renderPrometheus(await collectMetrics());
    reply.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    return body;
  }
}

@Module({
  controllers: [HealthController, MetricsController],
})
export class HealthModule {}
