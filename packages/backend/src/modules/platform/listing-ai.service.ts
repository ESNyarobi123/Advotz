import { createHash } from "node:crypto";
import { prisma, type ListingKind, type Prisma } from "@advo/db";
import {
  LISTING_KINDS,
  listingAiItemSchema,
  listingAiSettingsSchema,
  type ListingAiSettingsInput,
} from "@advo/contracts";
import { badRequest } from "../../common/errors.js";
import { isProduction } from "../../common/providers.js";
import { getSetting, setSetting } from "../settings/settings.service.js";

/**
 * The listing assistant ("Advowifi AI").
 *
 * Admin decides how often it looks for fresh jobs, opportunities, events and
 * holiday ideas, how many it may publish per day and when. The worker calls
 * `runListingAiTick()` every minute; a tick only performs a discovery run when
 * a configured time slot has just passed and the daily caps allow it.
 *
 * The model is Gemini through the public REST API. The API key lives in the
 * environment (`GEMINI_API_KEY`) and is never stored in the database or sent to
 * the browser.
 */

export const LISTING_AI_SETTING_KEY = "portal.listingAi";

const DEFAULT_MODEL = "gemini-3.8-flash";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Flash models that take over when the configured one is unavailable.
 *
 * `gemini-flash-latest` is deliberately not used: it currently resolves to the
 * newest flash, so it inherits the same overload. Older, still-served ids keep
 * discovery working through a provider incident.
 */
const FALLBACK_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash"];
/** Abort a model attempt when no bytes arrive for this long (overloaded models stall). */
const IDLE_TIMEOUT_MS = 10_000;
/** Hard cap for one model attempt. */
const ATTEMPT_TIMEOUT_MS = 40_000;
/** Budget for one whole discovery call across every model attempt. */
const TOTAL_BUDGET_MS = 70_000;
/** While the configured model is failing, still retry it this often. */
const CONFIGURED_RETRY_MINUTES = 60;
/** A tick fires inside this window after a configured slot. */
const SLOT_WINDOW_MINUTES = 20;
/** A run that never finished is marked failed after this long. */
const STALE_RUN_MINUTES = 30;

export type ListingAiSettings = ListingAiSettingsInput;

export function listingAiApiKey(): string {
  return (process.env.GEMINI_API_KEY ?? "").trim();
}

function withDefaults(value: unknown): ListingAiSettings {
  const parsed = listingAiSettingsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : listingAiSettingsSchema.parse({});
}

export async function getListingAiSettings(): Promise<ListingAiSettings> {
  const stored = await getSetting<unknown>(LISTING_AI_SETTING_KEY);
  return withDefaults(stored);
}

export async function saveListingAiSettings(input: ListingAiSettings, actorUserId: string) {
  return setSetting(LISTING_AI_SETTING_KEY, input, actorUserId, "Listing AI schedule updated");
}

// ── Timezone helpers ────────────────────────────────────────────────────────

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number };

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: read("year"), month: read("month"), day: read("day"), hour: read("hour") % 24, minute: read("minute") };
}

function zoneOffsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(date.getTime() / 60_000) * 60_000;
}

/** The UTC instant of local midnight for the zone. */
export function startOfZonedDay(date: Date, timeZone: string): Date {
  const p = zonedParts(date, timeZone);
  const guess = Date.UTC(p.year, p.month - 1, p.day, 0, 0);
  return new Date(guess - zoneOffsetMs(new Date(guess), timeZone));
}

function zonedSlot(date: Date, minutes: number, timeZone: string): Date {
  const p = zonedParts(date, timeZone);
  const guess = Date.UTC(p.year, p.month - 1, p.day, Math.floor(minutes / 60), minutes % 60);
  return new Date(guess - zoneOffsetMs(new Date(guess), timeZone));
}

function minutesOf(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function localMinutes(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  return p.hour * 60 + p.minute;
}

// ── Gemini ──────────────────────────────────────────────────────────────────

type GeminiResult = {
  items: Array<{ item: ReturnType<typeof listingAiItemSchema.parse>; sourceUrl: string }>;
  model: string;
  rawCount: number;
};

const responseSchema = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      kind: { type: "STRING", enum: [...LISTING_KINDS] },
      title: { type: "STRING" },
      organization: { type: "STRING" },
      location: { type: "STRING" },
      region: { type: "STRING" },
      employmentType: { type: "STRING" },
      summary: { type: "STRING" },
      description: { type: "STRING" },
      venue: { type: "STRING" },
      link: { type: "STRING" },
      contactPhone: { type: "STRING" },
      priceLabel: { type: "STRING" },
      tags: { type: "ARRAY", items: { type: "STRING" } },
      startsAt: { type: "STRING" },
      endsAt: { type: "STRING" },
      sourceUrl: { type: "STRING" },
      score: { type: "INTEGER" },
    },
    required: ["kind", "title", "summary", "sourceUrl", "score"],
  },
} as const;

function buildPrompt(settings: ListingAiSettings, limit: number, now: Date): string {
  const today = now.toISOString().slice(0, 10);
  const regions = settings.regions.length ? settings.regions.join(", ") : "Tanzania";
  return [
    `You are ${settings.assistantName}, the discovery assistant for AdvoWiFi in Tanzania.`,
    `Today is ${today}. Find up to ${limit} real, currently relevant items to publish to WiFi guests.`,
    `Kinds to search: ${settings.kinds.join(", ")}. Regions: ${regions}.`,
    "Rules:",
    "- Only include items you can attribute to a real public source (a job board, employer page, event page, tourism page).",
    "- Never invent an item, employer, venue, date or phone number. If unsure, omit it.",
    "- JOB / OPPORTUNITY must be open now (or have a future deadline) and must include how to apply.",
    "- LOCAL_EVENT must be an upcoming event in Tanzania and include the venue and start date.",
    "- HOLIDAY should be a real trip, getaway or holiday offer with a place and a price hint when known.",
    "- Write title/summary/description in simple English a Tanzanian guest can read quickly.",
    "- startsAt and endsAt use ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss) or an empty string when unknown.",
    "- score is 0-100: how confident you are that the item is real, current and useful.",
    "- Return only a JSON array. Do not wrap it in markdown.",
  ].join("\n");
}

type GeminiEnvelope = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
};

/** A Gemini failure we can classify: retry elsewhere, or stop and explain. */
class GeminiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }

  /** 0 is a network/stall failure; 429 and 5xx mean "try another model". */
  get retryable() {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

/** Concatenated answer text, ignoring the thought parts of thinking models. */
function envelopeText(payload: GeminiEnvelope): string {
  const parts = payload.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((part) => part.text && part.thought !== true)
    .map((part) => part.text ?? "")
    .join("");
}

/**
 * One streaming call.
 *
 * Streaming is what keeps long answers alive: the bytes arrive as the model
 * writes them, so a slow-but-working model never trips a single total timeout
 * the way one long `generateContent` request did.
 */
async function requestGemini(model: string, payload: Record<string, unknown>): Promise<string> {
  const key = listingAiApiKey();
  const url = `${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;

  const controller = new AbortController();
  let stalled = false;
  let expired = false;
  const stall = () => {
    stalled = true;
    controller.abort();
  };
  let idle = setTimeout(stall, IDLE_TIMEOUT_MS);
  const hard = setTimeout(() => {
    expired = true;
    controller.abort();
  }, ATTEMPT_TIMEOUT_MS);
  const bump = () => {
    clearTimeout(idle);
    idle = setTimeout(stall, IDLE_TIMEOUT_MS);
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text();
      const message = (() => {
        try {
          const body = JSON.parse(detail) as { error?: { message?: string } };
          return body.error?.message ?? detail.slice(0, 200);
        } catch {
          return detail.slice(0, 200);
        }
      })();
      throw new GeminiError(res.status, message);
    }
    if (!res.body) throw new GeminiError(0, "Gemini returned an empty stream");

    const decoder = new TextDecoder();
    let pending = "";
    let answer = "";
    let envelope = "";

    const consume = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) return;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") return;
      try {
        answer += envelopeText(JSON.parse(data) as GeminiEnvelope);
      } catch {
        // A malformed chunk is not fatal; the next one may still carry text.
      }
    };

    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      bump();
      const text = decoder.decode(chunk, { stream: true });
      envelope += text;
      pending += text;
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) consume(line);
    }
    if (pending) consume(pending);

    if (answer.trim()) return answer;

    // Some keys get a single JSON envelope instead of SSE; accept that too.
    const whole = (() => {
      try {
        return JSON.parse(envelope) as GeminiEnvelope;
      } catch {
        return null;
      }
    })();
    const fromEnvelope = whole ? envelopeText(whole) : "";
    if (fromEnvelope.trim()) return fromEnvelope;

    const blocked = whole?.promptFeedback?.blockReason;
    const finish = whole?.candidates?.[0]?.finishReason;
    throw new GeminiError(
      0,
      blocked ? `Gemini blocked the request (${blocked})` : `Gemini returned no text${finish ? ` (${finish})` : ""}`,
    );
  } catch (error) {
    if (stalled) throw new GeminiError(0, `${model} stopped sending data for ${IDLE_TIMEOUT_MS / 1000}s`);
    if (expired) throw new GeminiError(0, `${model} did not finish within ${ATTEMPT_TIMEOUT_MS / 1000}s`);
    throw error;
  } finally {
    clearTimeout(idle);
    clearTimeout(hard);
  }
}

/**
 * Every complete `{...}` block in a text, strings and escapes respected.
 *
 * Used as a last resort: it keeps the items that survived even when the model
 * wrote a trailing comma, extra prose or a stream cut mid-object.
 */
function balancedObjects(text: string): string[] {
  const found: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        found.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return found;
}

/** Turns a raw answer into listings, tolerating a stray markdown fence. */
export function parseAnswer(raw: string): unknown {
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned) as unknown;
  } catch {
    /* keep going: the answer needs repair */
  }

  // The model sometimes wraps the array in prose; keep the outermost array.
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
    } catch {
      /* fall through to the per-object repair */
    }
  }

  // Last resort: keep whichever objects are individually valid.
  const objects = balancedObjects(cleaned)
    .map((block) => {
      try {
        return JSON.parse(block) as unknown;
      } catch {
        return null;
      }
    })
    .filter((value): value is unknown => value !== null);
  if (objects.length > 0) return objects;

  throw new GeminiError(0, `Gemini answer was not valid JSON (starts with: ${cleaned.slice(0, 80)})`);
}

function itemCount(payload: unknown): number {
  if (Array.isArray(payload)) return payload.length;
  const nested = (payload as { listings?: unknown })?.listings;
  return Array.isArray(nested) ? nested.length : 0;
}

/** Admin-facing explanation, so the run log says what actually went wrong. */
function explain(error: unknown): string {
  if (!(error instanceof GeminiError)) return error instanceof Error ? error.message : String(error);
  if (error.status === 429) return `Gemini quota reached for this key: ${error.message}`;
  if (error.status === 503) return "Gemini is overloaded right now (503). Try again in a few minutes.";
  if (error.status === 404) return `Gemini model is not available to this key: ${error.message}`;
  if (error.status === 400) return `Gemini rejected the request: ${error.message}`;
  return error.message;
}

/**
 * Asks Gemini for listings, walking a short fallback chain of flash models.
 *
 * The plain JSON-schema attempt runs first because it is the fastest and most
 * reliable. A grounded attempt (Google Search) only runs when that one produced
 * nothing, since search grounding is rate limited on free keys and is much slower.
 */
async function callGemini(model: string, prompt: string): Promise<{ payload: unknown; model: string }> {
  const key = listingAiApiKey();
  if (!key) badRequest("GEMINI_API_KEY is not configured on the server");

  // Prefer a model that answered recently. When the configured model is having
  // an incident we lead with the healthy one, but retry the configured model at
  // least hourly so a recovered model is picked back up automatically.
  const recent = await prisma.listingAiRun.findMany({
    where: { finishedAt: { not: null } },
    orderBy: { startedAt: "desc" },
    take: 12,
    select: { status: true, model: true, startedAt: true },
  });
  const healthy = recent.find((run) => run.status === "SUCCEEDED" && run.model && run.model !== model);
  const configuredAttempt = recent.find((run) => run.model === model);
  const configuredStale =
    !configuredAttempt || Date.now() - configuredAttempt.startedAt.getTime() > CONFIGURED_RETRY_MINUTES * 60_000;
  const configuredFailed = configuredAttempt ? configuredAttempt.status !== "SUCCEEDED" : false;
  const leadWithHealthy = configuredFailed && !configuredStale && Boolean(healthy);
  const leading = leadWithHealthy ? [healthy!.model, model] : [model, healthy?.model];
  const chain = [...new Set([...leading, ...FALLBACK_MODELS].filter((id): id is string => Boolean(id)))];

  const base = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      // This is an extraction task; thinking only adds latency and cost.
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  const schemaAttempt = { ...base, generationConfig: { ...base.generationConfig, responseSchema } };
  const groundedAttempt = { ...base, tools: [{ google_search: {} }] };

  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let lastError: unknown = "Gemini request failed";

  for (const candidate of chain) {
    if (Date.now() > deadline) break;
    let emptyAnswer: unknown = null;

    for (const payload of [schemaAttempt, groundedAttempt]) {
      if (Date.now() > deadline) break;
      try {
        const payloadJson = parseAnswer(await requestGemini(candidate, payload));
        if (itemCount(payloadJson) > 0) return { payload: payloadJson, model: candidate };
        // A valid but empty answer: the grounded attempt may still find something.
        emptyAnswer = payloadJson;
        lastError = new GeminiError(0, "Gemini returned no listings");
      } catch (error) {
        lastError = error;
        // Missing model, quota or overload: retrying this model is wasted time,
        // and the grounded variant shares the same per-model quota.
        if (error instanceof GeminiError && (error.status === 404 || error.retryable)) break;
      }
    }

    if (emptyAnswer) return { payload: emptyAnswer, model: candidate };
  }

  throw new Error(explain(lastError));
}

function normaliseItems(payload: unknown): Array<ReturnType<typeof listingAiItemSchema.parse>> {
  const array = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { listings?: unknown })?.listings)
      ? ((payload as { listings: unknown[] }).listings)
      : [];
  const items: Array<ReturnType<typeof listingAiItemSchema.parse>> = [];
  for (const raw of array) {
    const parsed = listingAiItemSchema.safeParse(raw);
    if (parsed.success) items.push(parsed.data);
  }
  return items;
}

function dedupeKey(item: ReturnType<typeof listingAiItemSchema.parse>): string {
  const key = [item.kind, item.title.toLowerCase(), item.organization.toLowerCase(), item.startsAt.slice(0, 10), item.link || item.sourceUrl]
    .join("|")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(key).digest("hex");
}

/** Tanzania is UTC+3 all year, so a local calendar day starts three hours early in UTC. */
const TANZANIA_OFFSET_MS = 3 * 60 * 60 * 1000;

export function parseDate(value: string): Date | null {
  const raw = value.trim();
  if (!raw) return null;
  // A bare date (YYYY-MM-DD) means the local calendar day in Tanzania. Parsing it
  // with `new Date()` would treat it as UTC midnight and show up as 03:00 in the
  // admin form, so anchor it to midnight East Africa Time instead.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(`${raw}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : new Date(date.getTime() - TANZANIA_OFFSET_MS);
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

// ── Runs ────────────────────────────────────────────────────────────────────

export type ListingAiRunResult = {
  status: "SUCCEEDED" | "FAILED" | "SKIPPED";
  runId?: string;
  posted: number;
  analysed: number;
  skipped: number;
  message: string;
};

async function runDiscovery(
  settings: ListingAiSettings,
  options: { trigger: "SCHEDULE" | "MANUAL"; actorUserId?: string; postsLimit?: number },
): Promise<ListingAiRunResult> {
  const now = new Date();
  const model = settings.model || DEFAULT_MODEL;
  const dayStart = startOfZonedDay(now, settings.timezone);

  const postedToday = await prisma.platformListing.count({
    where: { source: "AI", createdAt: { gte: dayStart } },
  });
  const remaining = Math.max(0, settings.postsPerDay - postedToday);
  const limit = Math.min(options.postsLimit ?? remaining, remaining, 20);
  if (limit <= 0) {
    return { status: "SKIPPED", posted: 0, analysed: 0, skipped: 0, message: "Daily post limit already reached" };
  }

  const run = await prisma.listingAiRun.create({
    data: { trigger: options.trigger, status: "RUNNING", model, startedAt: now },
  });

  try {
    const answer = await callGemini(model, buildPrompt(settings, limit, now));
    const payload = answer.payload;
    const usedModel = answer.model;
    const rawItems = normaliseItems(payload);
    const items = rawItems
      .filter((item) => item.score >= settings.minScore)
      .filter((item) => settings.kinds.includes(item.kind))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const prepared = items.map((item) => {
      const startsAt = parseDate(item.startsAt);
      const endsAt = parseDate(item.endsAt);
      const autoPublish = settings.autoPublish;
      return {
        kind: item.kind as ListingKind,
        title: item.title,
        organization: item.organization,
        location: item.location,
        region: item.region,
        employmentType: item.employmentType,
        summary: item.summary,
        description: item.description,
        venue: item.venue,
        link: item.link,
        contactPhone: item.contactPhone,
        priceLabel: item.priceLabel,
        tags: item.tags,
        startsAt,
        endsAt,
        publishedAt: autoPublish ? new Date(now.getTime() + settings.publishDelayMinutes * 60_000) : null,
        active: autoPublish,
        source: "AI" as const,
        sourceUrl: item.sourceUrl,
        aiModel: usedModel,
        aiRunId: run.id,
        dedupeKey: dedupeKey(item),
      };
    });

    const existing = prepared.length
      ? await prisma.platformListing.findMany({
          where: { dedupeKey: { in: prepared.map((row) => row.dedupeKey) } },
          select: { dedupeKey: true },
        })
      : [];
    const seen = new Set(existing.map((row) => row.dedupeKey));
    const fresh = prepared.filter((row) => !seen.has(row.dedupeKey));

    let posted = 0;
    if (fresh.length) {
      const result = await prisma.platformListing.createMany({ data: fresh, skipDuplicates: true });
      posted = result.count;
    }

    const analysed = rawItems.length;
    const skipped = Math.max(0, analysed - posted);
    await prisma.listingAiRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCEEDED",
        // Record the model that actually answered, not just the configured one.
        model: usedModel,
        analysedCount: analysed,
        postedCount: posted,
        skippedCount: skipped,
        finishedAt: new Date(),
        detail: {
          requested: limit,
          remaining,
          autoPublish: settings.autoPublish,
          kinds: settings.kinds,
          regions: settings.regions,
          skippedDuplicates: prepared.length - fresh.length,
          requestedModel: model,
          usedModel,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      status: "SUCCEEDED",
      runId: run.id,
      posted,
      analysed,
      skipped,
      message: posted > 0 ? `${posted} new listing${posted === 1 ? "" : "s"} added` : "No new listings passed the filters",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.listingAiRun.update({
      where: { id: run.id },
      data: { status: "FAILED", error: message.slice(0, 1000), finishedAt: new Date() },
    });
    return { status: "FAILED", runId: run.id, posted: 0, analysed: 0, skipped: 0, message };
  }
}

/** Runs immediately, regardless of the schedule. Used by the Admin button. */
export async function runListingAiNow(options: { postsLimit?: number } = {}) {
  const settings = await getListingAiSettings();
  if (!listingAiApiKey()) badRequest("GEMINI_API_KEY is not configured on the server");
  return runDiscovery(settings, { trigger: "MANUAL", postsLimit: options.postsLimit });
}

/**
 * Worker heartbeat: called once a minute. Never throws, so a failing AI call can
 * never take the worker down or block outbox delivery.
 */
export async function runListingAiTick(now = new Date()): Promise<ListingAiRunResult | null> {
  try {
    const settings = await getListingAiSettings();
    if (!settings.enabled || !listingAiApiKey()) return null;

    const timeZone = settings.timezone;
    const dayStart = startOfZonedDay(now, timeZone);

    // A crashed run must not block the rest of the day.
    await prisma.listingAiRun.updateMany({
      where: { status: "RUNNING", startedAt: { lt: new Date(now.getTime() - STALE_RUN_MINUTES * 60_000) } },
      data: { status: "FAILED", error: "Run timed out", finishedAt: now },
    });

    const runsToday = await prisma.listingAiRun.count({
      where: { trigger: "SCHEDULE", startedAt: { gte: dayStart } },
    });
    if (runsToday >= settings.analysesPerDay) return null;

    const minutes = localMinutes(now, timeZone);
    const slots = [...new Set(settings.times.map(minutesOf))].sort((a, b) => a - b).slice(0, settings.analysesPerDay);
    const due = slots.find((slot) => minutes >= slot && minutes < slot + SLOT_WINDOW_MINUTES);
    if (due === undefined) return null;

    // One run per slot, even when the worker restarts inside the window.
    const slotStart = zonedSlot(now, due, timeZone);
    const already = await prisma.listingAiRun.findFirst({
      where: { trigger: "SCHEDULE", startedAt: { gte: new Date(slotStart.getTime() - 2 * 60_000) } },
      select: { id: true },
    });
    if (already) return null;

    return await runDiscovery(settings, { trigger: "SCHEDULE" });
  } catch (error) {
    if (isProduction()) {
      console.error("[listing-ai] tick failed", error);
    }
    return null;
  }
}

/** Everything the Admin AI panel needs in one round trip. */
export async function listingAiOverview() {
  const settings = await getListingAiSettings();
  const now = new Date();
  const dayStart = startOfZonedDay(now, settings.timezone);

  const [runs, aiToday, drafts, totalAi] = await Promise.all([
    prisma.listingAiRun.findMany({ orderBy: { startedAt: "desc" }, take: 12 }),
    prisma.platformListing.count({ where: { source: "AI", createdAt: { gte: dayStart } } }),
    prisma.platformListing.count({ where: { source: "AI", active: false } }),
    prisma.platformListing.count({ where: { source: "AI" } }),
  ]);

  const slots = [...new Set(settings.times.map(minutesOf))].sort((a, b) => a - b);
  const pendingToday = slots.find((slot) => slot > localMinutes(now, settings.timezone));
  // After the last slot of the day the next run belongs to tomorrow, so the
  // panel does not go blank every evening.
  const nextRunAt =
    settings.enabled && slots.length > 0
      ? pendingToday !== undefined
        ? zonedSlot(now, pendingToday, settings.timezone)
        : zonedSlot(new Date(startOfZonedDay(now, settings.timezone).getTime() + 36 * 60 * 60 * 1000), slots[0]!, settings.timezone)
      : null;

  return {
    settings,
    runs,
    stats: { aiToday, drafts, totalAi, postedToday: aiToday },
    nextRunAt,
    apiConfigured: Boolean(listingAiApiKey()),
  };
}
