import { prisma } from "@advo/db";
import type { PublicHotspotInput } from "@advo/contracts";
import { notFound } from "../../common/errors.js";

/**
 * Curated marketing hotspots for the public "Our Hotspots" page.
 *
 * Admin manages these independently of reseller Site rows so the marketing map
 * never leaks network inventory or unpublished sites.
 *
 * A hotspot may optionally point at the `Site` it operates. That link is the
 * only bridge between the marketing pin and real money: paid Wi-Fi orders are
 * recorded against a site, so `hotspotPerformance` below has nothing to report
 * until an Admin attaches one.
 */

function emptyToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value === "") return null;
  return value;
}

/** The site columns the admin list and form need, including its owner account. */
const siteLink = {
  select: {
    id: true,
    name: true,
    slug: true,
    state: true,
    location: true,
    resellerId: true,
    reseller: { select: { id: true, businessName: true, status: true, owner: { select: { email: true } } } },
  },
} as const;

type SiteLinkRow = {
  site:
    | {
        id: string;
        name: string;
        slug: string;
        state: string;
        location: string | null;
        resellerId: string;
        reseller: { id: string; businessName: string; status: string; owner: { email: string } | null };
      }
    | null;
};

/**
 * Shape of the optional site link in an API response.
 *
 * `null` for a curated hotspot that is not an AdvoWiFi-run location — the UI
 * renders those as "not linked" and hides the performance action.
 */
function siteSummary(row: SiteLinkRow["site"]) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    state: row.state,
    location: row.location,
    owner: {
      resellerId: row.resellerId,
      businessName: row.reseller.businessName,
      status: row.reseller.status,
      email: row.reseller.owner?.email ?? null,
    },
  };
}

function toAdminRow(
  row: {
    id: string;
    name: string;
    address: string;
    city: string;
    region: string;
    latitude: { toString(): string } | number;
    longitude: { toString(): string } | number;
    category: string;
    description: string;
    imageUrl: string | null;
    portalSlug: string | null;
    siteId: string | null;
    sortOrder: number;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  } & SiteLinkRow,
) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    city: row.city,
    region: row.region,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    category: row.category,
    description: row.description,
    imageUrl: row.imageUrl,
    portalSlug: row.portalSlug,
    siteId: row.siteId,
    site: siteSummary(row.site),
    sortOrder: row.sortOrder,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPublicRow(row: {
  id: string;
  name: string;
  address: string;
  city: string;
  region: string;
  latitude: { toString(): string } | number;
  longitude: { toString(): string } | number;
  category: string;
  description: string;
  imageUrl: string | null;
  portalSlug: string | null;
}) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    city: row.city,
    region: row.region,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    category: row.category,
    description: row.description,
    imageUrl: row.imageUrl,
    portalSlug: row.portalSlug,
  };
}

function dataFromInput(input: PublicHotspotInput) {
  return {
    name: input.name,
    address: input.address,
    city: input.city,
    region: input.region,
    latitude: input.latitude,
    longitude: input.longitude,
    category: input.category,
    description: input.description,
    imageUrl: emptyToNull(input.imageUrl),
    portalSlug: emptyToNull(input.portalSlug),
    siteId: emptyToNull(input.siteId),
    sortOrder: input.sortOrder,
    active: input.active,
  };
}

/** Active hotspots for the public marketing map, cheapest-sort first. */
export async function listPublicHotspots() {
  const rows = await prisma.publicHotspot.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
  return rows.map(toPublicRow);
}

/** Full catalog for Admin, including hidden rows and their site link. */
export async function listAdminHotspots() {
  const rows = await prisma.publicHotspot.findMany({
    include: { site: siteLink },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
  return rows.map(toAdminRow);
}

export async function createPublicHotspot(input: PublicHotspotInput) {
  await assertSiteExists(input.siteId);
  const row = await prisma.publicHotspot.create({ data: dataFromInput(input), include: { site: siteLink } });
  return toAdminRow(row);
}

export async function updatePublicHotspot(id: string, input: PublicHotspotInput) {
  const existing = await prisma.publicHotspot.findUnique({ where: { id } });
  if (!existing) notFound("Hotspot not found");
  await assertSiteExists(input.siteId);
  const row = await prisma.publicHotspot.update({ where: { id }, data: dataFromInput(input), include: { site: siteLink } });
  return toAdminRow(row);
}

export async function deletePublicHotspot(id: string) {
  const existing = await prisma.publicHotspot.findUnique({ where: { id } });
  if (!existing) notFound("Hotspot not found");
  await prisma.publicHotspot.delete({ where: { id } });
  return { ok: true };
}

/**
 * Reject an unknown site id before Prisma turns it into a foreign-key error, so
 * the client gets a named field instead of "Invalid reference".
 */
async function assertSiteExists(siteId: string | null | undefined) {
  const id = emptyToNull(siteId);
  if (!id) return;
  const site = await prisma.site.findUnique({ where: { id }, select: { id: true } });
  if (!site) notFound("Site not found");
}

/* ─────────────────────────────────────────────────────────────────────────
 * Performance
 *
 * Everything below is aggregated server-side from paid `Order` rows. Money is
 * summed with `_sum` rather than by adding up truncated lists, so a hotspot with
 * more history than the row cap still reports honest totals.
 * ───────────────────────────────────────────────────────────────────────── */

/** Start of "today" in Africa/Dar_es_Salaam (UTC+3, no DST). */
function startOfDarDay(now = new Date()) {
  const offsetMs = 3 * 3600_000;
  const local = new Date(now.getTime() + offsetMs);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offsetMs);
}

/** `YYYY-MM-DD` for the Dar calendar day `d` falls in. Tanzania has no DST. */
function darDayKey(d: Date) {
  return new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}

const PAID_STATES = ["PAID", "OVERPAID"] as const;
/** Window lengths the performance screen can ask for. */
const PERFORMANCE_WINDOWS = [7, 30, 90] as const;
const DEFAULT_WINDOW = 30;

function clampWindow(days: number | undefined) {
  if (!days || !Number.isFinite(days)) return DEFAULT_WINDOW;
  return PERFORMANCE_WINDOWS.reduce((best, option) => (Math.abs(option - days) < Math.abs(best - days) ? option : best));
}

/** The hotspot and the site it reports on, both optional-site aware; `404` only when the hotspot itself is missing. */
async function loadHotspot(hotspotId: string) {
  const hotspot = await prisma.publicHotspot.findUnique({
    where: { id: hotspotId },
    include: { site: siteLink },
  });
  if (!hotspot) notFound("Hotspot not found");
  return hotspot;
}

async function sumPaid(siteId: string, since?: Date) {
  const agg = await prisma.order.aggregate({
    where: {
      purpose: "WIFI_PACKAGE",
      siteId,
      paymentState: { in: [...PAID_STATES] },
      ...(since ? { paidAt: { gte: since } } : {}),
    },
    _sum: { amountTzs: true },
    _count: true,
  });
  return { count: agg._count, amountTzs: (agg._sum.amountTzs ?? 0n).toString() };
}

/**
 * Paid sales for the window, bucketed by Dar day, with every day present so the
 * chart has a continuous axis instead of collapsing quiet days.
 */
async function dailyPaid(siteId: string, days: number) {
  const today = startOfDarDay();
  const from = new Date(today.getTime() - (days - 1) * 86_400_000);
  const rows = await prisma.order.findMany({
    where: { purpose: "WIFI_PACKAGE", siteId, paymentState: { in: [...PAID_STATES] }, paidAt: { gte: from } },
    select: { amountTzs: true, paidAt: true },
  });

  const buckets = new Map<string, { count: number; amountTzs: bigint }>();
  for (const row of rows) {
    if (!row.paidAt) continue;
    const key = darDayKey(row.paidAt);
    const bucket = buckets.get(key) ?? { count: 0, amountTzs: 0n };
    bucket.count += 1;
    bucket.amountTzs += row.amountTzs;
    buckets.set(key, bucket);
  }

  return Array.from({ length: days }, (_, i) => {
    const day = darDayKey(new Date(from.getTime() + i * 86_400_000));
    const bucket = buckets.get(day);
    return { day, count: bucket?.count ?? 0, amountTzs: (bucket?.amountTzs ?? 0n).toString() };
  });
}

/** Ranked package mix inside the window. */
async function packageMix(siteId: string, since: Date) {
  const rows = await prisma.order.groupBy({
    by: ["packageRevisionId"],
    where: { purpose: "WIFI_PACKAGE", siteId, paymentState: { in: [...PAID_STATES] }, paidAt: { gte: since } },
    _sum: { amountTzs: true },
    _count: true,
  });
  const ranked = rows
    .map((row) => ({ key: row.packageRevisionId, count: row._count, amountTzs: row._sum.amountTzs ?? 0n }))
    .sort((a, b) => (a.amountTzs === b.amountTzs ? 0 : a.amountTzs > b.amountTzs ? -1 : 1));

  const revisions = await prisma.packageRevision.findMany({
    where: { id: { in: ranked.map((r) => r.key).filter((id): id is string => Boolean(id)) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(revisions.map((revision) => [revision.id, revision.name]));

  return ranked.map((row) => ({
    packageId: row.key,
    package: (row.key && nameById.get(row.key)) || "—",
    count: row.count,
    amountTzs: row.amountTzs.toString(),
  }));
}

/** Every payment state in the window, including the ones that never paid. */
async function paymentMix(siteId: string, since: Date) {
  const rows = await prisma.order.groupBy({
    by: ["paymentState"],
    where: { purpose: "WIFI_PACKAGE", siteId, createdAt: { gte: since } },
    _sum: { amountTzs: true },
    _count: true,
  });
  return rows
    .map((row) => ({
      state: row.paymentState,
      count: row._count,
      amountTzs: (row._sum.amountTzs ?? 0n).toString(),
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Performance report for one hotspot.
 *
 * `window` drives the trend, the package mix and the payment mix. The headline
 * KPIs always include today, this week and lifetime so the screen answers "how
 * is this location doing?" without the reader changing a filter first.
 */
export async function hotspotPerformance(hotspotId: string, requestedDays?: number) {
  const hotspot = await loadHotspot(hotspotId);
  const days = clampWindow(requestedDays);
  const today = startOfDarDay();
  const windowStart = new Date(today.getTime() - (days - 1) * 86_400_000);

  const hotspotSummary = {
    id: hotspot.id,
    name: hotspot.name,
    city: hotspot.city,
    region: hotspot.region,
    category: hotspot.category,
    imageUrl: hotspot.imageUrl,
    active: hotspot.active,
    portalSlug: hotspot.portalSlug,
  };
  const windowRange = { days, from: darDayKey(windowStart), to: darDayKey(today) };

  /*
   * A curated hotspot with no site still opens this screen instead of a 404.
   * The UI explains how to link one, which is far more useful than an error for
   * a page the reader reached from a card they were told has no data.
   */
  if (!hotspot.siteId || !hotspot.site) {
    const zero = { count: 0, amountTzs: "0", averageTzs: "0" };
    return {
      hotspot: hotspotSummary,
      site: null,
      window: windowRange,
      kpis: {
        today: zero,
        week: zero,
        month: zero,
        lifetime: zero,
        activeGrants: 0,
        uniqueClients: 0,
        firstSaleAt: null,
      },
      daily: Array.from({ length: days }, (_, i) => ({
        day: darDayKey(new Date(windowStart.getTime() + i * 86_400_000)),
        count: 0,
        amountTzs: "0",
      })),
      packages: [],
      payments: [],
      generatedAt: new Date().toISOString(),
    };
  }

  const siteId = hotspot.siteId;
  const weekAgo = new Date(today.getTime() - 6 * 86_400_000);
  const monthAgo = new Date(today.getTime() - 29 * 86_400_000);

  const [todayPaid, weekPaid, monthPaid, lifetime, daily, packages, payments, activeGrants, clients, firstSale] =
    await Promise.all([
      sumPaid(siteId, today),
      sumPaid(siteId, weekAgo),
      sumPaid(siteId, monthAgo),
      sumPaid(siteId),
      dailyPaid(siteId, days),
      packageMix(siteId, windowStart),
      paymentMix(siteId, windowStart),
      prisma.accessGrant.count({ where: { siteId, state: "ACTIVE", expiresAt: { gt: new Date() } } }),
      prisma.order.findMany({
        where: { purpose: "WIFI_PACKAGE", siteId, paymentState: { in: [...PAID_STATES] } },
        select: { customerId: true },
        distinct: ["customerId"],
      }),
      prisma.order.findFirst({
        where: { purpose: "WIFI_PACKAGE", siteId, paymentState: { in: [...PAID_STATES] }, paidAt: { not: null } },
        orderBy: { paidAt: "asc" },
        select: { paidAt: true },
      }),
    ]);

  const average = (paid: { count: number; amountTzs: string }) =>
    paid.count === 0 ? "0" : (BigInt(paid.amountTzs) / BigInt(paid.count)).toString();

  return {
    hotspot: hotspotSummary,
    site: siteSummary(hotspot.site),
    window: windowRange,
    kpis: {
      today: { ...todayPaid, averageTzs: average(todayPaid) },
      week: { ...weekPaid, averageTzs: average(weekPaid) },
      month: { ...monthPaid, averageTzs: average(monthPaid) },
      lifetime: { ...lifetime, averageTzs: average(lifetime) },
      activeGrants,
      uniqueClients: clients.filter((row) => row.customerId).length,
      firstSaleAt: firstSale?.paidAt ?? null,
    },
    daily,
    packages,
    payments,
    generatedAt: new Date().toISOString(),
  };
}

/** One CSV row per trend day, plus a totals row. */
function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * CSV export for the performance screen.
 *
 * The file carries the same numbers the screen shows, one trend row per day, so
 * a manager can work in a spreadsheet without re-deriving anything. Amounts are
 * whole shillings as integers — the column header says so.
 */
export async function hotspotPerformanceCsv(hotspotId: string, requestedDays?: number) {
  const report = await hotspotPerformance(hotspotId, requestedDays);
  const slug = report.site?.slug ?? report.hotspot.id;
  const filename = `hotspot-${slug}-${report.window.days}d-${report.generatedAt.slice(0, 10)}.csv`;

  const lines: string[] = [];
  const push = (cells: Array<string | number>) => lines.push(cells.map(csvCell).join(","));

  push(["Hotspot", report.hotspot.name]);
  push(["Site", report.site?.name ?? ""]);
  push(["Owner account", report.site?.owner.businessName ?? ""]);
  push(["Owner email", report.site?.owner.email ?? ""]);
  push(["Window days", report.window.days]);
  push(["From", report.window.from.slice(0, 10)]);
  push(["To", report.window.to.slice(0, 10)]);
  push([]);

  push(["Summary (TZS, whole shillings)", "Orders", "Revenue", "Average order"]);
  push(["Today", report.kpis.today.count, report.kpis.today.amountTzs, report.kpis.today.averageTzs]);
  push(["Last 7 days", report.kpis.week.count, report.kpis.week.amountTzs, report.kpis.week.averageTzs]);
  push(["Last 30 days", report.kpis.month.count, report.kpis.month.amountTzs, report.kpis.month.averageTzs]);
  push(["Lifetime", report.kpis.lifetime.count, report.kpis.lifetime.amountTzs, report.kpis.lifetime.averageTzs]);
  push(["Active grants", report.kpis.activeGrants, "", ""]);
  push(["Unique clients", report.kpis.uniqueClients, "", ""]);
  push([]);

  push(["Daily paid sales", "Day", "Orders", "Revenue"]);
  for (const row of report.daily) push(["", row.day, row.count, row.amountTzs]);
  push([]);

  push(["Package mix", "Package", "Orders", "Revenue"]);
  for (const row of report.packages) push(["", row.package, row.count, row.amountTzs]);
  push([]);

  push(["Payment mix", "State", "Orders", "Amount"]);
  for (const row of report.payments) push(["", row.state, row.count, row.amountTzs]);

  return { filename, csv: `\uFEFF${lines.join("\n")}\n` };
}
