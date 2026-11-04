import { prisma, Prisma, type UsageSource } from "@advo/db";
import { normalizeMac, UnsupportedCapabilityError, type OmadaControllerAdapter } from "@advo/omada";
import { getControllerAdapter } from "../../common/providers.js";

/**
 * Data-usage accounting for Reseller clients.
 *
 * Guest internet traffic never passes through Advo, so the Controller is the
 * only possible source of truth. Two paths exist, in this order:
 *
 * 1. **Controller counters.** `listClients` (a verified, read-only call) is
 *    read once per site per sweep. Some Omada builds include per-client traffic
 *    on those rows; when they do, the delta from the previous counter is exact.
 *    If a future adapter verifies `readUsage`, that is also used as a fallback.
 * 2. **Conservative estimate.** When the Controller reports no counters (the
 *    current v6.3 contract does not), the sampler derives traffic from the
 *    package's download/upload limit and the time the device was actually
 *    online, using a low utilisation factor. The dashboard labels this share
 *    as estimated instead of pretending it is measured.
 *
 * Both paths are strictly read-only: nothing here re-authorizes, disconnects,
 * throttles or blocks a client, so counting usage never disturbs the guest.
 */

/** How often a device is read. The sweeper runs every minute, so most passes skip. */
export const USAGE_SAMPLE_INTERVAL_MS = 5 * 60_000;
/** One row per device per UTC hour: 720 rows per device for a 30-day window. */
const BUCKET_MS = 60 * 60_000;
/** A long worker outage must not turn into a wildly inflated estimate. */
const MAX_ESTIMATE_WINDOW_MS = 60 * 60_000;
/** Average share of the authorised speed a browsing device actually uses. */
const DOWNLOAD_UTILISATION = 0.15;
const UPLOAD_UTILISATION = 0.08;
const DEFAULT_DOWNLOAD_KBPS = 4096;
const DEFAULT_UPLOAD_KBPS = 1024;
const MAX_DEVICES_PER_SWEEP = 500;
const BREAKDOWN_LIMIT = 50;

export const USAGE_RANGES = {
  today: "today",
  yesterday: "yesterday",
  week: "week",
  month: "month",
} as const;

export type UsageRange = (typeof USAGE_RANGES)[keyof typeof USAGE_RANGES];

type UsageWindow = {
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
  bucket: "hour" | "day";
};

/** Midnight at the start of the current Africa/Dar_es_Salaam day (UTC+3, no DST). */
function startOfDarDay(now = new Date()) {
  const offsetMs = 3 * 3600_000;
  const local = new Date(now.getTime() + offsetMs);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offsetMs);
}

/** `YYYY-MM-DD` for the Dar calendar day `d` falls in. */
function darDayKey(d: Date) {
  return new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}

function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 86_400_000);
}

/** The current and comparison windows for one dashboard range. */
export function usageWindow(range: UsageRange, now = new Date()): UsageWindow {
  const today = startOfDarDay(now);
  const current =
    range === "today"
      ? { from: today, to: now, bucket: "hour" as const }
      : range === "yesterday"
        ? { from: addDays(today, -1), to: today, bucket: "hour" as const }
        : range === "week"
          ? { from: addDays(today, -6), to: now, bucket: "day" as const }
          : { from: addDays(today, -29), to: now, bucket: "day" as const };

  // Compare against an equally long window immediately before, so a partial
  // day (or a week with today still running) is never measured against a
  // completed period and reported as a fake collapse.
  const span = current.to.getTime() - current.from.getTime();
  return {
    ...current,
    previousFrom: new Date(current.from.getTime() - span),
    previousTo: current.from,
  };
}

/** Percentage change with a sane "no baseline" answer instead of infinity. */
function percentChange(current: bigint, previous: bigint): number | null {
  if (previous <= 0n) return null;
  return ((Number(current) - Number(previous)) / Number(previous)) * 100;
}

function kbpsToBytesPerSecond(kbps: number) {
  return (Math.max(0, kbps) * 1000) / 8;
}

function numberFromSnapshot(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    const parsed = Number(value);
    return parsed > 0 ? parsed : null;
  }
  return null;
}

type Counter = { total: bigint; bytesIn?: bigint; bytesOut?: bigint };

/** One Controller read per site per sweep: the counters plus who is online now. */
type SiteRead = { counters: Map<string, Counter>; online: Set<string> };

type SampleDevice = {
  id: string;
  clientMac: string;
  authorizedAt: Date | null;
  usageCheckedAt: Date | null;
  usageCounterTotal: bigint | null;
  usageSource: UsageSource | null;
  grant: {
    id: string;
    resellerId: string;
    siteId: string;
    packageSnapshot: unknown;
    activatedAt: Date | null;
    expiresAt: Date | null;
    order: { customerId: string | null } | null;
  };
};

/**
 * Reads the Controller's client list once per site. Any failure is contained
 * to that site: devices on a site we could not read are left untouched for
 * this sweep rather than estimated, because we cannot prove they are online.
 */
async function readSites(
  devices: SampleDevice[],
  adapters: Map<string, OmadaControllerAdapter>,
): Promise<Map<string, SiteRead>> {
  const siteIds = [...new Set(devices.map((device) => device.grant.siteId))];
  if (siteIds.length === 0) return new Map();

  const sites = await prisma.site.findMany({
    where: { id: { in: siteIds } },
    select: {
      id: true,
      mapping: { select: { controllerId: true, remoteSiteId: true, state: true } },
    },
  });

  const bySite = new Map<string, SiteRead>();
  for (const site of sites) {
    const mapping = site.mapping;
    if (!mapping?.controllerId || !mapping.remoteSiteId || mapping.state !== "PROVISIONED") continue;
    try {
      let adapter = adapters.get(mapping.controllerId);
      if (!adapter) {
        adapter = (await getControllerAdapter(mapping.controllerId)).adapter;
        adapters.set(mapping.controllerId, adapter);
      }
      const clients = await adapter.listClients({ remoteSiteId: mapping.remoteSiteId });
      const counters = new Map<string, Counter>();
      const online = new Set<string>();
      for (const client of clients) {
        const mac = normalizeMac(client.mac) ?? client.mac.trim().toLowerCase();
        if (!mac) continue;
        // Only a client the Controller reports as currently connected may be
        // estimated; a listed-but-offline row would inflate usage until the
        // package expired.
        if (client.connected) online.add(mac);
        const total =
          client.bytesTotal ??
          (client.bytesIn !== undefined || client.bytesOut !== undefined
            ? (client.bytesIn ?? 0n) + (client.bytesOut ?? 0n)
            : undefined);
        if (total === undefined) continue;
        counters.set(mac, { total, bytesIn: client.bytesIn, bytesOut: client.bytesOut });
      }
      bySite.set(site.id, { counters, online });
    } catch {
      // An offline Controller must not stop the sweep.
    }
  }
  return bySite;
}

/** Uses `readUsage` only when an adapter actually implements it. */
async function readCounter(
  adapter: OmadaControllerAdapter | undefined,
  remoteSiteId: string,
  clientMac: string,
): Promise<Counter | null> {
  if (!adapter) return null;
  try {
    const observed = await adapter.readUsage({ remoteSiteId, clientMac });
    const total = observed.bytesTotal ?? (observed.bytesIn ?? 0n) + (observed.bytesOut ?? 0n);
    if (total <= 0n) return null;
    return { total, bytesIn: observed.bytesIn, bytesOut: observed.bytesOut };
  } catch (error) {
    if (error instanceof UnsupportedCapabilityError) return null;
    return null;
  }
}

/** Bytes attributed to a device since its previous check, from speed limits. */
function estimateBytes(device: SampleDevice, now: Date): { bytesIn: bigint; bytesOut: bigint } {
  const snapshot = (device.grant.packageSnapshot ?? {}) as Record<string, unknown>;
  const downloadKbps = numberFromSnapshot(snapshot.downloadKbps) ?? DEFAULT_DOWNLOAD_KBPS;
  const uploadKbps = numberFromSnapshot(snapshot.uploadKbps) ?? DEFAULT_UPLOAD_KBPS;

  const grantStart = device.grant.activatedAt ?? device.authorizedAt ?? device.usageCheckedAt ?? now;
  const started = device.usageCheckedAt && device.usageCheckedAt > grantStart ? device.usageCheckedAt : grantStart;
  const endsAt = device.grant.expiresAt && device.grant.expiresAt < now ? device.grant.expiresAt : now;
  const elapsed = Math.max(0, Math.min(endsAt.getTime() - started.getTime(), MAX_ESTIMATE_WINDOW_MS));
  if (elapsed === 0) return { bytesIn: 0n, bytesOut: 0n };

  const seconds = elapsed / 1000;
  const bytesIn = BigInt(Math.round(kbpsToBytesPerSecond(downloadKbps) * seconds * DOWNLOAD_UTILISATION));
  const bytesOut = BigInt(Math.round(kbpsToBytesPerSecond(uploadKbps) * seconds * UPLOAD_UTILISATION));
  return { bytesIn, bytesOut };
}

type SampleResult = { sampled: number; controller: number; estimated: number };

/**
 * Reads (or estimates) usage for every authorised device that is due and folds
 * the delta into its hourly bucket. Idempotent per interval: a device checked
 * less than `USAGE_SAMPLE_INTERVAL_MS` ago is skipped.
 */
export async function sampleActiveUsage(now = new Date()): Promise<SampleResult> {
  const dueBefore = new Date(now.getTime() - USAGE_SAMPLE_INTERVAL_MS);
  const devices = (await prisma.accessGrantDevice.findMany({
    where: {
      authState: "AUTHORIZED",
      grant: { state: "ACTIVE", expiresAt: { gt: now } },
      OR: [{ usageCheckedAt: null }, { usageCheckedAt: { lt: dueBefore } }],
    },
    select: {
      id: true,
      clientMac: true,
      authorizedAt: true,
      usageCheckedAt: true,
      usageCounterTotal: true,
      usageSource: true,
      grant: {
        select: {
          id: true,
          resellerId: true,
          siteId: true,
          packageSnapshot: true,
          activatedAt: true,
          expiresAt: true,
          order: { select: { customerId: true } },
        },
      },
    },
    orderBy: { usageCheckedAt: { sort: "asc", nulls: "first" } },
    take: MAX_DEVICES_PER_SWEEP,
  })) as SampleDevice[];

  if (devices.length === 0) return { sampled: 0, controller: 0, estimated: 0 };

  const adapters = new Map<string, OmadaControllerAdapter>();
  const siteReads = await readSites(devices, adapters);
  const mappings = await prisma.site.findMany({
    where: { id: { in: devices.map((device) => device.grant.siteId) } },
    select: { id: true, mapping: { select: { controllerId: true, remoteSiteId: true } } },
  });
  const mappingBySite = new Map(mappings.map((site) => [site.id, site.mapping]));

  const bucketStart = new Date(Math.floor(now.getTime() / BUCKET_MS) * BUCKET_MS);
  let sampled = 0;
  let controller = 0;
  let estimated = 0;

  for (const device of devices) {
    const mac = normalizeMac(device.clientMac) ?? device.clientMac.trim().toLowerCase();
    const siteRead = siteReads.get(device.grant.siteId);
    let counter = siteRead?.counters.get(mac) ?? null;
    // Only devices the Controller currently lists can be counted. Estimating a
    // device that has already gone offline would inflate the reseller's usage
    // until the package expires.
    const online = siteRead?.online.has(mac) ?? false;

    if (!counter && online) {
      const mapping = mappingBySite.get(device.grant.siteId);
      if (mapping?.controllerId && mapping.remoteSiteId) {
        const adapter = adapters.get(mapping.controllerId) ?? (await getControllerAdapter(mapping.controllerId).catch(() => null))?.adapter;
        if (adapter) {
          adapters.set(mapping.controllerId, adapter);
          counter = await readCounter(adapter, mapping.remoteSiteId, device.clientMac);
        }
      }
    }

    let bytesIn = 0n;
    let bytesOut = 0n;
    let controllerBytes = 0n;
    let estimatedBytes = 0n;
    let source: UsageSource;
    let counterTotal: bigint | null = device.usageCounterTotal;

    if (counter) {
      source = "CONTROLLER";
      // The first controller reading only establishes a baseline: the period
      // before it was already covered by the estimate, so taking the whole
      // lifetime total here would count those bytes twice.
      if (device.usageSource === "CONTROLLER" && device.usageCounterTotal !== null) {
        const delta = counter.total >= device.usageCounterTotal ? counter.total - device.usageCounterTotal : counter.total;
        controllerBytes = delta;
        const reportedIn = counter.bytesIn ?? 0n;
        const reportedOut = counter.bytesOut ?? 0n;
        const reportedTotal = reportedIn + reportedOut;
        if (reportedTotal > 0n && delta > 0n) {
          bytesIn = (delta * reportedIn) / reportedTotal;
          bytesOut = delta - bytesIn;
        } else {
          // Only a combined counter is known: book it as download, which is
          // where the overwhelming majority of guest traffic goes.
          bytesIn = delta;
          bytesOut = 0n;
        }
      }
      counterTotal = counter.total;
    } else if (online) {
      source = "ESTIMATED";
      const delta = estimateBytes(device, now);
      bytesIn = delta.bytesIn;
      bytesOut = delta.bytesOut;
      estimatedBytes = bytesIn + bytesOut;
    } else {
      // Not connected: stamp the check so the next sweep retries, but record
      // no traffic and keep the last counter baseline for a future delta.
      await prisma.accessGrantDevice.update({ where: { id: device.id }, data: { usageCheckedAt: now } });
      continue;
    }

    const total = bytesIn + bytesOut;
    const customerId = device.grant.order?.customerId ?? null;

    // Always stamp the check so a quiet device is not retried every minute.
    const updates: Prisma.AccessGrantDeviceUpdateInput = {
      usageCheckedAt: now,
      usageSource: source,
      usageCounterTotal: counterTotal,
    };
    if (total > 0n) {
      updates.usageBytesIn = { increment: bytesIn };
      updates.usageBytesOut = { increment: bytesOut };
    }

    const operations: Prisma.PrismaPromise<unknown>[] = [
      prisma.accessGrantDevice.update({ where: { id: device.id }, data: updates }),
    ];

    if (total > 0n) {
      operations.push(
        prisma.trafficUsageSample.upsert({
          where: { grantDeviceId_bucketStart: { grantDeviceId: device.id, bucketStart } },
          create: {
            resellerId: device.grant.resellerId,
            siteId: device.grant.siteId,
            customerId,
            grantId: device.grant.id,
            grantDeviceId: device.id,
            clientMac: mac,
            bucketStart,
            bytesIn,
            bytesOut,
            controllerBytes,
            estimatedBytes,
            lastSampledAt: now,
          },
          update: {
            bytesIn: { increment: bytesIn },
            bytesOut: { increment: bytesOut },
            controllerBytes: { increment: controllerBytes },
            estimatedBytes: { increment: estimatedBytes },
            lastSampledAt: now,
          },
        }),
      );
    }

    await prisma.$transaction(operations);
    sampled += 1;
    if (controllerBytes > 0n) controller += 1;
    if (estimatedBytes > 0n) estimated += 1;
  }

  return { sampled, controller, estimated };
}

export type ResellerUsageFilters = {
  siteId?: string;
  customerId?: string;
  range: UsageRange;
};

type GroupedRow = {
  grantDeviceId: string;
  clientMac: string;
  customerId: string | null;
  siteId: string;
  _sum: { bytesIn: bigint | null; bytesOut: bigint | null; controllerBytes: bigint | null; estimatedBytes: bigint | null };
  _max: { lastSampledAt: Date | null };
};

export type UsageDeviceRow = {
  grantDeviceId: string;
  clientMac: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  siteId: string;
  siteName: string;
  bytesIn: bigint;
  bytesOut: bigint;
  bytes: bigint;
  controllerBytes: bigint;
  estimatedBytes: bigint;
  source: "CONTROLLER" | "ESTIMATED" | "MIXED" | "UNKNOWN";
  active: boolean;
  lastSeenAt: Date | null;
};

/**
 * Aggregated usage for the Reseller dashboard.
 *
 * Everything is scoped by `resellerId`, and `siteId`/`customerId` come through
 * the same ownership checks as the other Reseller reports, so one tenant can
 * never read another's traffic.
 */
export async function resellerUsage(resellerId: string, filters: ResellerUsageFilters) {
  const now = new Date();
  const window = usageWindow(filters.range, now);
  const baseWhere: Prisma.TrafficUsageSampleWhereInput = {
    resellerId,
    ...(filters.siteId ? { siteId: filters.siteId } : {}),
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
  };
  const currentWhere: Prisma.TrafficUsageSampleWhereInput = {
    ...baseWhere,
    bucketStart: { gte: window.from, lt: window.to },
  };
  const previousWhere: Prisma.TrafficUsageSampleWhereInput = {
    ...baseWhere,
    bucketStart: { gte: window.previousFrom, lt: window.previousTo },
  };

  const [current, previous, grouped, coverage, customers] = await Promise.all([
    prisma.trafficUsageSample.aggregate({
      where: currentWhere,
      _sum: { bytesIn: true, bytesOut: true, controllerBytes: true, estimatedBytes: true },
    }),
    prisma.trafficUsageSample.aggregate({
      where: previousWhere,
      _sum: { bytesIn: true, bytesOut: true },
    }),
    prisma.trafficUsageSample.groupBy({
      by: ["grantDeviceId", "clientMac", "customerId", "siteId"],
      where: currentWhere,
      _sum: { bytesIn: true, bytesOut: true, controllerBytes: true, estimatedBytes: true },
      _max: { lastSampledAt: true },
      orderBy: { _sum: { bytesIn: "desc" } },
      take: 500,
    }),
    prisma.trafficUsageSample.aggregate({
      where: { resellerId, ...(filters.siteId ? { siteId: filters.siteId } : {}) },
      _max: { lastSampledAt: true },
    }),
    prisma.customer.findMany({
      where: { resellerId },
      select: { id: true, phone: true, firstName: true, lastName: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ]);

  const rows = grouped;
  const customerIds = [...new Set(rows.map((row) => row.customerId).filter((value): value is string => Boolean(value)))];
  const siteIds = [...new Set(rows.map((row) => row.siteId))];
  const activeRows =
    rows.length === 0
      ? []
      : await prisma.accessGrantDevice.findMany({
          where: {
            id: { in: rows.map((row) => row.grantDeviceId) },
            authState: "AUTHORIZED",
            grant: { state: "ACTIVE", expiresAt: { gt: now } },
          },
          select: { id: true },
        });
  const activeIds = new Set(activeRows.map((row) => row.id));

  const [siteRows, customerRows] = await Promise.all([
    siteIds.length > 0
      ? prisma.site.findMany({ where: { id: { in: siteIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    customerIds.length > 0
      ? prisma.customer.findMany({
          where: { id: { in: customerIds }, resellerId },
          select: { id: true, phone: true, firstName: true, lastName: true },
        })
      : Promise.resolve([]),
  ]);
  const siteName = new Map(siteRows.map((site) => [site.id, site.name]));
  const customerById = new Map(customerRows.map((customer) => [customer.id, customer]));

  const devices: UsageDeviceRow[] = rows
    .map((row) => {
      const bytesIn = row._sum.bytesIn ?? 0n;
      const bytesOut = row._sum.bytesOut ?? 0n;
      const controllerBytes = row._sum.controllerBytes ?? 0n;
      const estimatedBytes = row._sum.estimatedBytes ?? 0n;
      const customer = row.customerId ? customerById.get(row.customerId) : undefined;
      const source: UsageDeviceRow["source"] =
        controllerBytes > 0n && estimatedBytes > 0n
          ? "MIXED"
          : estimatedBytes > 0n
            ? "ESTIMATED"
            : controllerBytes > 0n
              ? "CONTROLLER"
              : "UNKNOWN";
      return {
        grantDeviceId: row.grantDeviceId,
        clientMac: row.clientMac,
        customerId: row.customerId,
        customerName: customer ? [customer.firstName, customer.lastName].filter(Boolean).join(" ") || null : null,
        customerPhone: customer?.phone ?? null,
        siteId: row.siteId,
        siteName: siteName.get(row.siteId) ?? "—",
        bytesIn,
        bytesOut,
        bytes: bytesIn + bytesOut,
        controllerBytes,
        estimatedBytes,
        source,
        active: activeIds.has(row.grantDeviceId),
        lastSeenAt: row._max.lastSampledAt,
      };
    })
    .sort((a, b) => (b.bytes > a.bytes ? 1 : b.bytes < a.bytes ? -1 : 0))
    .slice(0, BREAKDOWN_LIMIT);

  const bytesIn = current._sum.bytesIn ?? 0n;
  const bytesOut = current._sum.bytesOut ?? 0n;
  const bytes = bytesIn + bytesOut;
  const previousBytes = (previous._sum.bytesIn ?? 0n) + (previous._sum.bytesOut ?? 0n);
  const controllerBytes = current._sum.controllerBytes ?? 0n;
  const estimatedBytes = current._sum.estimatedBytes ?? 0n;
  const deviceCount = rows.length;
  const activeDeviceCount = rows.filter((row) => activeIds.has(row.grantDeviceId)).length;

  const series = await usageSeries(resellerId, filters, window);
  const topDevice = devices[0] ?? null;

  return {
    range: filters.range,
    from: window.from,
    to: window.to,
    bucket: window.bucket,
    totals: {
      bytesIn,
      bytesOut,
      bytes,
      previousBytes,
      deltaPct: percentChange(bytes, previousBytes),
      deviceCount,
      activeDeviceCount,
      averageBytes: deviceCount > 0 ? bytes / BigInt(deviceCount) : 0n,
      controllerBytes,
      estimatedBytes,
      estimatedPercent: bytes > 0n ? Number((estimatedBytes * 10_000n) / bytes) / 100 : 0,
      topDevice: topDevice
        ? {
            label: topDevice.customerName ?? topDevice.customerPhone ?? topDevice.clientMac,
            bytes: topDevice.bytes,
          }
        : null,
    },
    series,
    devices,
    customers: customers.map((customer) => ({
      id: customer.id,
      phone: customer.phone,
      name: [customer.firstName, customer.lastName].filter(Boolean).join(" "),
    })),
    coverage: {
      lastSampledAt: coverage._max.lastSampledAt,
      hasControllerData: controllerBytes > 0n,
      hasEstimatedData: estimatedBytes > 0n,
    },
  };
}

type SeriesPoint = { key: string; bytes: number };

/** Fills every bucket in the window so the chart has a continuous axis. */
async function usageSeries(
  resellerId: string,
  filters: { siteId?: string; customerId?: string },
  window: UsageWindow,
): Promise<SeriesPoint[]> {
  // `bucketStart` is written as UTC wall-clock into a `timestamp` column, so
  // the hour path can group on the column directly — no raw-SQL timezone
  // conversion (which would shift buckets by the server's UTC+3 offset).
  if (window.bucket === "hour") {
    const rows = await prisma.trafficUsageSample.groupBy({
      by: ["bucketStart"],
      where: {
        resellerId,
        ...(filters.siteId ? { siteId: filters.siteId } : {}),
        ...(filters.customerId ? { customerId: filters.customerId } : {}),
        bucketStart: { gte: window.from, lt: window.to },
      },
      _sum: { bytesIn: true, bytesOut: true },
    });
    const found = new Map(
      rows.map((row) => [row.bucketStart.toISOString(), (row._sum.bytesIn ?? 0n) + (row._sum.bytesOut ?? 0n)]),
    );
    const start = new Date(Math.floor(window.from.getTime() / BUCKET_MS) * BUCKET_MS);
    const end = window.to.getTime();
    const out: SeriesPoint[] = [];
    for (let at = start.getTime(); at < end; at += BUCKET_MS) {
      const key = new Date(at).toISOString();
      out.push({ key, bytes: Number(found.get(key) ?? 0n) });
    }
    return out;
  }

  const conditions: Prisma.Sql[] = [
    Prisma.sql`"resellerId" = ${resellerId}::uuid`,
    // Compare as UTC wall-clock: passing a `Date` would be rendered in the
    // server's local offset and silently shift the window by three hours.
    Prisma.sql`"bucketStart" >= (${window.from.toISOString()}::timestamptz AT TIME ZONE 'UTC')`,
    Prisma.sql`"bucketStart" < (${window.to.toISOString()}::timestamptz AT TIME ZONE 'UTC')`,
  ];
  if (filters.siteId) conditions.push(Prisma.sql`"siteId" = ${filters.siteId}::uuid`);
  if (filters.customerId) conditions.push(Prisma.sql`"customerId" = ${filters.customerId}::uuid`);
  const filter = Prisma.join(conditions, " AND ");

  const rows = await prisma.$queryRaw<Array<{ day: string; bytes: string }>>(Prisma.sql`
    SELECT ((("bucketStart" + interval '3 hours')::date))::text AS day, SUM("bytesIn" + "bytesOut")::text AS bytes
    FROM "TrafficUsageSample"
    WHERE ${filter}
    GROUP BY 1
    ORDER BY 1
  `);
  const found = new Map(rows.map((row) => [row.day, BigInt(row.bytes)]));
  const out: SeriesPoint[] = [];
  for (let day = window.from.getTime(); day <= window.to.getTime(); day += 86_400_000) {
    const key = darDayKey(new Date(day));
    out.push({ key, bytes: Number(found.get(key) ?? 0n) });
  }
  return out;
}
