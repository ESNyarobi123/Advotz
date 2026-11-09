"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@heroui/react";
import { PaymentWaitingStage } from "@/components/PaymentWaitingStage";
import { systemActionClass, systemActionStyle } from "@/lib/theme";
import { formatDateTime, formatDuration, formatTzs } from "@advo/api-client";
import { Notice } from "@advo/ui";
import { FieldInput } from "@/components/FieldInput";
import { ConnectedStage } from "@/components/ConnectedStage";
import { PortalFrame } from "@/components/PortalFrame";
import { portalApi, remainingText, useLocale } from "@/lib/portal";
import type { PortalBootstrap } from "@/lib/portal-types";

type OrderStatus = {
  package: { name?: string; durationSeconds?: number };
  amountTzs: string;
  paymentState: string;
  paymentAttempt: { state: string; lastError: string | null } | null;
  fulfillmentState: string;
  access: {
    state: string;
    activatedAt: string | null;
    expiresAt: string | null;
    maxDevices: number;
    /** When a held session opens itself; null once it is live. */
    connectBy?: string | null;
    devices: Array<{ mac: string; state: string }>;
  } | null;
  landingUrl: string | null;
};

const POLL_MS = 3000;
/** Where "Start browsing" lands when the site has no landing page configured. */
const BROWSE_URL = "https://www.google.com";

export function PaymentStatus({
  slug,
  orderToken,
}: {
  slug: string;
  orderToken: string;
}) {
  const { locale, t, toggle, setLocale } = useLocale();
  const router = useRouter();
  const [status, setStatus] = useState<OrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [extras, setExtras] = useState<PortalBootstrap | null>(null);
  const [clockEnded, setClockEnded] = useState(false);
  const [starting, setStarting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const paidAt = useRef<number | null>(null);
  const rechecked = useRef(false);

  // The connected-page extras (businesses, jobs, promotion packages) come from
  // the same bootstrap the landing screen uses; a failure is non-fatal.
  useEffect(() => {
    portalApi
      .get<PortalBootstrap>(`/portal/sites/${encodeURIComponent(slug)}`)
      .then(setExtras)
      .catch(() => setExtras(null));
  }, [slug]);

  const load = useCallback(async () => {
    try {
      const s = await portalApi.get<OrderStatus>(
        `/portal/orders/${encodeURIComponent(orderToken)}`,
      );
      setStatus(s);
      setError(null);
      if (s.paymentState === "PAID" && paidAt.current === null)
        paidAt.current = Date.now();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [orderToken]);

  const terminal =
    status?.access?.state === "ACTIVE" ||
    status?.access?.state === "EXPIRED" ||
    status?.access?.state === "REVOKED" ||
    status?.fulfillmentState === "FAILED" ||
    status?.paymentState === "NEEDS_REVIEW";

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (terminal) return;
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [load, terminal]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const expiresAtMs =
    status?.access?.state === "ACTIVE" && status.access.expiresAt
      ? new Date(status.access.expiresAt).getTime()
      : null;
  const accessEnded = Boolean(
    status?.access && ["EXPIRED", "QUOTA_EXHAUSTED", "REVOKED"].includes(status.access.state),
  );

  /**
   * The Controller deauthorizes the device at this instant (the sweeper enqueues
   * the revoke on the same clock), so the page follows it: a periodic check is
   * used rather than one long timeout, which overflows for 30-day packages.
   */
  useEffect(() => {
    if (expiresAtMs === null) return;
    const check = () => {
      if (Date.now() >= expiresAtMs) setClockEnded(true);
    };
    check();
    const id = setInterval(check, 15_000);
    return () => clearInterval(id);
  }, [expiresAtMs]);

  /**
   * When the package just ended, ask the server once (it owns the expiry
   * decision) and return the guest to the package list so they can buy again.
   * A guest opening an old order later is not bounced — they get the status and
   * a link instead.
   */
  useEffect(() => {
    if (!clockEnded) return;
    if (!rechecked.current) {
      rechecked.current = true;
      void load();
    }
    const id = setTimeout(() => router.replace(`/${slug}`), 8000);
    return () => clearTimeout(id);
  }, [clockEnded, load, router, slug]);

  async function retry(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setRetrying(true);
    setRetryError(null);
    try {
      await portalApi.post(
        `/portal/orders/${encodeURIComponent(orderToken)}/retry`,
        {
          phone: String(f.get("phone") ?? ""),
        },
      );
      await load();
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : String(err));
    } finally {
      setRetrying(false);
    }
  }

  const reference = orderToken.slice(0, 10).toUpperCase();
  const attemptState = status?.paymentAttempt?.state;
  const unpaid = status?.paymentState === "UNPAID";
  const paymentFailed =
    unpaid &&
    (attemptState === "FAILED" ||
      attemptState === "EXPIRED" ||
      attemptState === "VOIDED");
  const activating =
    status?.paymentState === "PAID" &&
    (!status.access || status.access.state === "PENDING_ACTIVATION") &&
    status.fulfillmentState !== "FAILED";
  /**
   * The session is paid for but the device is deliberately not on the network
   * yet, so this page can be read and the Explore menus used before the phone's
   * captive window decides to close itself.
   */
  const held = status?.access?.state === "PENDING_ACTIVATION";

  // A hold is not slowness: the guest asked for the time, so the "still
  // activating" warning only applies after the hold has run out.
  const slowActivation =
    activating && !held && paidAt.current !== null && now - paidAt.current > 45_000;
  const connectSecondsLeft =
    held && status?.access?.connectBy
      ? Math.max(0, Math.ceil((new Date(status.access.connectBy).getTime() - now) / 1000))
      : null;
  const browseUrl = status?.landingUrl ?? BROWSE_URL;

  // Seconds only matter during the hold.
  useEffect(() => {
    if (!held) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [held]);

  async function startBrowsing() {
    setStarting(true);
    setConnectError(null);
    try {
      await portalApi.post(
        `/portal/access/${encodeURIComponent(orderToken)}/activate`,
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

  // Only leave once the Controller has actually let the device on.
  useEffect(() => {
    if (starting && status?.access?.state === "ACTIVE") window.location.assign(browseUrl);
  }, [starting, status?.access?.state, browseUrl]);

  /**
   * The connected stage. While the session is held it renders *above* the
   * receipt card: the button that opens the internet, and the menus it is
   * holding the connection for, must be reachable with one thumb.
   */
  const stage =
    extras && status && status.access && (status.access.state === "ACTIVE" || held) ? (
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
        landingUrl={browseUrl}
        listings={extras.listings}
        promotionPackages={extras.promotionPackages}
        session={{
          packageName: status.package.name ?? null,
          expiresAt: status.access.expiresAt,
          devices: status.access.devices.length,
          maxDevices: status.access.maxDevices,
          durationSeconds: status.package.durationSeconds ?? null,
        }}
        sessionLabel={status.package.name ?? null}
        showHeader={false}
        siteTitle={extras.site.title}
        slug={slug}
        theme={extras.site.theme}
      />
    ) : null;

  // A failed or ended activation has nothing left to wait for.
  useEffect(() => {
    if (starting && status?.access && ["ACTIVATION_FAILED", "EXPIRED", "REVOKED"].includes(status.access.state))
      setStarting(false);
  }, [starting, status?.access]);

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
      {error && !status ? <Notice tone="danger">{error}</Notice> : null}
      {held ? <div className="mt-2">{stage}</div> : null}
      {status && unpaid && !paymentFailed ? (
        <PaymentWaitingStage
          amount={formatTzs(status.amountTzs)}
          duration={
            status.package.durationSeconds
              ? formatDuration(status.package.durationSeconds, locale)
              : null
          }
          packageName={status.package.name ?? t("accessStatus")}
          reference={reference}
        />
      ) : null}
      {status && !(unpaid && !paymentFailed) ? (
        <Card>
          <p className="font-semibold">
            {status.package.name} · {formatTzs(status.amountTzs)}
          </p>
          {status.package.durationSeconds ? (
            <p className="text-sm text-[var(--advo-muted)]">
              {t("duration")}:{" "}
              {formatDuration(status.package.durationSeconds, locale)}
            </p>
          ) : null}
          <div className="mt-4 space-y-3">
            {paymentFailed ? (
              <>
                <Notice tone="danger">
                  {t("paymentFailed")} {status.paymentAttempt?.lastError ?? ""}
                </Notice>
                {/* Retrying needs the number again and nothing else: the first
                    attempt already told the provider who is paying, and the
                    account holder's name comes back with the payment rather
                    than from a form. */}
                <form onSubmit={retry} className="space-y-3">
                  <FieldInput
                    id="phone"
                    name="phone"
                    label={t("mobileMoneyNumber")}
                    inputMode="tel"
                    required
                  />
                  {retryError ? (
                    <Notice tone="danger">{retryError}</Notice>
                  ) : null}
                  <button className={systemActionClass} disabled={retrying} style={systemActionStyle} type="submit">
                    {retrying ? t("sending") : t("tryAgain")}
                  </button>
                </form>
              </>
            ) : null}
            {activating ? (
              <Notice tone={slowActivation ? "warning" : "accent"}>
                {slowActivation
                  ? t("paymentReceivedActivating")
                  : t("portal.holdStatus")}
              </Notice>
            ) : null}
            {status.access?.state === "ACTIVE" ? (
              <>
                <Notice tone="success">{t("wifiReady")}</Notice>
                <p className="text-3xl font-bold">
                  {remainingText(status.access.expiresAt, now)}
                </p>
                <p className="text-sm text-[var(--advo-muted)]">
                  {t("expiresAt")}:{" "}
                  {formatDateTime(
                    status.access.expiresAt,
                    locale === "sw" ? "sw-TZ" : "en-GB",
                  )}
                </p>
                {status.landingUrl ? (
                  <a className={`${systemActionClass} no-underline`} href={status.landingUrl} style={systemActionStyle}>
                    {t("continueBrowsing")}
                  </a>
                ) : null}
              </>
            ) : null}
            {status.fulfillmentState === "FAILED" ||
            status.access?.state === "ACTIVATION_FAILED" ? (
              <Notice tone="danger">{t("activationFailed")}</Notice>
            ) : null}
            {status.paymentState === "NEEDS_REVIEW" ||
            status.fulfillmentState === "NEEDS_REVIEW" ? (
              <Notice tone="warning">{t("needsReview")}</Notice>
            ) : null}
            {status.access && (accessEnded || clockEnded) ? (
              <>
                <Notice tone="accent">
                  {clockEnded ? t("sessionEndedReturn") : t("accessEnded")}
                </Notice>
                <a
                  className={`${systemActionClass} no-underline`}
                  href={`/${slug}`}
                  style={systemActionStyle}
                >
                  {t("buyAgain")}
                </a>
              </>
            ) : null}
          </div>
        </Card>
      ) : null}
      {!status && !error ? <Notice tone="accent">{t("paymentPending")}</Notice> : null}

      {!held ? <div className="mt-4">{stage}</div> : null}

      {status && unpaid && !paymentFailed ? null : (
      <Card className="mt-4">
        <p className="text-sm">
          {t("reference")}: <strong className="font-mono">{reference}</strong>
        </p>
        <p className="mt-1 text-xs text-[var(--advo-muted)]">
          {t("keepReference")}
        </p>
        <p className="mt-1 text-xs text-[var(--advo-muted)]">{t("support")}</p>
        {status?.paymentState === "PAID" ? (
          <p className="mt-2 text-sm">
            <Link
              href={`/${slug}/status?token=${encodeURIComponent(orderToken)}`}
              className="font-semibold text-[var(--advo-blue)] underline"
            >
              {t("connectThisDevice")}
            </Link>
          </p>
        ) : null}
      </Card>
      )}
    </PortalFrame>
  );
}
