"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "@advo/api-client";
import { Notice } from "@advo/ui";
import { PackagesStage } from "@/components/PackagesStage";
import { PortalFrame } from "@/components/PortalFrame";
import { PortalStepper, type PortalStage } from "@/components/PortalStepper";
import { WelcomeStage } from "@/components/WelcomeStage";
import { CONTEXT_PARAMS, loadContext, newIdempotencyKey, portalApi, saveContext, useLocale } from "@/lib/portal";
import type { PortalBootstrap } from "@/lib/portal-types";

export type { PortalBootstrap, PortalPackage } from "@/lib/portal-types";

/**
 * Guest portal shell. Runs the first two stages of the Kimara journey:
 *   1. Welcome (advert carousel + benefits + Connect now)
 *   2. Choose a package and pay with mobile money
 * Stage 3 (connected) lives on the payment/status pages once payment is
 * confirmed, so a returning guest recovers their session from a deep link.
 */
export function PortalHome({ slug, bootstrap, redirectParams }: { slug: string; bootstrap: PortalBootstrap | null; redirectParams: Record<string, string> }) {
  const router = useRouter();
  const { t, toggle } = useLocale();
  const [stage, setStage] = useState<PortalStage>(1);
  const [contextToken, setContextToken] = useState<string | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const idempotencyKey = useRef<string>("");
  const started = useRef(false);
  const [lastOrder, setLastOrder] = useState<string | null>(null);

  useEffect(() => {
    setLastOrder(localStorage.getItem(`advo:last-order:${slug}`));
  }, [slug]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
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
  }, [slug, redirectParams]);

  async function pay(packageId: string, form: { phone: string; firstName: string; lastName: string; email: string }) {
    if (!contextToken || pending) return;
    if (!idempotencyKey.current) idempotencyKey.current = newIdempotencyKey("po");
    setPending(true);
    setError(null);
    try {
      const res = await portalApi.post<{ orderToken: string }>("/portal/orders", {
        contextToken,
        packageId,
        phone: form.phone,
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
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

  if (!bootstrap) {
    return (
      <PortalFrame languageLabel={t("language")} onToggleLanguage={toggle} theme={theme} title={t("brand")}>
        <Notice tone="warning">{t("notAvailable")}</Notice>
      </PortalFrame>
    );
  }

  return (
    <PortalFrame
      business={bootstrap.site.business}
      languageLabel={t("language")}
      onToggleLanguage={toggle}
      theme={theme}
      title={bootstrap.site.title}
    >
      {bootstrap.site.message ? <p className="mb-4 text-sm">{bootstrap.site.message}</p> : null}
      {!bootstrap.available ? <Notice tone="warning">{t("notAvailable")}</Notice> : null}
      {contextError ? <Notice tone="danger">{contextError}</Notice> : null}
      {bootstrap.available && !contextToken && !contextError ? <Notice tone="accent">{t("openFromWifi")}</Notice> : null}

      <PortalStepper onNavigate={(next) => setStage(next)} stage={stage} />

      {stage === 1 ? (
        <WelcomeStage onConnect={() => bootstrap.available && setStage(2)} site={bootstrap.site} />
      ) : (
        <PackagesStage
          disabled={!contextToken || !bootstrap.available}
          error={error}
          onBack={() => {
            setStage(1);
            setError(null);
          }}
          onSubmit={(packageId, form) => void pay(packageId, form)}
          packages={bootstrap.packages}
          pending={pending}
          theme={theme}
        />
      )}

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
