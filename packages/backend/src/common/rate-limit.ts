import { Redis } from "ioredis";
import { tooManyRequests } from "./errors.js";

let client: Redis | null = null;
const memory = new Map<string, { count: number; resetAt: number }>();

function redis(): Redis | null {
  if (process.env.RATE_LIMIT_BACKEND === "memory") return null;
  if (!client && process.env.REDIS_URL) {
    client = new Redis(process.env.REDIS_URL, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    client.on("error", () => {
      // Redis outages fall back to per-process counters below.
    });
  }
  return client;
}

/**
 * Fixed-window limiter. Redis-backed so API replicas share counters; falls back to
 * per-process memory if Redis is unreachable rather than disabling protection.
 */
export async function enforceRateLimit(bucket: string, key: string, limit: number, windowSeconds: number) {
  const id = `rl:${bucket}:${key}`;
  const r = redis();
  if (r && r.status === "ready") {
    let count: number | null = null;
    try {
      count = await r.incr(id);
      if (count === 1) await r.expire(id, windowSeconds);
    } catch {
      count = null;
    }
    if (count !== null) {
      if (count > limit) tooManyRequests();
      return;
    }
  }
  const now = Date.now();
  const entry = memory.get(id);
  if (!entry || entry.resetAt < now) {
    memory.set(id, { count: 1, resetAt: now + windowSeconds * 1000 });
    return;
  }
  entry.count += 1;
  if (entry.count > limit) tooManyRequests();
}

export async function rateLimitBackendHealth(): Promise<"up" | "down" | "memory"> {
  const r = redis();
  if (!r) return "memory";
  try {
    return (await r.ping()) === "PONG" ? "up" : "down";
  } catch {
    return "down";
  }
}

export async function closeRateLimiter() {
  if (client) {
    await client.quit().catch(() => undefined);
    client = null;
  }
}
