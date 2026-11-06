import { NextResponse, type NextRequest } from "next/server";

const API = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Behind the proxy the request origin is the container's own bind address, so
 * the public host has to come from configuration.
 */
const PUBLIC_ORIGIN = (process.env.NEXT_PUBLIC_PORTAL_URL ?? process.env.PORTAL_PUBLIC_URL ?? "").replace(/\/$/, "");

/** Public origin when configuration is absent: trust the proxy's forwarded headers. */
function publicOrigin(request: NextRequest): string {
  if (PUBLIC_ORIGIN) return PUBLIC_ORIGIN;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return request.nextUrl.origin;
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

/**
 * Omada's captive-portal entry is `/portal/entry?cid=…&ap=…&ssid=…&clientIp=…&t=…&rid=…&u=…`.
 * The Controller never learns our slug, so the AP MAC is resolved to a site and
 * the guest is forwarded to `/<slug>` with the parameters renamed to the ones
 * the portal page already understands.
 */
const PARAM_MAP: Record<string, string> = {
  cid: "clientMac",
  clientMac: "clientMac",
  ap: "apMac",
  apMac: "apMac",
  ssid: "ssidName",
  ssidName: "ssidName",
  clientIp: "clientIp",
  gw: "gatewayMac",
  gatewayMac: "gatewayMac",
  rid: "radioId",
  radioId: "radioId",
  vid: "vid",
  site: "site",
  u: "redirectUrl",
  redirectUrl: "redirectUrl",
  t: "t",
};

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const incoming = request.nextUrl.searchParams;
  const apMac = incoming.get("ap") ?? incoming.get("apMac");
  const ssid = incoming.get("ssid") ?? incoming.get("ssidName");

  const lookup = new URLSearchParams();
  if (apMac) lookup.set("ap", apMac);
  if (ssid) lookup.set("ssid", ssid);

  let slug: string | null = null;
  try {
    const res = await fetch(`${API}/api/v1/portal/resolve?${lookup.toString()}`, { cache: "no-store" });
    if (res.ok) slug = ((await res.json()) as { slug?: string }).slug ?? null;
  } catch {
    slug = null;
  }

  if (!slug) {
    return NextResponse.json({ error: "This WiFi location is not set up yet." }, { status: 404 });
  }

  const origin = publicOrigin(request);
  const target = new URL(`/${slug}`, origin);
  for (const [from, to] of Object.entries(PARAM_MAP)) {
    const value = incoming.get(from);
    if (value && !target.searchParams.has(to)) target.searchParams.set(to, value);
  }
  return NextResponse.redirect(target, 302);
}
