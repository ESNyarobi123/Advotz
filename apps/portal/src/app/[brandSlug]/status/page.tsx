"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button, Card } from "@heroui/react";
import { ApiError, formatDateTime, formatDuration } from "@advo/api-client";
import { Notice } from "@advo/ui";
import { ConnectedStage } from "@/components/ConnectedStage";
import { PortalFrame } from "@/components/PortalFrame";
import { loadContext, portalApi, remainingText, useLocale } from "@/lib/portal";
import type { PortalBootstrap } from "@/lib/portal-types";

type Access = {
  state: string;
  activatedAt: string | null;
  expiresAt: string | null;
  maxDevices: number;
  package: { name?: string; durationSeconds?: number };
  devices: Array<{ mac: string; state: string }>;
};

export default function StatusPage() {
  const { brandSlug } = useParams<{ brandSlug: string }>();
  const { locale, t, toggle, setLocale } = useLocale();
  const [token, setToken] = useState<string | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [contextToken, setContextToken] = useState<string | null>(null);
  const [extras, setExtras] = useState<PortalBootstrap | null>(null);
  const [now, setNow] = useState(() => Date.now());
  /** `?preview=1` — the reseller's designer is showing this screen in a frame. */
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setPreview(params.get("preview") === "1");
    const fromUrl = params.get("token");
    setToken(fromUrl ?? localStorage.getItem(`advo:last-order:${brandSlug}`));
    setContextToken(loadContext(brandSlug));
  }, [brandSlug]);

  // The connected-page extras (businesses, jobs, promotion packages) come from
  // the same bootstrap the landing screen uses; a failure is non-fatal.
  useEffect(() => {
    portalApi
      .get<PortalBootstrap>(`/portal/sites/${encodeURIComponent(brandSlug)}`)
      .then(setExtras)
      .catch(() => setExtras(null));
  }, [brandSlug]);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setAccess(
        await portalApi.get<Access>(
          `/portal/access/${encodeURIComponent(token)}`,
        ),
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [token]);

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), 10_000);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  async function join() {
    if (!token || !contextToken) return;
    setJoining(true);
    setJoinError(null);
    try {
      await portalApi.post("/portal/access/join", {
        contextToken,
        recoveryToken: token,
      });
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.code === "DEVICE_LIMIT_REACHED")
        setJoinError(t("deviceLimit"));
      else if (err instanceof ApiError && err.code === "PORTAL_CONTEXT_EXPIRED")
        setJoinError(t("contextExpired"));
      else setJoinError(err instanceof Error ? err.message : String(err));
    } finally {
      setJoining(false);
    }
  }

  const active =
    access?.state === "ACTIVE" || access?.state === "PENDING_ACTIVATION";

  return (
    <PortalFrame
      backgroundUrl={extras?.site.backgroundUrl}
      languageLabel={t("language")}
      locale={locale}
      onSelectLanguage={setLocale}
      onToggleLanguage={toggle}
      theme={extras?.site.theme}
      title={t("accessStatus")}
    >
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {access ? (
        <Card>
          <p className="font-semibold">{access.package.name}</p>
          {access.package.durationSeconds ? (
            <p className="text-sm text-[var(--advo-muted)]">
              {t("duration")}:{" "}
              {formatDuration(access.package.durationSeconds, locale)}
            </p>
          ) : null}
          <div className="mt-3 space-y-2">
            {access.state === "ACTIVE" ? (
              <>
                <Notice tone="success">{t("wifiReady")}</Notice>
                <p className="text-sm text-[var(--advo-muted)]">
                  {t("remaining")}
                </p>
                <p className="text-3xl font-bold">
                  {remainingText(access.expiresAt, now)}
                </p>
                <p className="text-sm text-[var(--advo-muted)]">
                  {t("expiresAt")}:{" "}
                  {formatDateTime(
                    access.expiresAt,
                    locale === "sw" ? "sw-TZ" : "en-GB",
                  )}
                </p>
              </>
            ) : access.state === "PENDING_ACTIVATION" ? (
              <Notice tone="accent">{t("paymentReceivedConnecting")}</Notice>
            ) : access.state === "ACTIVATION_FAILED" ? (
              <Notice tone="danger">{t("activationFailed")}</Notice>
            ) : (
              <Notice tone="accent">{t("accessEnded")}</Notice>
            )}
            <p className="text-sm">
              {t("devices")}: {access.devices.length} / {access.maxDevices}
            </p>
            <ul className="text-xs text-[var(--advo-muted)]">
              {access.devices.map((d) => (
                <li key={d.mac}>
                  {d.mac} · {d.state.toLowerCase()}
                </li>
              ))}
            </ul>
          </div>
          {active && contextToken ? (
            <div className="mt-4 space-y-2">
              {joinError ? <Notice tone="danger">{joinError}</Notice> : null}
              <Button
                fullWidth
                isDisabled={joining}
                onPress={() => void join()}
                size="lg"
                variant="outline"
              >
                {joining ? t("sending") : t("connectThisDevice")}
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}
      {access?.state === "ACTIVE" && extras ? (
        <div className="mt-4">
          <ConnectedStage
            business={extras.site.business}
            businesses={extras.site.content?.businesses ?? []}
            config={extras.config}
            experienceOnly={false}
            landingUrl="https://www.google.com"
            listings={extras.listings}
            promotionPackages={extras.promotionPackages}
            sessionLabel={access.package.name ?? null}
            showHeader
            siteTitle={extras.site.title}
            slug={brandSlug}
            theme={extras.site.theme}
          />
        </div>
      ) : null}
      {/*
        The designer's "Connected" frame. Without a paid order there is no access
        row to read, so the screen used to render as a bare "Access status"
        heading and the reseller had no way to see the connected experience they
        were designing. This shows the same `ConnectedStage` a paying guest gets,
        drawn from this site's real businesses, jobs and promotion packages, and
        says plainly that it is a preview so it is never mistaken for a live
        session.
      */}
      {!access && preview && extras ? (
        <div className="mt-4 space-y-3">
          <Notice tone="accent">{t("portal.previewNote")}</Notice>
          <ConnectedStage
            business={extras.site.business}
            businesses={extras.site.content?.businesses ?? []}
            config={extras.config}
            experienceOnly={false}
            landingUrl="https://www.google.com"
            listings={extras.listings}
            promotionPackages={extras.promotionPackages}
            sessionLabel={
              extras.packages[0]?.name
                ? `${extras.packages[0].name} (Preview)`
                : "3 Hours Unlimited (Preview)"
            }
            showHeader
            siteTitle={extras.site.title}
            slug={brandSlug}
            theme={extras.site.theme}
          />
        </div>
      ) : null}
      {token ? (
        <p className="mt-4 text-center text-xs text-[var(--advo-muted)]">
          {t("reference")}:{" "}
          <span className="font-mono">{token.slice(0, 10).toUpperCase()}</span>{" "}
          · {t("keepReference")}
        </p>
      ) : null}
      <p className="mt-6 text-center text-sm">
        <Link
          href={`/${brandSlug}`}
          className="text-[var(--advo-blue)] underline"
        >
          {t("back")}
        </Link>
      </p>
    </PortalFrame>
  );
}
