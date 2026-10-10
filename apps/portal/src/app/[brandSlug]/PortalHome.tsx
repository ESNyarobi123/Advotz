"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "@advo/api-client";
import { Button } from "@heroui/react";
import { Notice } from "@advo/ui";
import { HomeBanner } from "@/components/HomeBanner";
import { PackagesStage } from "@/components/PackagesStage";
import { PortalFrame } from "@/components/PortalFrame";
import { CONTEXT_PARAMS, loadContext, newIdempotencyKey, portalApi, saveContext, useLocale } from "@/lib/portal";
import type { PortalBootstrap } from "@/lib/portal-types";

export type { PortalBootstrap, PortalPackage } from "@/lib/portal-types";

/**
 * Why the bootstrap could not be loaded.
 *
 * - `NONE` — loaded.
 * - `NOT_FOUND` — no such WiFi location; a permanent answer.
 * - `UNAVAILABLE` — the API failed or timed out; temporary, so offer a retry.
 */
export type PortalLoadFailure = "NONE" | "NOT_FOUND" | "UNAVAILABLE";

/**
 * Guest portal shell. Runs the guest journey from the moment they join the WiFi:
 *   1. Choose a package and pay with mobile money — the landing screen
 *   2. (the payment screen itself, in `/[brandSlug]/payment/[orderToken]`)
 *   3. The connected session
 *
 * There is deliberately no separate welcome screen: a guest who has just joined
 * a WiFi network wants a price, not an introduction, and every extra tap before
 * the packages is a tap where a sale is lost. The promotional surfaces that used
 * to live on that screen ride on the package screen instead.
 *
 * Stage 3 (connected) lives on the payment/status pages once payment is
 * confirmed, so a returning guest recovers their session from a deep link.
 */
export function PortalHome({
  slug,
  bootstrap,
  failure = "NONE",
  redirectParams,
}: {
  slug: string;
  bootstrap: PortalBootstrap | null;
  failure?: PortalLoadFailure;
  redirectParams: Record<string, string>;
}) {
  const router = useRouter();
  const { t, toggle, locale, setLocale } = useLocale();
  const [contextToken, setContextToken] = useState<string | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const idempotencyKey = useRef<string>("");
  const started = useRef(false);
  const [lastOrder, setLastOrder] = useState<string | null>(null);

  /**
   * The designer's embed, marked by `?preview=1` on the iframe's URL.
   *
   * A reseller cannot be on their own WiFi, so the embed can never carry the
   * controller's `clientMac` and can never mint a context. Without this flag the
   * package list renders with no way to buy from it, which is the right answer
   * for a guest who opened the URL directly and a dead end for the person
   * checking their own design.
   *
   * The flag therefore relaxes exactly one thing: it lets the real payment dialog
   * open so the design can be checked. It deliberately does **not** invent a
   * context token. `pay()` still refuses, so a preview cannot create an order —
   * a fabricated token would take real money against a made-up device MAC, which
   * is money taken for a service nobody receives. The flag is also safe in a
   * guest's hands: it can only switch buying *off*, never on, so it grants
   * nothing.
   */
  const preview = redirectParams.preview === "1";

  const siteLocale = bootstrap?.site.defaultLocale ?? bootstrap?.config?.branding.defaultLocale;
  useEffect(() => {
    if (siteLocale) {
      setLocale(siteLocale);
    }
  }, [siteLocale, setLocale]);

  useEffect(() => {
    setLastOrder(localStorage.getItem(`advo:last-order:${slug}`));
  }, [slug]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // The preview never mints a context: there is no real client here, and the
    // dialog below is not allowed to transact anyway.
    if (preview) return;
    const params = Object.fromEntries(CONTEXT_PARAMS.filter((k) => redirectParams[k]).map((k) => [k, redirectParams[k]]));
    if (!params.clientMac) {
      setContextToken(loadContext(slug));
      return;
    }
    portalApi
      .post<{ contextToken: string; expiresInSeconds: number }>(`/portal/sites/${encodeURIComponent(slug)}/context`, params)
      .then((res) => {
        saveContext(slug, res.contextToken, res.expiresInSeconds);
        setContextToken(res.contextToken);
        // Drop MACs and redirect parameters from the visible URL once stored server-side.
        window.history.replaceState(null, "", `/${slug}`);
      })
      .catch((err: unknown) => setContextError(err instanceof Error ? err.message : String(err)));
  }, [preview, slug, redirectParams]);

  async function pay(packageId: string, form: { phone: string }) {
    // Belt and braces on the money path: the dialog's button is already disabled
    // in preview, but a form can also be submitted with the keyboard.
    if (preview || !contextToken || pending) return;
    if (!idempotencyKey.current) idempotencyKey.current = newIdempotencyKey("po");
    setPending(true);
    setError(null);
    try {
      const res = await portalApi.post<{ orderToken: string }>("/portal/orders", {
        contextToken,
        packageId,
        phone: form.phone,
        idempotencyKey: idempotencyKey.current,
      });
      localStorage.setItem(`advo:last-order:${slug}`, res.orderToken);
      router.push(`/${slug}/payment/${res.orderToken}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "PORTAL_CONTEXT_EXPIRED") setError(t("contextExpired"));
      else setError(err instanceof Error ? err.message : String(err));
      idempotencyKey.current = "";
    } finally {
      setPending(false);
    }
  }

  const theme = bootstrap?.site.theme;
  const config = bootstrap?.config ?? null;

  if (!bootstrap) {
    // A missing location is permanent; a failed fetch is not. Neither may be
    // papered over with invented permissions or prices.
    return (
      <PortalFrame languageLabel={t("language")} locale={locale} onSelectLanguage={setLocale} onToggleLanguage={toggle} theme={theme} title={t("brand")}>
        {failure === "NOT_FOUND" ? (
          <Notice tone="warning">{t("notAvailable")}</Notice>
        ) : (
          <>
            <Notice tone="warning">{t("portal.loadFailed")}</Notice>
            <div className="mt-4 flex justify-center">
              <Button onPress={() => window.location.reload()} size="lg" type="button" variant="primary">
                {t("portal.retry")}
              </Button>
            </div>
          </>
        )}
      </PortalFrame>
    );
  }

  return (
    <PortalFrame
      backgroundUrl={bootstrap.site.backgroundUrl}
      banner={
        <HomeBanner
          campaigns={bootstrap.campaigns}
          config={config}
          content={bootstrap.site.content}
          isPreview={preview}
        />
      }
      business={bootstrap.site.business}
      languageLabel={t("language")}
      locale={locale}
      logoUrl={bootstrap.site.logoUrl}
      onSelectLanguage={setLocale}
      onToggleLanguage={toggle}
      showPlatformBadge={config?.branding.showPlatformBadge ?? true}
      theme={theme}
      title={bootstrap.site.title}
    >
      {!bootstrap.available ? <Notice tone="warning">{t("notAvailable")}</Notice> : null}
      {contextError ? <Notice tone="danger">{contextError}</Notice> : null}

      <PackagesStage
        campaigns={bootstrap.campaigns}
        config={config}
        content={bootstrap.site.content}
        contextToken={contextToken}
        error={error}
        isPreview={preview}
        message={bootstrap.site.message}
        onSubmit={(packageId, form) => void pay(packageId, form)}
        packageCardLayout={bootstrap.packageCardLayout}
        packageCardStyle={bootstrap.packageCardStyle}
        packages={bootstrap.packages}
        payBlock={preview ? "preview" : !contextToken || !bootstrap.available ? "no-context" : "none"}
        pending={pending}
        slug={slug}
        theme={theme}
      />

      {bootstrap.available && lastOrder ? (
        <p className="mt-6 text-center text-sm">
          <Link className="text-[var(--advo-blue)] underline" href={`/${slug}/status?token=${encodeURIComponent(lastOrder)}`}>
            {t("accessStatus")}
          </Link>
        </p>
      ) : null}
    </PortalFrame>
  );
}
