"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Card, Modal, Skeleton, useOverlayState } from "@heroui/react";
import { SoftIcon, type IconTone } from "@advo/ui";

/**
 * Shared money-screen furniture.
 *
 * The payments and withdrawals screens are two views of the same ledger, so the
 * colour vocabulary, the distribution cards and the detail dialogs live here
 * instead of being re-declared per screen. Two copies of a tone map is how
 * "FAILED" ends up red on one page and amber on the other, which trains an
 * operator to stop trusting the colour.
 */

/**
 * Colour family for a state, so a bar reads at a glance.
 *
 * "progress" is deliberately its own tone: a record still with the provider is
 * not a problem, and painting it amber would train operators to ignore amber.
 * "warn" is reserved for states that genuinely want a human.
 */
export type StateTone = "good" | "progress" | "warn" | "bad" | "neutral";

/** Every payment, order, webhook and payout state, mapped once. */
export const STATE_TONE: Record<string, StateTone> = {
  // Terminal success.
  COMPLETED: "good",
  PROCESSED: "good",
  PAID: "good",
  // Still moving under its own steam.
  CREATED: "progress",
  DISPATCHING: "progress",
  PENDING: "progress",
  PROCESSING: "progress",
  RECEIVED: "progress",
  APPROVED: "progress",
  // Waiting on a human, or a truth we do not have yet.
  REQUESTED: "warn",
  UNKNOWN: "warn",
  NEEDS_REVIEW: "warn",
  QUARANTINED: "warn",
  REFUND_PENDING: "warn",
  OVERPAID: "warn",
  // Bad outcomes that moved (or lost) money.
  FAILED: "bad",
  REVERSED: "bad",
  EXPIRED: "bad",
  VOIDED: "bad",
  // Deliberate ends that are nobody's fault.
  REJECTED: "neutral",
  IGNORED: "neutral",
  UNPAID: "neutral",
  CANCELLED: "neutral",
  REFUNDED: "neutral",
};

export const TONE_BAR: Record<StateTone, string> = {
  good: "bg-emerald-500",
  progress: "bg-advo-blue",
  warn: "bg-amber-500",
  bad: "bg-red-500",
  neutral: "bg-slate-400",
};

/** `StatusChip` tone for a state, so the pill agrees with the bar. */
export const CHIP_TONE: Record<string, "success" | "warning" | "danger" | "accent" | "default"> = {
  COMPLETED: "success",
  PROCESSED: "success",
  PAID: "success",
  CREATED: "accent",
  DISPATCHING: "accent",
  PENDING: "accent",
  PROCESSING: "accent",
  RECEIVED: "accent",
  APPROVED: "accent",
  REQUESTED: "warning",
  UNKNOWN: "warning",
  NEEDS_REVIEW: "warning",
  QUARANTINED: "warning",
  REFUND_PENDING: "warning",
  OVERPAID: "warning",
  FAILED: "danger",
  REVERSED: "danger",
  EXPIRED: "danger",
  VOIDED: "danger",
  REJECTED: "default",
  IGNORED: "default",
  UNPAID: "default",
  CANCELLED: "default",
  REFUNDED: "default",
};

export const toneOf = (state: string): StateTone => STATE_TONE[state] ?? "neutral";

export const chipToneOf = (state: string) => CHIP_TONE[state] ?? "default";

/**
 * URL-backed filter so a filtered view is shareable and survives a reload —
 * the contract every operational screen here uses.
 */
export function useUrlFilter(key: string) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = params.get(key) ?? "";
  const set = (next: string) => {
    const q = new URLSearchParams(params.toString());
    if (next) q.set(key, next);
    else q.delete(key);
    router.replace(`${pathname}${q.size ? `?${q}` : ""}`, { scroll: false });
  };
  return [value, set] as const;
}

/** Small tinted pill used in the hero meta row. */
export function HeroChip({
  children,
  icon,
  tone = "muted",
}: {
  children: ReactNode;
  icon?: ReactNode;
  tone?: "muted" | "success" | "danger";
}) {
  const style =
    tone === "success"
      ? "bg-advo-success-soft text-emerald-700"
      : tone === "danger"
        ? "bg-advo-danger-soft text-[#b91c1c]"
        : "border border-[var(--advo-border)] bg-white/70 text-advo-muted";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums ${style}`}>
      {icon}
      {children}
    </span>
  );
}

/**
 * One box card: a labelled count per bucket with a proportional bar.
 *
 * Bars are scaled against the largest bucket rather than the total, so a card
 * with one dominant state still shows its smaller buckets instead of collapsing
 * them into an invisible sliver. When `onPick` is given each row becomes a
 * filter shortcut for the table below, which is how an operator jumps straight
 * from "3 needs review" to those three rows.
 */
export function DistributionCard({
  title,
  hint,
  icon,
  iconTone,
  rows,
  totalLabel,
  empty,
  onPick,
  pickedState,
  formatCount,
}: {
  title: string;
  hint: string;
  icon: ReactNode;
  iconTone: IconTone;
  rows: Array<{ state: string; count: number; label: string; tone: StateTone; meta?: string }>;
  totalLabel: string;
  empty: string;
  onPick?: (state: string) => void;
  pickedState?: string;
  /**
   * Renders the right-hand number. Defaults to the raw count because most cards
   * count rows; a card whose bucket is a sum of money passes a formatter so it
   * reads "TZS 14,950" instead of an unformatted "14950".
   */
  formatCount?: (count: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card className="gap-3 p-4 shadow-advo-card ring-1 ring-advo-border/70">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <SoftIcon size="sm" tone={iconTone}>
            {icon}
          </SoftIcon>
          <div className="min-w-0">
            <p className="text-sm font-bold text-advo-text">{title}</p>
            <p className="mt-0.5 text-xs text-advo-muted">{hint}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-advo-blue-soft px-2 py-0.5 text-[11px] font-bold text-advo-blue tabular-nums">
          {totalLabel}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="py-2 text-xs text-advo-muted">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const picked = pickedState === row.state;
            const inner = (
              <>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-1.5 text-advo-text">
                    <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${TONE_BAR[row.tone]}`} />
                    <span className="truncate">{row.label}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    {row.meta ? (
                      <span className="mr-1.5 text-[10px] font-semibold text-advo-muted tabular-nums">{row.meta}</span>
                    ) : null}
                    <span className="font-bold text-advo-text tabular-nums">
                      {formatCount ? formatCount(row.count) : row.count}
                    </span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <span
                    className={`block h-full rounded-full ${TONE_BAR[row.tone]}`}
                    style={{ width: `${Math.max(4, (row.count / max) * 100)}%` }}
                  />
                </div>
              </>
            );
            return (
              <li key={row.state}>
                {onPick ? (
                  <button
                    aria-pressed={picked}
                    className={`w-full rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-slate-50 ${
                      picked ? "bg-advo-blue-soft/60 ring-1 ring-advo-blue/30" : ""
                    }`}
                    onClick={() => onPick(row.state)}
                    type="button"
                  >
                    {inner}
                  </button>
                ) : (
                  <div className="px-1.5 py-1">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** HeroUI modal plumbing shared by the money dialogs, so overlay state is never hand-rolled. */
export function DialogShell({
  open,
  onClose,
  children,
  size = "lg",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: "md" | "lg" | "cover";
}) {
  const overlay = useOverlayState({ isOpen: open, onOpenChange: (next) => (!next ? onClose() : undefined) });
  return (
    <Modal.Root state={overlay}>
      <Modal.Backdrop>
        <Modal.Container size={size}>
          <Modal.Dialog className="bg-white">
            {children}
            <Modal.CloseTrigger aria-label="Close" />
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}

/** Label/value line used inside the detail dialogs. */
export function DetailRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--advo-border)]/60 py-2 last:border-0">
      <span className="shrink-0 text-xs font-semibold text-advo-muted">{label}</span>
      <span className="min-w-0 text-right text-xs text-advo-text">{value}</span>
    </div>
  );
}

/** Heading used to split a detail dialog into identity / money / timeline. */
export function DetailSection({ children }: { children: ReactNode }) {
  return <p className="mb-1 text-[11px] font-bold tracking-wider text-advo-muted uppercase">{children}</p>;
}

export function KpiSkeleton() {
  return (
    <Card className="gap-3 p-4 shadow-advo-card ring-1 ring-advo-border/70">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-16" />
      <Skeleton className="h-3 w-32" />
    </Card>
  );
}

export function CardSkeleton() {
  return (
    <Card className="gap-3 p-4 shadow-advo-card ring-1 ring-advo-border/70">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-2 w-5/6" />
      <Skeleton className="h-2 w-2/3" />
    </Card>
  );
}
