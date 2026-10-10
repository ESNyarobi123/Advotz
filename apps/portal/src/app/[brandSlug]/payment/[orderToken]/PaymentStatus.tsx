"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card } from "@heroui/react";
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
    devices: Array<{ mac: string; state: string }>;
  } | null;
  landingUrl: string | null;
};

const POLL_MS = 3000;

export function PaymentStatus({
  slug,
  orderToken,
}: {
  slug: string;
  orderToken: string;
}) {
  const { locale, t, toggle, setLocale } = useLocale();
  const [status, setStatus] = useState<OrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [extras, setExtras] = useState<PortalBootstrap | null>(null);
  const paidAt = useRef<number | null>(null);

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
  const slowActivation =
    activating && paidAt.current !== null && now - paidAt.current > 45_000;

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
      {status ? (
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
            {unpaid && !paymentFailed ? (
              <>
                <Notice tone="accent">{t("confirmPaymentPrompt")}</Notice>
                <p className="flex items-center gap-2 text-sm text-[var(--advo-muted)]">
                  <span
                    className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--advo-blue)] border-t-transparent"
                    aria-hidden
                  />
                  {t("paymentPending")}
                </p>
              </>
            ) : null}
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
                  <Button
                    fullWidth
                    isDisabled={retrying}
                    size="lg"
                    type="submit"
                    variant="primary"
                  >
                    {retrying ? t("sending") : t("tryAgain")}
                  </Button>
                </form>
              </>
            ) : null}
            {activating ? (
              <Notice tone={slowActivation ? "warning" : "accent"}>
                {slowActivation
                  ? t("paymentReceivedActivating")
                  : t("paymentReceivedConnecting")}
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
                  <a href={status.landingUrl} className="block">
                    <Button fullWidth size="lg" variant="primary">
                      {t("continueBrowsing")}
                    </Button>
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
            {status.access &&
            ["EXPIRED", "REVOKED", "QUOTA_EXHAUSTED"].includes(
              status.access.state,
            ) ? (
              <Notice tone="accent">{t("accessEnded")}</Notice>
            ) : null}
          </div>
        </Card>
      ) : !error ? (
        <Notice tone="accent">{t("paymentPending")}</Notice>
      ) : null}

      {status?.access?.state === "ACTIVE" && extras ? (
        <div className="mt-4">
          <ConnectedStage
            business={extras.site.business}
            businesses={extras.site.content?.businesses ?? []}
            config={extras.config}
            experienceOnly={false}
            landingUrl={status.landingUrl}
            listings={extras.listings}
            promotionPackages={extras.promotionPackages}
            sessionLabel={status.package.name ?? null}
            showHeader={false}
            siteTitle={extras.site.title}
            slug={slug}
            theme={extras.site.theme}
          />
        </div>
      ) : null}

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
    </PortalFrame>
  );
}
