import "reflect-metadata";
import "@advo/config/load-env";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { loadServerEnv } from "@advo/config";
import { prisma } from "@advo/db";
import { closeRateLimiter, drainOutbox, isProduction, leaseOutboxEvents, runListingAiTick, runOutboxEvent, runSweepers } from "@advo/backend";
import { WorkerAppModule } from "./worker-app.module.js";

const EVENTS_QUEUE = "advo-events";
const MAINTENANCE_QUEUE = "advo-maintenance";

function redisConnection(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
    tls: u.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

async function bootstrap() {
  loadServerEnv(process.env);
  if (isProduction() && process.env.PAYMENT_PROVIDER !== "snippe") {
    throw new Error("Production worker requires PAYMENT_PROVIDER=snippe");
  }
  const app = await NestFactory.createApplicationContext(WorkerAppModule, { logger: ["error", "warn", "log"] });
  const logger = new Logger("Worker");
  const redisUrl = process.env.REDIS_URL;
  const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 8);
  const timers: NodeJS.Timeout[] = [];
  const closers: Array<() => Promise<unknown>> = [];

  if (!redisUrl) {
    if (isProduction()) throw new Error("REDIS_URL is required in production");
    logger.warn("REDIS_URL not set — running inline outbox drain (development only)");
    timers.push(setInterval(() => void drainOutbox().catch((e) => logger.error(e)), 2_000));
    timers.push(setInterval(() => void runSweepers().catch((e) => logger.error(e)), 60_000));
  } else {
    const connection = redisConnection(redisUrl);
    const events = new Queue(EVENTS_QUEUE, { connection });
    const maintenance = new Queue(MAINTENANCE_QUEUE, { connection });
    closers.push(() => events.close(), () => maintenance.close());

    // Relay: DB outbox (source of truth) → BullMQ. Lost jobs reappear after the lease expires.
    let relaying = false;
    timers.push(
      setInterval(async () => {
        if (relaying) return;
        relaying = true;
        try {
          const leased = await leaseOutboxEvents(200);
          for (const ev of leased) {
            await events.add(ev.eventType, { outboxId: ev.id }, {
              jobId: `${ev.id}-${ev.attempts}`,
              removeOnComplete: 1000,
              removeOnFail: 5000,
            });
          }
        } catch (err) {
          logger.warn(`Outbox relay failed: ${err instanceof Error ? err.message : err}`);
        } finally {
          relaying = false;
        }
      }, 1_000),
    );

    const eventsWorker = new Worker(
      EVENTS_QUEUE,
      async (job) => {
        const ev = await prisma.outboxEvent.findUnique({ where: { id: String(job.data.outboxId) } });
        if (!ev || ev.dispatchedAt) return "already_dispatched";
        const result = await runOutboxEvent(ev);
        if (!result.ok) logger.warn(`${ev.eventType} ${ev.id} failed: ${result.error}`);
        return result.ok ? result.result : `failed: ${result.error}`;
      },
      { connection, concurrency },
    );

    await maintenance.upsertJobScheduler("sweepers", { every: 60_000 }, { name: "sweep" });
    const maintenanceWorker = new Worker(
      MAINTENANCE_QUEUE,
      async () => {
        const report = await runSweepers();
        logger.log(`Sweep: ${JSON.stringify(report)}`);
        return report;
      },
      { connection, concurrency: 1 },
    );
    closers.push(() => eventsWorker.close(), () => maintenanceWorker.close());
    logger.log(`BullMQ consumers started (concurrency ${concurrency})`);
  }

  logger.log("Advo TZ worker started");

  // Listing AI heartbeat: cheap unless a configured slot just passed, and it
  // swallows its own failures so discovery can never stall outbox delivery.
  timers.push(
    setInterval(() => {
      void runListingAiTick()
        .then((result) => {
          if (result) logger.log(`Listing AI: ${result.status} — ${result.message}`);
        })
        .catch((err) => logger.warn(`Listing AI tick: ${err instanceof Error ? err.message : err}`));
    }, 60_000),
  );

  const shutdown = async () => {
    timers.forEach(clearInterval);
    for (const close of closers) await close().catch(() => undefined);
    await app.close();
    await closeRateLimiter();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
