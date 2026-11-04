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
  /** When a held session opens itself; null once it is live. */
  connectBy?: string | null;
  package: { name?: string; durationSeconds?: number };
  devices: Array<{ mac: string; state: string }>;
};

/** Where "Start browsing" lands once the device is online. */
const BROWSE_URL = "https://www.google.com";

export default function StatusPage() {
  const { brandSlug } = useParams<{ brandSlug: string }>();
  const { locale, t, toggle, setLocale } = useLocale();
  const [token, setToken] = useState<string | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  /** The guest tapped "Start browsing": poll fast and leave once the device is on. */
  const [starting, setStarting] = useState(false);
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

  /** True while the paid session waits for the guest (or for the hold to expire). */
  const held = access?.state === "PENDING_ACTIVATION";

  useEffect(() => {
    void load();
    // A guest who has just tapped "Start browsing" is waiting on the Controller,
    // so poll tightly; otherwise this is a background tab and can be slow.
    const poll = setInterval(() => void load(), starting ? 2_000 : 10_000);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load, starting]);

  // Seconds are only shown during the hold, and only then does a 1s tick matter.
  useEffect(() => {
    if (!held) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [held]);

  /** The session opened: leave the captive page the guest asked to leave. */
  useEffect(() => {
    if (starting && access?.state === "ACTIVE") window.location.assign(BROWSE_URL);
  }, [starting, access?.state]);

  // A failed or ended activation has nothing left to wait for.
  useEffect(() => {
    if (starting && access && ["ACTIVATION_FAILED", "EXPIRED", "REVOKED"].includes(access.state))
      setStarting(false);
  }, [starting, access]);

  async function startBrowsing() {
    if (!token) return;
    setStarting(true);
    setConnectError(null);
    try {
      await portalApi.post(
        `/portal/access/${encodeURIComponent(token)}/activate`,
        {},
      );
      await load();
    } catch (err) {
      setStarting(false);
      setConnectError(
        err instanceof Error && err.message ? err.message : t("portal.connectFailed"),
      );
    }
  }

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

  /** Countdown to the automatic connect, shown on the connected page. */
  const connectSecondsLeft =
    held && access?.connectBy
      ? Math.max(0, Math.ceil((new Date(access.connectBy).getTime() - now) / 1000))
      : null;

  /**
   * The menus a guest came for. They are the reason the session is held at all,
   * so while the hold is on this goes *above* the receipt card: the button that
   * opens the internet has to be the first thing a thumb reaches.
   */
  const stage =
    extras && access && (access.state === "ACTIVE" || held) ? (
      <ConnectedStage
        business={extras.site.business}
        businesses={extras.site.content?.businesses ?? []}
        config={extras.config}
        connection={
          held
            ? {
                state: starting ? "connecting" : "held",
                secondsLeft: connectSecondsLeft,
                onStart: () => void startBrowsing(),
                error: connectError,
              }
            : null
        }
        experienceOnly={false}
        landingUrl={BROWSE_URL}
        listings={extras.listings}
        promotionPackages={extras.promotionPackages}
        reopenUrl={token ? `/${brandSlug}/status?token=${encodeURIComponent(token)}` : null}
        session={{
          packageName: access.package.name ?? null,
          expiresAt: access.expiresAt,
          devices: access.devices.length,
          maxDevices: access.maxDevices,
        }}
        sessionLabel={access.package.name ?? null}
        showHeader
        siteTitle={extras.site.title}
        slug={brandSlug}
        theme={extras.site.theme}
      />
    ) : null;

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
      {held ? <div className="mt-4">{stage}</div> : null}
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
              <Notice tone="accent">{t("portal.holdStatus")}</Notice>
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
      {!held ? <div className="mt-4">{stage}</div> : null}
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
            /* The session card is part of the design the reseller is
               approving, so the preview has to show one. It is drawn from the
               preview clock on purpose: there is no paid order behind this
               frame, and the note above says so. */
            session={{
              packageName: extras.packages[0]?.name ?? null,
              expiresAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
              devices: 1,
              maxDevices: 2,
            }}
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
