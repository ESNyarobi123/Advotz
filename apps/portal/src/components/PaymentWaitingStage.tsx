"use client";

import { Notice } from "@advo/ui";
import { useLocale } from "@/lib/portal";

/**
 * The screen a guest sees after tapping pay, while the phone prompt is out.
 *
 * Colours are the platform combo. A reseller theme does not repaint this wait.
 */
export function PaymentWaitingStage({
  packageName,
  amount,
  duration,
  reference,
}: {
  packageName: string;
  amount: string;
  duration?: string | null;
  reference: string;
}) {
  const { t } = useLocale();

  return (
    <section aria-label={t("paymentPending")} className="space-y-3">
      <div className="rounded-2xl border border-[var(--advo-border)] bg-[var(--advo-card-brand)] p-4 text-[var(--advo-text-brand)] shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--advo-muted)]">
          {t("portal.youAreBuying")}
        </p>
        <div className="mt-1 flex items-start justify-between gap-3">
          <p className="min-w-0 truncate text-base font-black">{packageName}</p>
          <strong className="shrink-0 text-lg font-black text-[var(--advo-orange)]">{amount}</strong>
        </div>
        {duration ? <p className="mt-1 text-xs text-[var(--advo-muted)]">{duration}</p> : null}
        <div className="mt-4 space-y-3">
          <Notice tone="accent">{t("confirmPaymentPrompt")}</Notice>
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--advo-charcoal)]">
            <span
              aria-hidden
              className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--advo-gold)] border-t-transparent"
            />
            {t("paymentPending")}
          </p>
        </div>
      </div>
      <div className="rounded-2xl border border-[var(--advo-border)] bg-[var(--advo-card-brand)] p-4 text-sm text-[var(--advo-text-brand)]">
        <p>
          {t("reference")}: <strong className="font-mono">{reference}</strong>
        </p>
        <p className="mt-1 text-xs text-[var(--advo-muted)]">{t("keepReference")}</p>
      </div>
    </section>
  );
}
