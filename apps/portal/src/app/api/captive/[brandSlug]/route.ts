import { NextResponse, type NextRequest } from "next/server";

const API =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000";

/** RFC 8908 answers must never be cached: they change the moment a guest pays. */
const CAPTIVE_JSON = {
  "content-type": "application/captive+json",
  "cache-control": "no-store, max-age=0",
} as const;

/** The phone's address on the WiFi, when the proxy in front of us knows it. */
function forwardedClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return request.headers.get("x-real-ip");
}

/**
 * RFC 8908 Captive Portal API, served from the portal's own origin.
 *
 * Keeping it here rather than on a separate API host means the URL advertised
 * as DHCP option 114 uses the same certificate and hostname as the login page,
 * so a gateway only has to allow-list one destination before the guest pays.
 *
 * A router that can substitute client variables should call
 * `/api/captive/<slug>?mac=$(mac)` (RouterOS) or `?ip=<client ip>`; otherwise
 * the backend falls back to the most recent portal context from the source IP.
 */
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ brandSlug: string }> },
) {
  const { brandSlug } = await params;
  const incoming = request.nextUrl.searchParams;

  const query = new URLSearchParams();
  const mac = incoming.get("mac");
  const ip = incoming.get("ip") ?? forwardedClientIp(request);
  if (mac) query.set("mac", mac);
  if (ip) query.set("ip", ip);

  try {
    const res = await fetch(
      `${API}/api/v1/portal/captive/${encodeURIComponent(brandSlug)}?${query.toString()}`,
      { cache: "no-store", headers: { accept: "application/captive+json" } },
    );
    return new NextResponse(await res.text(), {
      status: res.status,
      headers: CAPTIVE_JSON,
    });
  } catch {
    // A captive API that cannot be read leaves the phone captive. That is the
    // honest answer, and it is also the only one a guest can act on. The URL
    // must be absolute (RFC 8908), so use the configured origin when present.
    const origin = (
      process.env.NEXT_PUBLIC_PORTAL_URL ?? request.nextUrl.origin
    ).replace(/\/$/, "");
    return new NextResponse(
      JSON.stringify({
        captive: true,
        "user-portal-url": `${origin}/${brandSlug}`,
      }),
      { status: 200, headers: CAPTIVE_JSON },
    );
  }
}
