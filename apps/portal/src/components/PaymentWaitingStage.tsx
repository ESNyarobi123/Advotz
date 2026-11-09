"use client";

import { useLocale } from "@/lib/portal";

/**
 * The screen a guest sees after tapping pay, while the phone prompt is out.
 *
 * It is a dialog rather than a page section on purpose: the guest has just
 * committed money and the only thing that matters is whether the wallet asked
 * them for a PIN. A centred card with a dimmed page behind it says "one thing is
 * happening" without hiding the amount or the reference, and the page underneath
 * is still polled by the caller, so the card disappears the moment payment lands.
 *
 * Colours are the platform combo. A reseller theme does not repaint this wait.
 */
export function PaymentWaitingStage({
  packageName,
  amount,
  duration,
  reference,
  contained = false,
}: {
  packageName: string;
  amount: string;
  duration?: string | null;
  reference: string;
  /** Draw the dialog inside its parent (the design board) instead of the window. */
  contained?: boolean;
}) {
  const { t } = useLocale();

  return (
    <div
      aria-label={t("paymentPending")}
      aria-modal="true"
      className={`${contained ? "absolute" : "fixed"} inset-0 z-50 grid place-items-center bg-[#04122b]/78 p-4 backdrop-blur-[3px]`}
      role="dialog"
    >
      <div className="advo-wait-in w-full max-w-[366px] overflow-hidden rounded-[26px] bg-[var(--advo-card-brand)] shadow-[0_34px_90px_-24px_rgba(2,12,32,0.75)]">
        {/* Receipt head: what is being paid, stated once, at full weight. */}
        <div
          className="relative overflow-hidden px-5 pt-5 pb-4 text-white"
          style={{ background: "linear-gradient(135deg, #0b2a63 0%, #172d43 100%)" }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -top-14 -right-10 size-36 rounded-full bg-white/10 blur-2xl"
          />
          <div className="relative">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">
              {t("portal.youAreBuying")}
            </p>
            <div className="mt-1 flex items-end justify-between gap-3">
              <p className="min-w-0 truncate text-base font-black leading-tight">{packageName}</p>
              <strong className="shrink-0 text-2xl font-black leading-none tabular-nums text-[var(--advo-gold)]">
                {amount}
              </strong>
            </div>
            {duration ? <p className="mt-1 text-[11px] font-semibold text-white/60">{duration}</p> : null}
          </div>
        </div>

        <div className="px-5 pb-5 pt-6 text-center">
          {/* Three rings, each a beat behind the last: it reads as "still going"
              without a progress number we cannot honestly produce. */}
          <div className="relative mx-auto grid size-28 place-items-center">
            <span aria-hidden className="advo-wait-ring absolute inset-0 rounded-full border-2 border-[#12459e]/40" />
            <span
              aria-hidden
              className="advo-wait-ring advo-wait-ring--second absolute inset-3 rounded-full border-2 border-[#12459e]/50"
            />
            <span
              aria-hidden
              className="advo-wait-ring advo-wait-ring--third absolute inset-6 rounded-full border-2 border-[#12459e]/60"
            />
            <span
              className="relative grid size-16 place-items-center rounded-full text-white shadow-lg"
              style={{ background: "linear-gradient(135deg, #12459e 0%, #0b2a63 100%)" }}
            >
              <span aria-hidden className="text-2xl">📲</span>
            </span>
          </div>

          <h2 className="mt-5 text-lg font-black leading-tight text-[var(--advo-text-brand)]">
            {t("portal.waitTitle")}
            <span aria-hidden className="advo-wait-dots ml-0.5 inline-block">
              …
            </span>
          </h2>
          <p className="mx-auto mt-1.5 max-w-[290px] text-[12px] leading-relaxed text-[var(--advo-muted)]">
            {t("portal.waitBody")}
          </p>

          <div className="mx-auto mt-4 h-1.5 w-full max-w-[240px] overflow-hidden rounded-full bg-black/10">
            <div
              className="advo-wait-sweep h-full w-1/3 rounded-full"
              style={{ background: "var(--advo-gradient-gold)" }}
            />
          </div>

          <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-[var(--advo-border)] bg-[var(--advo-page)] px-3 py-2 text-left">
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--advo-muted)]">
                {t("reference")}
              </p>
              <p className="truncate font-mono text-[12px] font-bold text-[var(--advo-text-brand)]">{reference}</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#fdf3d8] px-2 py-1 text-[10px] font-bold text-[#8a5a00]">
              <span
                aria-hidden
                className="size-2 animate-pulse rounded-full bg-[var(--advo-gold)]"
              />
              {t("portal.waitKeepOpen")}
            </span>
          </div>

          <p className="mt-3 text-[10px] font-medium leading-snug text-[var(--advo-muted)]">
            {t("keepReference")}
          </p>
        </div>
      </div>
    </div>
  );
}
