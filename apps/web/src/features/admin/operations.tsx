"use client";

import { useMemo, useState, type ReactNode } from "react";
import { formatDateTime } from "@advo/api-client";
import type { Locale, MessageKey, Translator } from "@advo/i18n";
import { Button, Card, Input } from "@heroui/react";
import { AdvoKpi, AdvoTable, ICON_TONES, SoftIcon, StatusChip, type IconTone } from "@advo/ui";
import {
  Activity,
  Banknote,
  Bell,
  Building2,
  CircleCheck,
  Clock,
  CreditCard,
  Filter,
  Inbox,
  KeyRound,
  Layers,
  ListChecks,
  Network,
  Radio,
  Receipt,
  RefreshCw,
  Repeat,
  ShieldCheck,
  TriangleAlert,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { PageHero, ResourceView, SectionHeader } from "@/features/common/components";
import { api, errorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useResource } from "@/lib/hooks";

/**
 * Mirrors `MAX_ATTEMPTS` in `packages/backend/src/modules/outbox/outbox.dispatcher.ts`.
 * The API exposes the count of events past this cap but not the cap itself, so the
 * retry meter needs the number locally to draw "3 of 12".
 */
const MAX_ATTEMPTS = 12;

/* ─────────────────────────────────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────────────────────────────────── */

type OutboxRow = {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string;
  createdAt: string;
};

/** The two manual recovery passes this page can trigger. */
type RecoveryAction = "drain" | "sweep";

type RunRecord = { action: RecoveryAction; at: number; data: Record<string, unknown> };

/* ─────────────────────────────────────────────────────────────────────────
 * Derivation
 * ───────────────────────────────────────────────────────────────────────── */

/** An event is dead when the worker gave up and stamped the reason with `DEAD:`. */
const isDead = (row: OutboxRow) => Boolean(row.lastError?.startsWith("DEAD:"));

/** Strips the worker's `DEAD:` marker so the cell shows the cause, not the flag. */
const errorText = (row: OutboxRow) => (row.lastError ?? "").replace(/^DEAD:\s*/, "");

function summarise(rows: OutboxRow[]) {
  const dead = rows.filter(isDead);
  const pending = rows.length - dead.length;
  const oldest = rows.reduce<OutboxRow | null>(
    (acc, row) => (!acc || new Date(row.createdAt) < new Date(acc.createdAt) ? row : acc),
    null,
  );
  return {
    total: rows.length,
    pending,
    dead: dead.length,
    oldest,
    maxAttempts: rows.reduce((max, row) => Math.max(max, row.attempts), 0),
    /** Queue depth per retry band, for the pressure read-out. */
    retrying: rows.filter((row) => row.attempts > 0 && !isDead(row)).length,
  };
}

const DURATION_UNITS = [
  { unit: "day" as const, ms: 86_400_000 },
  { unit: "hour" as const, ms: 3_600_000 },
  { unit: "minute" as const, ms: 60_000 },
];

/** Locale-aware "3 hours" / "saa 3" style span, used for waits and backoffs. */
function formatDuration(ms: number, locale: Locale): string {
  const abs = Math.max(0, ms);
  const match = DURATION_UNITS.find(({ ms: size }) => abs >= size);
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: match?.unit ?? "second",
    unitDisplay: "long",
    maximumFractionDigits: 0,
  }).format(Math.floor(abs / (match?.ms ?? 1000)));
}

/** Picks a tinted icon for an event type's domain so the column scans by colour. */
function eventIcon(eventType: string, tone: IconTone) {
  const [domain] = eventType.split(".");
  const glyph =
    domain === "payment" || domain === "order"
      ? <Banknote />
      : domain === "payout" || domain === "withdrawal"
        ? <Wallet />
        : domain === "grant"
          ? <KeyRound />
          : domain === "subscription"
            ? <CreditCard />
            : domain === "site"
              ? <Network />
              : domain === "reseller"
                ? <Building2 />
                : domain === "notification"
                  ? <Bell />
                  : <Activity />;
  return <SoftIcon size="sm" tone={tone}>{glyph}</SoftIcon>;
}

/** Colour family for an event type's domain icon. */
function eventTone(eventType: string): IconTone {
  const [domain] = eventType.split(".");
  if (domain === "payment" || domain === "order") return "accent";
  if (domain === "payout" || domain === "withdrawal") return "gold";
  if (domain === "grant") return "teal";
  if (domain === "subscription") return "violet";
  if (domain === "notification") return "warning";
  return "success";
}

/* ─────────────────────────────────────────────────────────────────────────
 * Screen
 * ───────────────────────────────────────────────────────────────────────── */

export function AdminOperationsScreen() {
  const { t, locale } = useI18n();
  const outbox = useResource<OutboxRow[]>("/admin/outbox");
  const [run, setRun] = useState<RunRecord | null>(null);

  const loaded = outbox.data !== undefined;
  const rows = outbox.data ?? [];
  const stats = useMemo(() => summarise(rows), [rows]);

  function record(action: RecoveryAction) {
    return async () => {
      const endpoint =
        action === "drain" ? "/admin/operations/drain-outbox" : "/admin/operations/run-sweepers";
      const data = (await api.post(endpoint)) as Record<string, unknown>;
      setRun({ action, at: Date.now(), data });
      await outbox.reload();
    };
  }

  /** Health pill copy: honest about "still loading" rather than claiming healthy. */
  const health = !loaded
    ? { label: t("admin.operations.meta.paused"), tone: "neutral" as const }
    : stats.total === 0
      ? { label: t("admin.operations.meta.healthy"), tone: "success" as const }
      : {
          label:
            stats.total === 1
              ? t("admin.operations.meta.attentionOne")
              : t("admin.operations.meta.attention", { count: stats.total }),
          tone: stats.dead > 0 ? ("danger" as const) : ("warning" as const),
        };

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-4">
      {/* ── Hero ── */}
      <PageHero
        actions={
          <>
            <Button
              aria-label={t("admin.operations.action.refresh")}
              isIconOnly
              onPress={() => void outbox.reload()}
              size="sm"
              variant="outline"
            >
              <RefreshCw className={outbox.loading ? "size-3.5 animate-spin text-advo-blue" : "size-3.5"} />
            </Button>
            <RecoveryButton
              icon={<Zap className="size-3.5" />}
              label={t("admin.operations.action.drain")}
              onRun={record("drain")}
              pendingLabel={t("admin.operations.action.draining")}
              variant="primary"
            />
            <RecoveryButton
              icon={<Radio className="size-3.5" />}
              label={t("admin.operations.action.sweep")}
              onRun={record("sweep")}
              pendingLabel={t("admin.operations.action.sweeping")}
              variant="outline"
            />
          </>
        }
        description={t("admin.operations.description")}
        eyebrow={t("admin.operations.eyebrow")}
        icon={<Activity />}
        iconTone="accent"
        meta={
          <>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                health.tone === "success"
                  ? "bg-advo-success-soft text-[#166534]"
                  : health.tone === "danger"
                    ? "bg-advo-danger-soft text-[#b91c1c]"
                    : health.tone === "warning"
                      ? "bg-advo-warning-soft text-[#b45309]"
                      : "bg-advo-surface-soft text-advo-muted"
              }`}
            >
              <span className={`size-1.5 rounded-full ${healthDot(health.tone)}`} />
              {health.label}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--advo-border)] bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-advo-muted">
              <ShieldCheck className="size-3" />
              {t("admin.operations.meta.idempotent")}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--advo-border)] bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-advo-muted">
              <Clock className="size-3" />
              {t("admin.operations.meta.cadence")}
            </span>
          </>
        }
        title={t("admin.operations.title")}
      />

      {/* ── KPI row ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdvoKpi
          hint={
            stats.pending === 0
              ? t("admin.operations.kpi.pendingHintNone")
              : t("admin.operations.kpi.pendingHint")
          }
          icon={<Inbox />}
          iconTone={stats.pending > 0 ? "accent" : "success"}
          label={t("admin.operations.kpi.pending")}
          value={stats.pending}
        />
        <AdvoKpi
          hint={
            stats.dead === 0
              ? t("admin.operations.kpi.deadHintNone")
              : t("admin.operations.kpi.deadHint", { max: MAX_ATTEMPTS })
          }
          icon={<TriangleAlert />}
          iconTone={stats.dead > 0 ? "danger" : "success"}
          label={t("admin.operations.kpi.dead")}
          value={stats.dead}
        />
        <AdvoKpi
          hint={
            stats.oldest
              ? t("admin.operations.kpi.oldestHint", { when: formatDateTime(stats.oldest.createdAt) })
              : t("admin.operations.kpi.oldestHintNone")
          }
          icon={<Clock />}
          iconTone="warning"
          label={t("admin.operations.kpi.oldest")}
          value={
            stats.oldest
              ? formatDuration(Date.now() - new Date(stats.oldest.createdAt).getTime(), locale)
              : t("admin.operations.kpi.oldestValueNone")
          }
        />
        <AdvoKpi
          hint={
            stats.total === 0
              ? t("admin.operations.kpi.pressureHintNone")
              : t("admin.operations.kpi.pressureHint", { max: MAX_ATTEMPTS })
          }
          icon={<Repeat />}
          iconTone={stats.maxAttempts >= MAX_ATTEMPTS ? "danger" : "violet"}
          label={t("admin.operations.kpi.pressure")}
          value={`${stats.maxAttempts} / ${MAX_ATTEMPTS}`}
        />
      </div>

      {/* ── Last recovery run ── */}
      <Card className="gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70">
        <SectionHeader
          action={
            run ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--advo-border)] bg-advo-page px-2.5 py-1 text-[11px] font-semibold text-advo-muted">
                <Clock className="size-3" />
                {t("admin.operations.outcome.ranAt", { when: formatDateTime(new Date(run.at).toISOString()) })}
              </span>
            ) : null
          }
          description={t("admin.operations.outcome.description")}
          icon={<ListChecks />}
          iconTone={run ? "success" : "accent"}
          title={t("admin.operations.outcome.title")}
        />
        {run ? (
          <>
            <div className="flex items-center gap-2">
              <StatusChip tone="accent">
                {run.action === "drain"
                  ? t("admin.operations.outcome.action.drain")
                  : t("admin.operations.outcome.action.sweep")}
              </StatusChip>
            </div>
            <RunReport action={run.action} data={run.data} />
            <p className="flex items-start gap-2 rounded-xl bg-advo-success-soft px-3 py-2.5 text-[11px] font-semibold text-[#166534]">
              <ShieldCheck className="mt-px size-3.5 shrink-0" />
              {t("admin.operations.outcome.note")}
            </p>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--advo-border)] bg-advo-page/50 px-4 py-7 text-center">
            <SoftIcon tone="accent" size="lg">
              <Zap />
            </SoftIcon>
            <p className="text-sm font-bold text-advo-text">{t("admin.operations.outcome.empty")}</p>
            <p className="max-w-xl text-xs text-advo-muted">{t("admin.operations.outcome.emptyHint")}</p>
          </div>
        )}
      </Card>

      {/* ── Outbox table ── */}
      <ResourceView resource={outbox}>
        {(rows) => {
          const s = summarise(rows);
          return (
            <Card className="gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70">
              <SectionHeader
                action={
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-advo-surface-soft px-2.5 py-1 text-[11px] font-bold text-advo-muted">
                    {rows.length}
                  </span>
                }
                description={t("admin.operations.table.description")}
                icon={<Inbox />}
                iconTone={s.dead > 0 ? "danger" : s.total > 0 ? "warning" : "success"}
                title={t("admin.operations.table.title")}
              />
              <AdvoTable
                columns={[
                  {
                    key: "event",
                    header: t("admin.operations.col.event"),
                    isRowHeader: true,
                    render: (row) => (
                      <span className="flex items-center gap-2.5">
                        {eventIcon(row.eventType, eventTone(row.eventType))}
                        <span className="truncate font-mono text-[11px] font-bold text-advo-text">
                          {row.eventType}
                        </span>
                      </span>
                    ),
                  },
                  {
                    key: "aggregate",
                    header: t("admin.operations.col.aggregate"),
                    render: (row) => (
                      <span className="flex flex-col">
                        <span className="text-xs font-semibold text-advo-text">{row.aggregateType}</span>
                        <span className="font-mono text-[10px] text-advo-muted" title={row.aggregateId}>
                          #{row.aggregateId.slice(0, 8)}
                        </span>
                      </span>
                    ),
                  },
                  {
                    key: "retries",
                    header: t("admin.operations.col.retries"),
                    render: (row) => <RetryMeter attempts={row.attempts} dead={isDead(row)} />,
                  },
                  {
                    key: "error",
                    header: t("admin.operations.col.error"),
                    render: (row) =>
                      row.lastError ? (
                        <span
                          className={`block max-w-[320px] truncate text-xs ${
                            isDead(row) ? "font-semibold text-[#b91c1c]" : "text-advo-muted"
                          }`}
                          title={errorText(row)}
                        >
                          {errorText(row)}
                        </span>
                      ) : (
                        <span className="text-xs text-advo-muted">—</span>
                      ),
                  },
                  {
                    key: "next",
                    header: t("admin.operations.col.next"),
                    render: (row) => <NextAttempt at={row.nextAttemptAt} />,
                  },
                ]}
                empty={
                  <span className="flex flex-col items-center gap-2">
                    <SoftIcon size="lg" tone="success">
                      <CircleCheck />
                    </SoftIcon>
                    <span className="text-sm font-bold text-advo-text">
                      {t("admin.operations.table.empty")}
                    </span>
                    <span className="max-w-md text-xs text-advo-muted">
                      {t("admin.operations.table.emptyHint")}
                    </span>
                  </span>
                }
                label={t("admin.operations.table.title")}
                rowKey={(row) => row.id}
                rows={rows}
              />
            </Card>
          );
        }}
      </ResourceView>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Small pieces
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Manual recovery trigger. Owns its own pending/error state because both
 * buttons can be in flight independently and HeroUI has no async-button.
 */
function RecoveryButton({
  label,
  pendingLabel,
  icon,
  variant,
  onRun,
}: {
  label: string;
  pendingLabel: string;
  icon: ReactNode;
  variant: "primary" | "outline";
  onRun: () => Promise<unknown>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setPending(true);
    setError(null);
    try {
      await onRun();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="inline-flex flex-col">
      <Button isDisabled={pending} onPress={() => void run()} size="sm" type="button" variant={variant}>
        {pending ? <RefreshCw className="size-3.5 animate-spin" /> : icon}
        {pending ? pendingLabel : label}
      </Button>
      {error ? <span className="mt-1 max-w-56 text-[11px] text-[var(--advo-danger)]">{error}</span> : null}
    </span>
  );
}

/** Retry counter with a 12-segment meter, so "nearly dead" is visible at a glance. */
function RetryMeter({ attempts, dead }: { attempts: number; dead: boolean }) {
  const filled = Math.min(attempts, MAX_ATTEMPTS);
  const { t } = useI18n();
  return (
    <span className="flex flex-col gap-1.5">
      <span className={`text-xs font-bold tabular-nums ${dead ? "text-[#b91c1c]" : "text-advo-text"}`}>
        {dead
          ? t("admin.operations.retries.dead")
          : t("admin.operations.retries.attempts", { attempts, max: MAX_ATTEMPTS })}
      </span>
      <span aria-hidden="true" className="flex gap-0.5">
        {Array.from({ length: MAX_ATTEMPTS }, (_, i) => (
          <span
            className={`h-1.5 w-1 rounded-full ${
              i < filled ? (dead ? "bg-[#dc2626]" : "bg-amber-400") : "bg-advo-surface-sunken"
            }`}
            key={i}
          />
        ))}
      </span>
    </span>
  );
}

/** Next attempt as relative-in-parentheses + absolute, or "Due now" when overdue. */
function NextAttempt({ at }: { at: string }) {
  const { t, locale } = useI18n();
  const target = new Date(at).getTime();
  const delta = target - Date.now();
  return (
    <span className="flex flex-col">
      {delta <= 0 ? (
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-advo-warning-soft px-2 py-0.5 text-[11px] font-bold text-[#b45309]">
          <Clock className="size-3" />
          {t("admin.operations.next.overdue")}
        </span>
      ) : (
        <span className="text-xs font-semibold text-advo-text">
          {t("admin.operations.next.in", { duration: formatDuration(delta, locale) })}
        </span>
      )}
      <span className="text-[10px] text-advo-muted">{formatDateTime(at)}</span>
    </span>
  );
}

/** Canonical key order for each pass's report, so runs are comparable side by side. */
const REPORT_KEYS: Record<RecoveryAction, string[]> = {
  drain: ["processed", "failed"],
  sweep: [
    "inboxRetried",
    "paymentsReconciled",
    "payoutsReconciled",
    "commissionsReleased",
    "subscriptionsExpired",
    "grantsExpired",
    "grantsActivationFailed",
  ],
};

/** Report counter → message key, so a renamed key fails the build, not the screen. */
const REPORT_LABELS: Record<string, MessageKey> = {
  processed: "admin.operations.outcome.processed",
  failed: "admin.operations.outcome.failed",
  inboxRetried: "admin.operations.outcome.inboxRetried",
  paymentsReconciled: "admin.operations.outcome.paymentsReconciled",
  payoutsReconciled: "admin.operations.outcome.payoutsReconciled",
  commissionsReleased: "admin.operations.outcome.commissionsReleased",
  subscriptionsExpired: "admin.operations.outcome.subscriptionsExpired",
  grantsExpired: "admin.operations.outcome.grantsExpired",
  grantsActivationFailed: "admin.operations.outcome.grantsActivationFailed",
};

/**
 * Renders a recovery report as labelled counters instead of raw JSON.
 *
 * `runSweepers` wraps each step in `safe()`, which yields the error message as a
 * string when a step throws — those are surfaced as failures rather than being
 * silently printed as "0".
 */
function RunReport({ action, data }: { action: RecoveryAction; data: Record<string, unknown> }) {
  const { t } = useI18n();
  const entries = REPORT_KEYS[action].filter(
    (key) => REPORT_LABELS[key] && data[key] !== undefined && data[key] !== null,
  );
  const failures = entries.filter((key) => typeof data[key] === "string");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {entries.map((key) => {
          const value = data[key];
          const errored = typeof value === "string";
          const numeric = Number(value);
          const alarming = errored || (key === "failed" && numeric > 0);
          return (
            <div
              className={`rounded-xl border p-3 ${
                alarming ? "border-[#fecaca] bg-advo-danger-soft" : "border-[var(--advo-border)] bg-advo-page/60"
              }`}
              key={key}
            >
              <p className="text-[11px] font-semibold tracking-wide text-advo-muted uppercase">
                {t(REPORT_LABELS[key])}
              </p>
              <p
                className={`mt-1 truncate text-2xl font-black tabular-nums ${
                  alarming ? "text-[#b91c1c]" : "text-advo-text"
                }`}
                title={errored ? String(value) : undefined}
              >
                {errored ? "!" : numeric}
              </p>
              {errored ? (
                <p className="mt-0.5 truncate text-[10px] font-semibold text-[#b91c1c]" title={String(value)}>
                  {String(value)}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      {failures.length > 0 ? (
        <p className="rounded-xl bg-advo-danger-soft px-3 py-2.5 text-[11px] font-semibold text-[#b91c1c]">
          {failures.length} step{failures.length === 1 ? "" : "s"} threw — see the message on the tile above.
        </p>
      ) : null}
    </div>
  );
}

/** Colour dot matching the hero's health pill. */
function healthDot(tone: "success" | "warning" | "danger" | "neutral"): string {
  if (tone === "success") return "bg-emerald-500";
  if (tone === "warning") return "animate-pulse bg-amber-500";
  if (tone === "danger") return "animate-pulse bg-rose-500";
  return "bg-slate-300";
}

/* ─────────────────────────────────────────────────────────────────────────
 * Audit log
 * ───────────────────────────────────────────────────────────────────────── */

type AuditRow = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  reason: string | null;
  createdAt: string;
  actor: { email: string; role: string } | null;
  metadata: unknown;
};

/** One-tap filters for the areas an operator actually investigates. */
const QUICK_DOMAINS = [
  "auth",
  "payment",
  "order",
  "withdrawal",
  "reseller",
  "agent",
  "device",
  "subscription",
  "voucher",
  "site",
] as const;

/** Role → tinted avatar, so an operator's scope is readable without reading the email. */
const ROLE_TONES: Record<string, IconTone> = {
  ADMIN: "violet",
  RESELLER: "accent",
  AGENT: "teal",
};

const ROLE_LABELS: Record<string, MessageKey> = {
  ADMIN: "admin.audit.role.admin",
  RESELLER: "admin.audit.role.reseller",
  AGENT: "admin.audit.role.agent",
};

/** Action prefix → tinted chip colour, so a wall of `auth.login` scans by hue. */
const ACTION_TONES: Record<string, IconTone> = {
  auth: "warning",
  payment: "accent",
  order: "accent",
  withdrawal: "gold",
  payout: "gold",
  reseller: "accent",
  agent: "teal",
  device: "violet",
  subscription: "violet",
  voucher: "success",
  commission_policy: "gold",
  setting: "warning",
  controller: "violet",
  invitation: "teal",
  admin: "danger",
};

/** The prefix before the first dot, e.g. `auth.login` → `auth`. */
const domainOf = (action: string) => action.split(".")[0];

/** Two-letter avatar initials from an email local part (`david.mlimanicity` → `DM`). */
function initials(email: string): string {
  const parts = email.split("@")[0].split(/[._-]/).filter(Boolean);
  const letters = `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`;
  return (letters || email.slice(0, 2)).toUpperCase();
}

/** "just now" / "12 min ago" — the at-a-glance age of an entry. */
function relativeTime(iso: string, t: Translator): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return t("admin.audit.when.justNow");
  if (minutes < 60) return t("admin.audit.when.minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("admin.audit.when.hoursAgo", { count: hours });
  return t("admin.audit.when.daysAgo", { count: Math.floor(hours / 24) });
}

/** Summary of the feed currently on screen. */
function auditStats(rows: AuditRow[]) {
  const operators = new Set(rows.filter((r) => r.actor).map((r) => r.actor!.email));
  const areas = new Set(rows.map((r) => domainOf(r.action)));
  return {
    total: rows.length,
    operators: operators.size,
    system: rows.filter((r) => !r.actor).length,
    areas: areas.size,
  };
}

/**
 * Compact `key: value` preview of an event's metadata.
 *
 * Audit metadata is free-form, so nested values collapse to a shape hint rather
 * than dumping a wall of JSON into a table cell; the full payload rides along in
 * the cell's `title`.
 */
function metadataPairs(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  return Object.entries(metadata as Record<string, unknown>)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => {
      if (Array.isArray(value)) return `${key}: ${value.length} items`;
      if (typeof value === "object") return `${key}: object`;
      return `${key}: ${String(value)}`;
    });
}

export function AdminAuditScreen() {
  const { t } = useI18n();
  const [action, setAction] = useState("");
  const [applied, setApplied] = useState("");
  const audit = useResource<AuditRow[]>(`/admin/audit${applied ? `?action=${encodeURIComponent(applied)}` : ""}`);

  function applyDomain(domain: string) {
    setAction(domain);
    setApplied(domain);
  }

  function clear() {
    setAction("");
    setApplied("");
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-4">
      {/* ── Hero ── */}
      <PageHero
        description={t("admin.audit.description")}
        eyebrow={t("admin.audit.eyebrow")}
        icon={<ShieldCheck />}
        iconTone="violet"
        meta={
          applied ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-advo-blue-soft px-2.5 py-1 text-[11px] font-bold text-advo-blue">
              <Filter className="size-3" />
              {t("admin.audit.filter.active", { value: applied })}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--advo-border)] bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-advo-muted">
              <ListChecks className="size-3" />
              {t("admin.audit.quick.all")}
            </span>
          )
        }
        title={t("admin.audit.title")}
      />

      {/* ── Filter ── */}
      <Card className="gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70">
        <SectionHeader
          action={
            <span className="inline-flex items-center gap-1.5 rounded-full bg-advo-surface-soft px-2.5 py-1 text-[11px] font-bold text-advo-muted tabular-nums">
              <ListChecks className="size-3" />
              {audit.data?.length ?? 0}
            </span>
          }
          description={t("admin.audit.filter.description")}
          icon={<Filter />}
          iconTone="accent"
          title={t("admin.audit.filter.title")}
        />
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setApplied(action.trim());
          }}
        >
          <div className="min-w-56 flex-1">
            <Input
              aria-label={t("admin.audit.filter.label")}
              placeholder={t("admin.audit.filter.placeholder")}
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
          </div>
          <Button size="sm" type="submit" variant="primary">
            {t("admin.audit.filter.apply")}
          </Button>
          <Button isDisabled={!applied && !action} onPress={clear} size="sm" type="button" variant="outline">
            <X className="size-3.5" />
            {t("admin.audit.filter.clear")}
          </Button>
        </form>

        <div className="border-t border-[var(--advo-border)] pt-3.5">
          <p className="text-[11px] font-bold tracking-wider text-advo-muted uppercase">
            {t("admin.audit.quick.title")}
          </p>
          <p className="mt-0.5 text-xs text-advo-muted">{t("admin.audit.quick.description")}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <button
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                applied === ""
                  ? "bg-advo-blue text-white"
                  : "bg-advo-surface-soft text-advo-muted hover:bg-advo-blue-soft hover:text-advo-blue"
              }`}
              onClick={clear}
              type="button"
            >
              {t("admin.audit.quick.all")}
            </button>
            {QUICK_DOMAINS.map((domain) => (
              <button
                className={`rounded-full px-2.5 py-1 font-mono text-[11px] font-bold transition-colors ${
                  applied === domain
                    ? "bg-advo-blue text-white"
                    : "bg-advo-surface-soft text-advo-muted hover:bg-advo-blue-soft hover:text-advo-blue"
                }`}
                key={domain}
                onClick={() => applyDomain(domain)}
                type="button"
              >
                {domain}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <ResourceView resource={audit}>
        {(rows) => {
          const stats = auditStats(rows);
          const latest = rows[0];
          return (
            <>
              {/* ── Summary ── */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <AdvoKpi
                  hint={t("admin.audit.kpi.eventsHint")}
                  icon={<ListChecks />}
                  iconTone="accent"
                  label={t("admin.audit.kpi.events")}
                  value={stats.total}
                />
                <AdvoKpi
                  hint={t("admin.audit.kpi.operatorsHint", { system: stats.system })}
                  icon={<Users />}
                  iconTone="violet"
                  label={t("admin.audit.kpi.operators")}
                  value={stats.operators}
                />
                <AdvoKpi
                  hint={t("admin.audit.kpi.areasHint")}
                  icon={<Layers />}
                  iconTone="teal"
                  label={t("admin.audit.kpi.areas")}
                  value={stats.areas}
                />
                <AdvoKpi
                  hint={
                    latest
                      ? `${latest.action} · ${t("admin.audit.kpi.latestHintAt", {
                          when: formatDateTime(latest.createdAt),
                        })}`
                      : t("admin.audit.kpi.latestHint")
                  }
                  icon={<Clock />}
                  iconTone="warning"
                  label={t("admin.audit.kpi.latest")}
                  value={latest ? relativeTime(latest.createdAt, t) : "—"}
                />
              </div>

              {/* ── Events ── */}
              <Card className="gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70">
                <SectionHeader
                  description={t("admin.audit.table.description")}
                  icon={<Receipt />}
                  iconTone="violet"
                  title={t("admin.audit.title")}
                />
                <AdvoTable
                  columns={[
                    {
                      key: "when",
                      header: t("admin.audit.col.when"),
                      isRowHeader: true,
                      render: (row) => (
                        <span className="flex flex-col">
                          <span className="text-xs font-semibold text-advo-text">
                            {relativeTime(row.createdAt, t)}
                          </span>
                          <span className="text-[10px] text-advo-muted">{formatDateTime(row.createdAt)}</span>
                        </span>
                      ),
                    },
                    {
                      key: "action",
                      header: t("admin.audit.col.action"),
                      render: (row) => {
                        const pairs = metadataPairs(row.metadata);
                        return (
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="flex min-w-0 items-center gap-2">
                              <span
                                className={`hidden shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold sm:inline-block ${
                                  ICON_TONES[ACTION_TONES[domainOf(row.action)] ?? "accent"]
                                }`}
                              >
                                {domainOf(row.action)}
                              </span>
                              <span className="truncate font-mono text-[11px] font-bold text-advo-text">
                                {/* Below `sm` the tinted prefix chip is dropped, so the full action stays readable. */}
                                <span className="sm:hidden">{row.action}</span>
                                <span className="hidden sm:inline">
                                  {row.action.slice(domainOf(row.action).length + 1) || row.action}
                                </span>
                              </span>
                            </span>
                            {pairs.length > 0 ? (
                              <span
                                className="block max-w-[220px] truncate font-mono text-[10px] leading-tight text-advo-muted"
                                title={JSON.stringify(row.metadata, null, 2)}
                              >
                                {pairs.join(" · ")}
                              </span>
                            ) : null}
                          </span>
                        );
                      },
                    },
                    {
                      key: "actor",
                      header: t("admin.audit.col.actor"),
                      render: (row) =>
                        row.actor ? (
                          <span className="flex items-center gap-2.5">
                            <SoftIcon size="sm" tone={ROLE_TONES[row.actor.role] ?? "accent"}>
                              <span className="text-[10px] font-black">{initials(row.actor.email)}</span>
                            </SoftIcon>
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate text-xs font-semibold text-advo-text">
                                {row.actor.email}
                              </span>
                              <span className="text-[10px] text-advo-muted uppercase">
                                {ROLE_LABELS[row.actor.role] ? t(ROLE_LABELS[row.actor.role]) : row.actor.role}
                              </span>
                            </span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <SoftIcon size="sm" tone="warning">
                              <Zap />
                            </SoftIcon>
                            <span className="text-xs font-semibold text-advo-muted italic">
                              {t("admin.audit.role.system")}
                            </span>
                          </span>
                        ),
                    },
                    {
                      key: "target",
                      header: t("admin.audit.col.target"),
                      render: (row) => (
                        <span className="flex flex-col">
                          <span className="text-xs font-semibold text-advo-text">{row.targetType}</span>
                          {row.targetId ? (
                            <span className="font-mono text-[10px] text-advo-muted" title={row.targetId}>
                              #{row.targetId.slice(0, 8)}
                            </span>
                          ) : null}
                        </span>
                      ),
                    },
                    {
                      key: "reason",
                      header: t("admin.audit.col.reason"),
                      render: (row) =>
                        row.reason ? (
                          <span
                            className="block max-w-[280px] truncate border-l-2 border-advo-gold/60 pl-2 text-xs text-advo-text italic"
                            title={row.reason}
                          >
                            {row.reason}
                          </span>
                        ) : (
                          <span className="text-xs text-advo-muted">—</span>
                        ),
                    },
                  ]}
                  empty={
                    <span className="flex flex-col items-center gap-2">
                      <SoftIcon size="lg" tone="violet">
                        <ShieldCheck />
                      </SoftIcon>
                      <span className="text-sm font-bold text-advo-text">
                        {applied ? t("admin.audit.empty") : t("admin.audit.emptyNone")}
                      </span>
                      <span className="max-w-md text-xs text-advo-muted">
                        {applied ? t("admin.audit.emptyHint") : t("admin.audit.emptyNoneHint")}
                      </span>
                      {applied ? (
                        <Button onPress={clear} size="sm" type="button" variant="outline">
                          <X className="size-3.5" />
                          {t("admin.audit.filter.clear")}
                        </Button>
                      ) : null}
                    </span>
                  }
                  label={t("admin.audit.title")}
                  rowKey={(row) => row.id}
                  rows={rows}
                />
              </Card>
            </>
          );
        }}
      </ResourceView>
    </div>
  );
}
