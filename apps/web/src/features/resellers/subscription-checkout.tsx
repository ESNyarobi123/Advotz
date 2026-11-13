"use client";

import { useEffect, useRef, useState } from "react";
import { formatDateTime, formatTzs } from "@advo/api-client";
import { Button, Modal, useOverlayState } from "@heroui/react";
import { Notice } from "@advo/ui";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { Field } from "@/features/common/components";
import { api, newIdempotencyKey } from "@/lib/api";
import { formValues, useAction } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { SubscriptionInvoice } from "./subscription-history";
import type { ResellerPlan } from "./subscription-plan-drawer";

export type PendingCheckout = { key: string; invoiceId?: string };

function failedAttempt(state: string) {
  return state === "FAILED" || state === "EXPIRED" || state === "VOIDED";
}

type CheckoutStage = "form" | "waiting" | "success" | "failed" | "review";

export function SubscriptionCheckoutDialog({
  plan,
  currentPeriodEnd,
  isRenewal,
  onClose,
  onUpdate,
  pendingCheckout,
  onCheckout,
  onComplete,
  user,
}: {
  plan: ResellerPlan;
  currentPeriodEnd: string | null;
  isRenewal: boolean;
  onClose: () => void;
  onUpdate: () => void;
  pendingCheckout: PendingCheckout | undefined;
  onCheckout: (checkout: PendingCheckout) => void;
  onComplete: () => void;
  user: { name: string; email: string };
}) {
  const { t, locale } = useI18n();
  const dateLocale = locale === "sw" ? "sw-TZ" : "en-GB";
  const overlay = useOverlayState({
    isOpen: true,
    onOpenChange: (next) => (next ? undefined : onClose()),
  });
  const [stage, setStage] = useState<CheckoutStage>(() =>
    pendingCheckout?.invoiceId ? "waiting" : "form",
  );
  const [invoiceId, setInvoiceId] = useState<string | null>(
    pendingCheckout?.invoiceId ?? null,
  );
  const [failure, setFailure] = useState<string | null>(null);
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);
  const [idempotencyKey] = useState(
    () => pendingCheckout?.key ?? newIdempotencyKey("sub"),
  );
  const [first, ...rest] = user.name.split(" ");

  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onCheckoutRef = useRef(onCheckout);
  onCheckoutRef.current = onCheckout;

  const checkout = useAction(async (form: HTMLFormElement) => {
    const values = formValues(form);
    onCheckout({ key: idempotencyKey });
    const result = await api.post<{
      invoiceId: string;
      payment: { state: string; lastError: string | null };
    }>("/reseller/subscription/checkout", {
      planId: plan.id,
      phone: values.phone,
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      idempotencyKey,
    });
    setInvoiceId(result.invoiceId);
    onCheckout({ key: idempotencyKey, invoiceId: result.invoiceId });
    onUpdateRef.current();
    if (result.payment.state === "NEEDS_REVIEW") {
      setStage("review");
      return;
    }
    if (failedAttempt(result.payment.state)) {
      onCheckout({ key: idempotencyKey });
      setFailure(result.payment.lastError ?? null);
      setStage("failed");
      return;
    }
    setStage("waiting");
  });

  /**
   * Poll the invoice, not the clock: the provider confirms asynchronously, so the
   * success screen is only shown once the invoice itself is PAID.
   */
  useEffect(() => {
    if (stage !== "waiting" || !invoiceId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const check = async () => {
      try {
        const invoice = await api.get<SubscriptionInvoice>(
          `/reseller/subscription/invoices/${invoiceId}`,
        );
        if (cancelled) return;
        if (invoice.status === "PAID") {
          setPeriodEnd(invoice.periodEnd);
          setStage("success");
          onCompleteRef.current();
          onUpdateRef.current();
          return;
        }
        if (
          invoice.paymentState === "PAID" ||
          invoice.paymentState === "OVERPAID"
        ) {
          timer = setTimeout(() => void check(), 3000);
          return;
        }
        const state = invoice.payment?.state ?? "";
        if (
          invoice.paymentState === "NEEDS_REVIEW" ||
          state === "NEEDS_REVIEW"
        ) {
          setStage("review");
          onUpdateRef.current();
          return;
        }
        if (invoice.status === "VOID" || failedAttempt(state)) {
          setFailure(invoice.payment?.lastError ?? null);
          setStage("failed");
          onCheckoutRef.current({ key: idempotencyKey });
          onUpdateRef.current();
          return;
        }
      } catch {
        // A dropped poll is not a failed payment; the next tick asks again.
      }
      if (!cancelled) timer = setTimeout(() => void check(), 3000);
    };

    void check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [stage, invoiceId, idempotencyKey]);

  const reference = (invoiceId ?? "").slice(0, 13).toUpperCase();

  return (
    <Modal.Root state={overlay}>
      <Modal.Backdrop
        isDismissable={!checkout.pending}
        isKeyboardDismissDisabled={checkout.pending}
      >
        <Modal.Container size="lg">
          <Modal.Dialog
            className="max-h-[90dvh] overflow-y-auto bg-advo-card p-0"
            aria-label={t("reseller.subscription.checkout.eyebrow")}
          >
            <div className="relative overflow-hidden bg-linear-to-br from-[#1d2a3a] to-[#17202c] px-5 pt-6 pb-5 text-white">
              <span
                aria-hidden
                className="pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full bg-white/10 blur-2xl"
              />
              <div className="relative flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold tracking-[0.16em] text-white/60 uppercase">
                    {t("reseller.subscription.checkout.eyebrow")}
                  </p>
                  <Modal.Heading className="mt-1 text-xl font-bold tracking-tight">
                    {plan.name}
                  </Modal.Heading>
                  <p className="mt-0.5 text-xs text-white/70">
                    {t("reseller.subscription.checkout.period", {
                      days: plan.periodDays,
                    })}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-2xl font-black tracking-tight tabular-nums">
                    {formatTzs(plan.priceTzs)}
                  </p>
                  <p className="text-[10px] font-semibold text-white/60">
                    {t("reseller.subscription.checkout.amountNote")}
                  </p>
                </div>
              </div>
            </div>

            <Modal.Body className="px-5 pb-5">
              {stage === "form" ? (
                <form
                  className="grid gap-3 pt-4 sm:grid-cols-2 [&_input]:w-full [&_label]:mb-1.5 [&_label]:block"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void checkout.run(event.currentTarget);
                  }}
                >
                  <Field
                    defaultValue={first}
                    label={t("reseller.subscription.checkout.firstName")}
                    name="firstName"
                    required
                  />
                  <Field
                    defaultValue={rest.join(" ") || first}
                    label={t("reseller.subscription.checkout.lastName")}
                    name="lastName"
                    required
                  />
                  <Field
                    label={t("reseller.subscription.checkout.phone")}
                    name="phone"
                    placeholder="0712 345 678"
                    type="tel"
                    required
                  />
                  <Field
                    defaultValue={user.email}
                    label={t("reseller.subscription.checkout.email")}
                    name="email"
                    required
                    type="email"
                  />
                  <p className="rounded-xl border border-advo-border bg-advo-page px-3 py-2.5 text-sm leading-relaxed text-advo-muted sm:col-span-2">
                    {currentPeriodEnd
                      ? t(
                          isRenewal
                            ? "reseller.subscription.checkout.renewalTerms"
                            : "reseller.subscription.checkout.changeTerms",
                          { days: plan.periodDays },
                        )
                      : t("reseller.subscription.checkout.startTerms")}
                  </p>
                  {checkout.error ? (
                    <div className="sm:col-span-2">
                      <Notice tone="danger">{checkout.error}</Notice>
                    </div>
                  ) : null}
                  <div className="flex flex-col-reverse gap-2 pt-1 sm:col-span-2 sm:flex-row sm:justify-end">
                    <Button
                      isDisabled={checkout.pending}
                      onPress={onClose}
                      type="button"
                      variant="ghost"
                    >
                      {t("reseller.subscription.checkout.cancel")}
                    </Button>
                    <Button
                      isDisabled={checkout.pending}
                      type="submit"
                      variant="primary"
                    >
                      <Smartphone className="size-4" />
                      {checkout.pending
                        ? t("reseller.subscription.checkout.pending")
                        : t("reseller.subscription.checkout.submit")}
                    </Button>
                  </div>
                </form>
              ) : null}

              {stage === "waiting" ? (
                <div className="pt-6 text-center">
                  <div className="relative mx-auto grid size-24 place-items-center">
                    <span
                      aria-hidden
                      className="absolute inset-0 motion-safe:animate-ping rounded-full bg-advo-blue/15"
                    />
                    <span
                      aria-hidden
                      className="absolute inset-3 motion-safe:animate-ping rounded-full bg-advo-blue/20 [animation-delay:400ms]"
                    />
                    <span className="relative grid size-16 place-items-center rounded-full bg-gradient-to-br from-advo-blue to-[#0b2a63] text-white shadow-lg">
                      <Smartphone className="size-7" />
                    </span>
                  </div>
                  <h3 className="mt-5 text-base font-black text-advo-text">
                    {t("reseller.subscription.checkout.waitingTitle")}
                  </h3>
                  <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-advo-muted">
                    {t("reseller.subscription.checkout.waitingBody")}
                  </p>

                  <div className="mx-auto mt-4 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-advo-page">
                    <div className="advo-checkout-sweep h-full w-1/3 rounded-full bg-gradient-to-r from-advo-gold to-advo-orange motion-reduce:animate-none" />
                  </div>

                  <dl className="mx-auto mt-5 grid max-w-sm grid-cols-2 gap-2 text-left">
                    <div className="rounded-xl border border-advo-border/70 bg-advo-page/60 px-3 py-2">
                      <dt className="text-[9px] font-bold tracking-wider text-advo-muted uppercase">
                        {t("reseller.subscription.checkout.summaryPlan")}
                      </dt>
                      <dd className="mt-0.5 truncate text-xs font-bold text-advo-text">
                        {plan.name}
                      </dd>
                    </div>
                    <div className="rounded-xl border border-advo-border/70 bg-advo-page/60 px-3 py-2">
                      <dt className="text-[9px] font-bold tracking-wider text-advo-muted uppercase">
                        {t("reseller.subscription.checkout.summaryAmount")}
                      </dt>
                      <dd className="mt-0.5 text-xs font-bold text-advo-text tabular-nums">
                        {formatTzs(plan.priceTzs)}
                      </dd>
                    </div>
                    {reference ? (
                      <div className="col-span-2 rounded-xl border border-advo-border/70 bg-advo-page/60 px-3 py-2">
                        <dt className="text-[9px] font-bold tracking-wider text-advo-muted uppercase">
                          {t("reseller.subscription.checkout.summaryReference")}
                        </dt>
                        <dd className="mt-0.5 font-mono text-xs font-bold text-advo-text">
                          {reference}
                        </dd>
                      </div>
                    ) : null}
                  </dl>

                  <p className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-semibold text-advo-muted">
                    <Clock className="size-3" />
                    {t("reseller.subscription.checkout.waitingHint")}
                  </p>

                  <div className="mt-5 flex justify-center">
                    <Button onPress={onClose} type="button" variant="ghost">
                      {t("reseller.subscription.checkout.waitingClose")}
                    </Button>
                  </div>
                </div>
              ) : null}

              {stage === "success" ? (
                <div className="pt-6 text-center">
                  <div className="relative mx-auto grid size-24 place-items-center">
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-full bg-emerald-100"
                    />
                    <span
                      aria-hidden
                      className="advo-checkout-ring absolute inset-0 rounded-full ring-4 ring-emerald-300/70"
                    />
                    <span className="advo-checkout-pop relative grid size-16 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg">
                      <CheckCircle2 className="size-8" />
                    </span>
                  </div>
                  <h3 className="mt-5 text-lg font-black text-advo-text">
                    {t("reseller.subscription.checkout.successTitle")}
                  </h3>
                  <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-advo-muted">
                    {t("reseller.subscription.checkout.successBody", {
                      plan: plan.name,
                    })}
                  </p>

                  {periodEnd ? (
                    <p className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700">
                      <Sparkles className="size-3" />
                      {t("reseller.subscription.checkout.successUntil", {
                        when: formatDateTime(periodEnd, dateLocale),
                      })}
                    </p>
                  ) : null}

                  <div className="mt-6">
                    <Button
                      className="w-full"
                      onPress={onClose}
                      type="button"
                      variant="primary"
                    >
                      {t("reseller.subscription.checkout.successCta")}
                    </Button>
                  </div>
                </div>
              ) : null}

              {stage === "review" ? (
                <div className="space-y-3 pt-5">
                  <Notice tone="warning">
                    {t("reseller.subscription.checkout.review")}
                  </Notice>
                  <Button onPress={onClose} type="button" variant="ghost">
                    {t("reseller.subscription.checkout.waitingClose")}
                  </Button>
                </div>
              ) : null}

              {stage === "failed" ? (
                <div className="pt-6 text-center">
                  <div className="mx-auto grid size-16 place-items-center rounded-full bg-rose-50 text-rose-600">
                    <AlertTriangle className="size-7" />
                  </div>
                  <h3 className="mt-4 text-base font-black text-advo-text">
                    {t("reseller.subscription.checkout.failedTitle")}
                  </h3>
                  <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-advo-muted">
                    {failure
                      ? t("reseller.subscription.checkout.failedBody", {
                          error: failure,
                        })
                      : t("reseller.subscription.checkout.failedBodyGeneric")}
                  </p>
                  <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
                    <Button onPress={onClose} type="button" variant="ghost">
                      {t("reseller.subscription.checkout.cancel")}
                    </Button>
                    <Button
                      onPress={() => {
                        setFailure(null);
                        setStage("form");
                      }}
                      type="button"
                      variant="primary"
                    >
                      {t("reseller.subscription.checkout.retry")}
                    </Button>
                  </div>
                </div>
              ) : null}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}
