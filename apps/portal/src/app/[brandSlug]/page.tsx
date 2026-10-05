import { PortalHome, type PortalBootstrap } from "./PortalHome";

export const dynamic = "force-dynamic";

const API = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function loadBootstrap(slug: string): Promise<PortalBootstrap | null> {
  try {
    const res = await fetch(`${API}/api/v1/portal/sites/${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as PortalBootstrap;
  } catch {
    return null;
  }
}

export default async function PortalBrandPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ brandSlug }, query] = await Promise.all([params, searchParams]);
  const bootstrap = await loadBootstrap(brandSlug);
  const redirectParams = Object.fromEntries(Object.entries(query).filter((e): e is [string, string] => typeof e[1] === "string"));
  return <PortalHome slug={brandSlug} bootstrap={bootstrap} redirectParams={redirectParams} />;
}
