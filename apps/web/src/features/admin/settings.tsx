"use client";

import { useMemo, useState, type ReactNode } from "react";
import { formatDateTime, formatTzs } from "@advo/api-client";
import { Button, Card, Input, Label } from "@heroui/react";
import { AdvoKpi, AdvoTable, Notice, SoftIcon, StatusChip, type IconTone } from "@advo/ui";
import {
  BadgePercent,
  Check,
  Coins,
  HandCoins,
  History,
  Info,
  Percent,
  RefreshCw,
  Settings2,
  ShieldCheck,
  TrendingUp,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { PageHero, ResourceView, SectionHeader } from "@/features/common/components";
import {
  CardSkeleton,
  DetailRow,
  DetailSection,
  DistributionCard,
  HeroChip,
  KpiSkeleton,
  TONE_BAR,
  type StateTone,
} from "@/features/common/distribution";
import { ReasonDialog } from "@/features/common/reason-dialog";
import { api } from "@/lib/api";
import { useResource } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { MessageKey, TranslateVars } from "@advo/i18n";

type T = (key: MessageKey, vars?: TranslateVars) => string;

/* ── Wire shapes ─────────────────────────────────────────────────────────── */

/** The two `SystemSetting` keys this screen owns. Also the ids the audit trail uses. */
const SALE_FEE_KEY = "platform.saleFeeBasisPoints";
const WITHDRAWAL_FEE_KEY = "platform.withdrawalFeeTzs";

type FeeView<V> = {
  value: V | null;
  configured: boolean;
  version: number;
  updatedAt: string | null;
  updatedBy: { name: string; email: string } | null;
};

type SaleFeeView = FeeView<{ basisPoints: number }> & { percent: number | null; maxBasisPoints: number };

type SettingsOverview = {
  fees: {
    sale: SaleFeeView;
    withdrawal: FeeView<{ fixedTzs: number }>;
  };
  history: Array<{
    id: string;
    key: string;
    at: string;
    reason: string | null;
    actor: { name: string; email: string } | null;
    before: unknown;
    after: unknown;
  }>;
  volume: {
    sales: {
      count30d: number;
      gross30dTzs: string;
      countAllTime: number;
      grossAllTimeTzs: string;
      averageTicketTzs: string;
    };
    withdrawals: {
      count30d: number;
      amount30dTzs: string;
      fee30dTzs: string;
      countAllTime: number;
      amountAllTimeTzs: string;
      feeAllTimeTzs: string;
      averagePayoutTzs: string;
    };
  };
  revenue: {
    saleFee30dTzs: string;
    saleFeeAllTimeTzs: string;
    withdrawalFee30dTzs: string;
    withdrawalFeeAllTimeTzs: string;
  };
  unconfigured: string[];
};

/* ── Fee arithmetic ──────────────────────────────────────────────────────── */

/**
 * Mirrors the API's integer math exactly.
 *
 * The API posts `(gross * basisPoints) / 10000n` with BigInt truncation. A
 * preview that used floating point would round differently and quietly promise
 * the operator a fee the ledger would never post, so the preview uses BigInt too.
 */
function saleFeeTzs(grossTzs: bigint, basisPoints: number): bigint {
  return (grossTzs * BigInt(basisPoints)) / 10000n;
}

/** Basis points as a percent string with the two decimals the form edits. */
const percentText = (basisPoints: number) => (basisPoints / 100).toFixed(2);

/**
 * A text draft that has been interpreted: either the value to send, or why it
 * cannot be sent. `unset` and `empty` are not errors — an absent number is a
 * state the operator can see, not a mistake to shout about.
 */
type Draft<T> = { ok: true; value: T } | { ok: false; reason: "invalid" | "unset" | "empty" };

/** Smallest and largest values the contracts allow, echoed from the API's own bounds. */
const SALE_FEE_MAX_BPS = 5000;
const WITHDRAWAL_FEE_MAX_TZS = 1_000_000;

/** Ticket sizes the impact card prices the fee against when the real average is absent. */
const SAMPLE_SMALL_TICKET = 1_000n;
const SAMPLE_LARGE_TICKET = 10_000n;

const HISTORY_PAGE_SIZE = 10;

const settingLabel = (t: T, key: string): string => {
  if (key === SALE_FEE_KEY) return t("admin.settings.setting.saleFee");
  if (key === WITHDRAWAL_FEE_KEY) return t("admin.settings.setting.withdrawalFee");
  return t("admin.settings.setting.unknown");
};

/**
 * A stored setting value as an operator reads it.
 *
 * The audit row keeps the raw JSON (`{ basisPoints: 500 }`), which means nothing
 * to the person auditing it, so it is rendered in the same unit as the form.
 */
function settingValueText(t: T, key: string, value: unknown): string {
  if (value === null || value === undefined) return t("admin.settings.editor.notSet");
  const raw = value as { basisPoints?: number; fixedTzs?: number };
  if (key === SALE_FEE_KEY && typeof raw.basisPoints === "number") return `${percentText(raw.basisPoints)}%`;
  if (key === WITHDRAWAL_FEE_KEY && typeof raw.fixedTzs === "number") return formatTzs(raw.fixedTzs);
  return t("admin.settings.none");
}

/* ── Screen ──────────────────────────────────────────────────────────────── */

export function AdminSettingsScreen() {
  const { t } = useI18n();
  const overview = useResource<SettingsOverview>("/admin/settings/overview");

  /**
   * Drafts are the text currently in each input, or null when the input mirrors
   * the saved value. Keeping them as text (not numbers) is what lets an operator
   * clear the field while typing without the input snapping back to 0.
   */
  const [saleDraft, setSaleDraft] = useState<string | null>(null);
  const [withdrawalDraft, setWithdrawalDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState<"sale" | "withdrawal" | null>(null);
  /**
   * The flash holds the *value* that changed, not a rendered sentence. Storing
   * the finished string would freeze it in whichever language was active at
   * save time, and the switcher would leave one Swahili line on an English page.
   */
  const [flash, setFlash] = useState<string | null>(null);
  const [historyCount, setHistoryCount] = useState(HISTORY_PAGE_SIZE);

  const stats = overview.data;

  const saleBps = stats?.fees.sale.value?.basisPoints ?? null;
  const withdrawalTzs = stats?.fees.withdrawal.value?.fixedTzs ?? null;

  /* ── Draft parsing ───────────────────────────────────────────────────── */

  /**
   * A draft parses to the value that would be sent, or to the message to show
   * instead. Modelling this as a result rather than a nullable number is what
   * keeps "empty field", "not a number" and "out of range" from ever reaching
   * the API as a 0.
   */
  const saleParsed = useMemo<Draft<number>>(() => {
    if (saleDraft === null) return saleBps === null ? { ok: false, reason: "unset" } : { ok: true, value: saleBps };
    const trimmed = saleDraft.trim();
    if (trimmed === "") return { ok: false, reason: "empty" };
    const percent = Number(trimmed);
    if (!Number.isFinite(percent) || percent < 0 || percent > SALE_FEE_MAX_BPS / 100) {
      return { ok: false, reason: "invalid" };
    }
    // A percent finer than a basis point rounds to the same stored value, but
    // rounding is the API's behaviour too, so the preview stays truthful.
    return { ok: true, value: Math.round(percent * 100) };
  }, [saleDraft, saleBps]);

  const withdrawalParsed = useMemo<Draft<number>>(() => {
    if (withdrawalDraft === null) {
      return withdrawalTzs === null ? { ok: false, reason: "unset" } : { ok: true, value: withdrawalTzs };
    }
    const trimmed = withdrawalDraft.trim();
    if (trimmed === "") return { ok: false, reason: "empty" };
    const fixedTzs = Number(trimmed);
    if (!Number.isInteger(fixedTzs) || fixedTzs < 0 || fixedTzs > WITHDRAWAL_FEE_MAX_TZS) {
      return { ok: false, reason: "invalid" };
    }
    return { ok: true, value: fixedTzs };
  }, [withdrawalDraft, withdrawalTzs]);

  const saleDraftBps = saleParsed.ok ? saleParsed.value : null;
  const withdrawalDraftTzs = withdrawalParsed.ok ? withdrawalParsed.value : null;

  const saleSavedText = saleBps === null ? "" : percentText(saleBps);
  const withdrawalSavedText = withdrawalTzs === null ? "" : String(withdrawalTzs);

  /**
   * `modified` is a text comparison: typing "5.0" over "5.00" is a visible edit
   * and the label has to say so. `canSave` is a value comparison, so that edit
   * cannot fire a PUT that changes nothing but still bumps the version and
   * writes an audit row.
   */
  const saleModified = (saleDraft ?? saleSavedText) !== saleSavedText;
  const withdrawalModified = (withdrawalDraft ?? withdrawalSavedText) !== withdrawalSavedText;
  const saleCanSave = saleParsed.ok && saleParsed.value !== saleBps;
  const withdrawalCanSave = withdrawalParsed.ok && withdrawalParsed.value !== withdrawalTzs;

  /** An out-of-range draft is an error to show; an empty one is simply not dirty. */
  const saleError =
    !saleParsed.ok && saleParsed.reason === "invalid"
      ? t("admin.settings.editor.invalid", { min: "0", max: "50" })
      : null;
  const withdrawalError =
    !withdrawalParsed.ok && withdrawalParsed.reason === "invalid"
      ? t("admin.settings.editor.invalid", { min: "0", max: String(WITHDRAWAL_FEE_MAX_TZS) })
      : null;

  const averageTicketTzs = BigInt(stats?.volume.sales.averageTicketTzs ?? "0");
  const averagePayoutTzs = BigInt(stats?.volume.withdrawals.averagePayoutTzs ?? "0");

  /* ── Card rows ───────────────────────────────────────────────────────── */

  const revenueRows = useMemo(() => {
    if (!stats) return [];
    const rows: Array<{ state: string; count: number; label: string; tone: StateTone; meta: string }> = [
      {
        state: "sale",
        count: Number(stats.revenue.saleFee30dTzs),
        label: t("admin.settings.revenue.sale"),
        tone: "good",
        meta: t("admin.settings.kpi.revenue.allTime", { amount: formatTzs(stats.revenue.saleFeeAllTimeTzs) }),
      },
      {
        state: "withdrawal",
        count: Number(stats.revenue.withdrawalFee30dTzs),
        label: t("admin.settings.revenue.withdrawal"),
        tone: "progress",
        meta: t("admin.settings.kpi.revenue.allTime", {
          amount: formatTzs(stats.revenue.withdrawalFeeAllTimeTzs),
        }),
      },
    ];
    return rows;
  }, [stats, t]);

  const volumeRows = useMemo(() => {
    if (!stats) return [];
    return [
      {
        state: "sales",
        count: stats.volume.sales.count30d,
        label: t("admin.settings.volume.sales"),
        tone: "progress" as StateTone,
        meta: formatTzs(stats.volume.sales.gross30dTzs),
      },
      {
        state: "withdrawals",
        count: stats.volume.withdrawals.count30d,
        label: t("admin.settings.volume.withdrawals"),
        tone: "warn" as StateTone,
        meta: formatTzs(stats.volume.withdrawals.amount30dTzs),
      },
    ];
  }, [stats, t]);

  /**
   * The impact card needs a sale fee to mean anything, and a typical ticket only
   * when sales exist — a missing average is dropped rather than shown as zero.
   */
  const impactRows = useMemo(() => {
    if (!stats || saleBps === null) return [];
    const tickets: Array<{ state: string; label: string; gross: bigint; tone: StateTone }> = [];
    if (averageTicketTzs > 0n) {
      tickets.push({
        state: "typical",
        label: t("admin.settings.impact.typical", { amount: formatTzs(averageTicketTzs) }),
        gross: averageTicketTzs,
        tone: "good",
      });
    }
    tickets.push(
      { state: "small", label: t("admin.settings.impact.small"), gross: SAMPLE_SMALL_TICKET, tone: "warn" },
      { state: "large", label: t("admin.settings.impact.large"), gross: SAMPLE_LARGE_TICKET, tone: "progress" },
    );
    return tickets.map((ticket) => {
      const fee = saleFeeTzs(ticket.gross, saleBps);
      return {
        state: ticket.state,
        count: Number(fee),
        label: ticket.label,
        tone: ticket.tone,
        meta: t("admin.settings.impact.keep", { amount: formatTzs(ticket.gross - fee) }),
      };
    });
  }, [stats, saleBps, averageTicketTzs, t]);

  const historyRows = useMemo(() => {
    if (!stats) return [];
    const countFor = (key: string) => stats.history.filter((row) => row.key === key).length;
    const lastFor = (key: string) => {
      const row = stats.history.find((entry) => entry.key === key);
      return row ? formatDateTime(row.at) : t("admin.settings.history.none");
    };
    return [
      {
        state: SALE_FEE_KEY,
        count: countFor(SALE_FEE_KEY),
        label: t("admin.settings.history.sale"),
        tone: "progress" as StateTone,
        meta: lastFor(SALE_FEE_KEY),
      },
      {
        state: WITHDRAWAL_FEE_KEY,
        count: countFor(WITHDRAWAL_FEE_KEY),
        label: t("admin.settings.history.withdrawal"),
        tone: "warn" as StateTone,
        meta: lastFor(WITHDRAWAL_FEE_KEY),
      },
    ];
  }, [stats, t]);

  const shownHistory = (stats?.history ?? []).slice(0, historyCount);

  /* ── Saving ──────────────────────────────────────────────────────────── */

  /** Reasons are mandatory and audited; the dialog stays open if the API refuses. */
  async function saveSaleFee(reason: string) {
    if (!saleParsed.ok) return;
    const basisPoints = saleParsed.value;
    setSaving("sale");
    try {
      await api.put("/admin/settings/sale-fee", { basisPoints, reason });
      setSaleDraft(null);
      setFlash(`${percentText(basisPoints)}%`);
      await overview.reload();
    } finally {
      setSaving(null);
    }
  }

  async function saveWithdrawalFee(reason: string) {
    if (!withdrawalParsed.ok) return;
    const fixedTzs = withdrawalParsed.value;
    setSaving("withdrawal");
    try {
      await api.put("/admin/settings/withdrawal-fee", { fixedTzs, reason });
      setWithdrawalDraft(null);
      setFlash(formatTzs(fixedTzs));
      await overview.reload();
    } finally {
      setSaving(null);
    }
  }

  const saleUnconfigured = !stats?.fees.sale.configured;
  const withdrawalUnconfigured = !stats?.fees.withdrawal.configured;
  const unconfiguredCount = stats?.unconfigured.length ?? 0;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-4">
      <PageHero
        actions={
          <Button isDisabled={overview.loading} onPress={() => void overview.reload()} size="sm" type="button" variant="outline">
            <RefreshCw className={`size-4 ${overview.loading ? "animate-spin" : ""}`} />
            {t("admin.settings.action.refresh")}
          </Button>
        }
        description={t("admin.settings.description")}
        eyebrow={t("admin.settings.eyebrow")}
        icon={<Settings2 />}
        iconTone="gold"
        meta={
          stats ? (
            <>
              <HeroChip icon={<Percent className="size-3" />}>
                {saleBps === null
                  ? t("admin.settings.hero.saleFee.unset")
                  : t("admin.settings.hero.saleFee", { percent: `${percentText(saleBps)}%` })}
              </HeroChip>
              <HeroChip icon={<HandCoins className="size-3" />}>
                {withdrawalTzs === null
                  ? t("admin.settings.hero.withdrawalFee.unset")
                  : t("admin.settings.hero.withdrawalFee", { amount: formatTzs(withdrawalTzs) })}
              </HeroChip>
              {unconfiguredCount > 0 ? (
                <HeroChip icon={<TriangleAlert className="size-3" />} tone="danger">
                  {t("admin.settings.hero.unconfigured", { count: unconfiguredCount })}
                </HeroChip>
              ) : (
                <HeroChip icon={<ShieldCheck className="size-3" />} tone="success">
                  {t("admin.settings.hero.configured")}
                </HeroChip>
              )}
            </>
          ) : null
        }
        title={t("admin.settings.title")}
      />

      {/* An unset fee is an outage, not a warning: sales or payouts are refused. */}
      {stats && unconfiguredCount > 0 ? (
        <Notice tone="danger">
          {unconfiguredCount === 2
            ? t("admin.settings.notice.unconfigured.both")
            : saleUnconfigured
              ? t("admin.settings.notice.unconfigured.sale")
              : t("admin.settings.notice.unconfigured.withdrawal")}
        </Notice>
      ) : null}

      {flash ? (
        <Notice tone="success">
          <span className="flex flex-wrap items-center gap-2">
            {t("admin.settings.editor.saved", { value: flash })}
            <button className="font-bold underline" onClick={() => setFlash(null)} type="button">
              ✕
            </button>
          </span>
        </Notice>
      ) : null}

      {/* ── KPI row ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {stats ? (
          <>
            <AdvoKpi
              delta={
                saleBps !== null ? (
                  <span className="text-[11px] font-semibold text-advo-muted tabular-nums">
                    {t("admin.settings.kpi.saleFee.bps", { bps: saleBps })}
                  </span>
                ) : undefined
              }
              hint={t("admin.settings.kpi.saleFee.hint")}
              icon={<BadgePercent />}
              iconTone={saleUnconfigured ? "danger" : "accent"}
              label={t("admin.settings.kpi.saleFee.title")}
              value={
                saleBps === null ? (
                  <span className="text-[var(--advo-danger)]">{t("admin.settings.kpi.saleFee.unset")}</span>
                ) : (
                  `${percentText(saleBps)}%`
                )
              }
            />
            <AdvoKpi
              delta={
                withdrawalTzs !== null ? (
                  <span className="text-[11px] font-semibold text-advo-muted">
                    {t("admin.settings.kpi.withdrawalFee.perPayout")}
                  </span>
                ) : undefined
              }
              hint={t("admin.settings.kpi.withdrawalFee.hint")}
              icon={<HandCoins />}
              iconTone={withdrawalUnconfigured ? "danger" : "teal"}
              label={t("admin.settings.kpi.withdrawalFee.title")}
              value={
                withdrawalTzs === null ? (
                  <span className="text-[var(--advo-danger)]">{t("admin.settings.kpi.withdrawalFee.unset")}</span>
                ) : (
                  formatTzs(withdrawalTzs)
                )
              }
            />
            <AdvoKpi
              delta={
                <span className="text-[11px] font-semibold text-advo-muted tabular-nums">
                  {t("admin.settings.kpi.revenue.allTime", {
                    amount: formatTzs(
                      BigInt(stats.revenue.saleFeeAllTimeTzs) + BigInt(stats.revenue.withdrawalFeeAllTimeTzs),
                    ),
                  })}
                </span>
              }
              hint={
                Number(stats.revenue.saleFee30dTzs) + Number(stats.revenue.withdrawalFee30dTzs) > 0
                  ? t("admin.settings.kpi.revenue.hint", {
                      sale: formatTzs(stats.revenue.saleFee30dTzs),
                      payout: formatTzs(stats.revenue.withdrawalFee30dTzs),
                    })
                  : t("admin.settings.kpi.revenue.empty")
              }
              icon={<TrendingUp />}
              iconTone="success"
              label={t("admin.settings.kpi.revenue.title")}
              value={formatTzs(BigInt(stats.revenue.saleFee30dTzs) + BigInt(stats.revenue.withdrawalFee30dTzs))}
            />
            <AdvoKpi
              delta={
                averageTicketTzs > 0n ? (
                  <span className="text-[11px] font-semibold text-advo-muted tabular-nums">
                    {t("admin.settings.kpi.sales.average", { amount: formatTzs(averageTicketTzs) })}
                  </span>
                ) : undefined
              }
              hint={
                stats.volume.sales.count30d > 0
                  ? t("admin.settings.kpi.sales.hint", {
                      count: stats.volume.sales.count30d,
                      amount: formatTzs(stats.volume.sales.gross30dTzs),
                    })
                  : t("admin.settings.kpi.sales.empty")
              }
              icon={<Coins />}
              iconTone="violet"
              label={t("admin.settings.kpi.sales.title")}
              value={stats.volume.sales.count30d}
            />
            <AdvoKpi
              delta={
                stats.history.length > 0 ? (
                  <span className="text-[11px] font-semibold text-advo-muted tabular-nums">
                    {t("admin.settings.kpi.lastChange.version", {
                      // The revision of whichever setting moved last, not the
                      // largest of the two — otherwise the number points at a
                      // setting the date above it does not belong to.
                      version:
                        stats.history[0].key === SALE_FEE_KEY
                          ? stats.fees.sale.version
                          : stats.fees.withdrawal.version,
                    })}
                  </span>
                ) : undefined
              }
              hint={
                stats.history.length === 0
                  ? t("admin.settings.kpi.lastChange.never")
                  : t("admin.settings.kpi.lastChange.by", {
                      setting: settingLabel(t, stats.history[0].key),
                      actor: stats.history[0].actor?.name ?? t("admin.settings.none"),
                    })
              }
              icon={<History />}
              iconTone="warning"
              label={t("admin.settings.kpi.lastChange.title")}
              value={
                stats.history.length === 0 ? (
                  <span className="text-base font-bold text-advo-muted">{t("admin.settings.none")}</span>
                ) : (
                  <span className="text-base font-bold tabular-nums">{formatDateTime(stats.history[0].at)}</span>
                )
              }
            />
          </>
        ) : (
          Array.from({ length: 5 }, (_, i) => <KpiSkeleton key={i} />)
        )}
      </div>

      {/* ── Distribution box cards ── */}
      <section>
        <SectionHeader
          description={t("admin.settings.board.hint")}
          icon={<TrendingUp />}
          iconTone="gold"
          title={t("admin.settings.board.title")}
        />
        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats ? (
            <>
              <DistributionCard
                empty={t("admin.settings.revenue.empty")}
                formatCount={(n) => formatTzs(n)}
                hint={t("admin.settings.revenue.hint")}
                icon={<TrendingUp />}
                iconTone="success"
                rows={revenueRows}
                title={t("admin.settings.revenue.title")}
                totalLabel={t("admin.settings.revenue.total", {
                  amount: formatTzs(
                    BigInt(stats.revenue.saleFee30dTzs) + BigInt(stats.revenue.withdrawalFee30dTzs),
                  ),
                })}
              />
              <DistributionCard
                empty={t("admin.settings.volume.empty")}
                hint={t("admin.settings.volume.hint")}
                icon={<Coins />}
                iconTone="accent"
                rows={volumeRows}
                title={t("admin.settings.volume.title")}
                totalLabel={t("admin.settings.volume.total", {
                  count: stats.volume.sales.count30d + stats.volume.withdrawals.count30d,
                })}
              />
              <DistributionCard
                empty={saleBps === null ? t("admin.settings.impact.unset") : t("admin.settings.impact.empty")}
                formatCount={(n) => formatTzs(n)}
                hint={t("admin.settings.impact.hint")}
                icon={<BadgePercent />}
                iconTone={saleBps === null ? "danger" : "violet"}
                rows={impactRows}
                title={t("admin.settings.impact.title")}
                totalLabel={
                  saleBps === null
                    ? t("admin.settings.impact.unset")
                    : t("admin.settings.impact.total", { percent: `${percentText(saleBps)}%` })
                }
              />
              <DistributionCard
                empty={t("admin.settings.history.empty")}
                hint={t("admin.settings.history.hint")}
                icon={<History />}
                iconTone="warning"
                rows={historyRows}
                title={t("admin.settings.history.title")}
                totalLabel={t("admin.settings.history.total", { count: stats.history.length })}
              />
            </>
          ) : (
            Array.from({ length: 4 }, (_, i) => <CardSkeleton key={i} />)
          )}
        </div>
      </section>

      {/* ── Editors ── */}
      <section>
        <SectionHeader
          description={t("admin.settings.notice.snapshot")}
          icon={<Settings2 />}
          iconTone="gold"
          title={t("admin.settings.title")}
        />
        {stats ? (
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <FeeEditor
              canSave={saleCanSave}
              description={t("admin.settings.editor.sale.description")}
              draft={saleDraft ?? saleSavedText}
              error={saleError}
              fieldHint={t("admin.settings.editor.sale.hint")}
              fieldId="fee-sale-percent"
              fieldLabel={t("admin.settings.editor.sale.label")}
              icon={<BadgePercent />}
              iconTone="accent"
              lastChange={
                stats.fees.sale.configured
                  ? `${t("admin.settings.editor.lastChange", { date: formatDateTime(stats.fees.sale.updatedAt) })}${
                      stats.fees.sale.updatedBy
                        ? ` ${t("admin.settings.editor.lastChange.by", { actor: stats.fees.sale.updatedBy.name })}`
                        : ""
                    }`
                  : t("admin.settings.editor.lastChange.none")
              }
              onDraft={setSaleDraft}
              onReset={() => setSaleDraft(null)}
              onSave={saveSaleFee}
              saved={saleBps === null ? t("admin.settings.editor.notSet") : `${percentText(saleBps)}%`}
              saving={saving === "sale"}
              step="0.01"
              title={t("admin.settings.editor.sale.title")}
              unit={t("admin.settings.editor.sale.unit")}
              modified={saleModified}
              preview={
                saleDraftBps === null
                  ? t("admin.settings.impact.unset")
                  : averageTicketTzs > 0n
                    ? t("admin.settings.editor.preview.sale", {
                        amount: formatTzs(averageTicketTzs),
                        fee: formatTzs(saleFeeTzs(averageTicketTzs, saleDraftBps)),
                      })
                    : t("admin.settings.editor.preview.sale.noVolume")
              }
              renderConfirm={({ open, onClose, onConfirm }) => (
                <ReasonDialog
                  labels={{
                    cancel: t("admin.settings.editor.reason.cancel"),
                    confirm: t("admin.settings.editor.reason.confirm"),
                    note: t("admin.settings.editor.reason.note"),
                    reasonLabel: t("admin.settings.editor.reason.label"),
                    reasonPlaceholder: t("admin.settings.editor.reason.placeholder"),
                    title: t("admin.settings.editor.reason.title.sale"),
                    tooShort: t("admin.settings.editor.reason.tooShort"),
                  }}
                  onClose={onClose}
                  onSubmit={onConfirm}
                  open={open}
                  summary={
                    <>
                      <DetailSection>{t("admin.settings.editor.sale.title")}</DetailSection>
                      <DetailRow
                        label={t("admin.settings.editor.reason.summary.current")}
                        value={saleBps === null ? t("admin.settings.editor.notSet") : `${percentText(saleBps)}%`}
                      />
                      <DetailRow
                        label={t("admin.settings.editor.reason.summary.next")}
                        value={
                          <span className="font-bold">
                            {saleDraftBps === null
                              ? t("admin.settings.editor.notSet")
                              : `${percentText(saleDraftBps)}%`}
                          </span>
                        }
                      />
                      {averageTicketTzs > 0n && saleDraftBps !== null ? (
                        <DetailRow
                          label={t("admin.settings.editor.reason.summary.impact")}
                          value={t("admin.settings.editor.preview.sale", {
                            amount: formatTzs(averageTicketTzs),
                            fee: formatTzs(saleFeeTzs(averageTicketTzs, saleDraftBps)),
                          })}
                        />
                      ) : null}
                    </>
                  }
                  warning={t("admin.settings.editor.reason.warning")}
                />
              )}
            />

            <FeeEditor
              canSave={withdrawalCanSave}
              description={t("admin.settings.editor.withdrawal.description")}
              draft={withdrawalDraft ?? withdrawalSavedText}
              error={withdrawalError}
              fieldHint={t("admin.settings.editor.withdrawal.hint")}
              fieldId="fee-withdrawal-tzs"
              fieldLabel={t("admin.settings.editor.withdrawal.label")}
              icon={<HandCoins />}
              iconTone="teal"
              lastChange={
                stats.fees.withdrawal.configured
                  ? `${t("admin.settings.editor.lastChange", {
                      date: formatDateTime(stats.fees.withdrawal.updatedAt),
                    })}${
                      stats.fees.withdrawal.updatedBy
                        ? ` ${t("admin.settings.editor.lastChange.by", { actor: stats.fees.withdrawal.updatedBy.name })}`
                        : ""
                    }`
                  : t("admin.settings.editor.lastChange.none")
              }
              onDraft={setWithdrawalDraft}
              onReset={() => setWithdrawalDraft(null)}
              onSave={saveWithdrawalFee}
              saved={withdrawalTzs === null ? t("admin.settings.editor.notSet") : formatTzs(withdrawalTzs)}
              saving={saving === "withdrawal"}
              step="1"
              title={t("admin.settings.editor.withdrawal.title")}
              unit={t("admin.settings.editor.withdrawal.unit")}
              modified={withdrawalModified}
              preview={
                withdrawalDraftTzs === null
                  ? t("admin.settings.impact.unset")
                  : averagePayoutTzs > 0n
                    ? t("admin.settings.editor.preview.withdrawal", {
                        amount: formatTzs(averagePayoutTzs),
                        total: formatTzs(averagePayoutTzs + BigInt(withdrawalDraftTzs)),
                      })
                    : t("admin.settings.editor.preview.withdrawal.noBase")
              }
              renderConfirm={({ open, onClose, onConfirm }) => (
                <ReasonDialog
                  labels={{
                    cancel: t("admin.settings.editor.reason.cancel"),
                    confirm: t("admin.settings.editor.reason.confirm"),
                    note: t("admin.settings.editor.reason.note"),
                    reasonLabel: t("admin.settings.editor.reason.label"),
                    reasonPlaceholder: t("admin.settings.editor.reason.placeholder"),
                    title: t("admin.settings.editor.reason.title.withdrawal"),
                    tooShort: t("admin.settings.editor.reason.tooShort"),
                  }}
                  onClose={onClose}
                  onSubmit={onConfirm}
                  open={open}
                  summary={
                    <>
                      <DetailSection>{t("admin.settings.editor.withdrawal.title")}</DetailSection>
                      <DetailRow
                        label={t("admin.settings.editor.reason.summary.current")}
                        value={withdrawalTzs === null ? t("admin.settings.editor.notSet") : formatTzs(withdrawalTzs)}
                      />
                      <DetailRow
                        label={t("admin.settings.editor.reason.summary.next")}
                        value={
                          <span className="font-bold">
                            {withdrawalDraftTzs === null
                              ? t("admin.settings.editor.notSet")
                              : formatTzs(withdrawalDraftTzs)}
                          </span>
                        }
                      />
                    </>
                  }
                  warning={t("admin.settings.editor.reason.warning")}
                />
              )}
            />
          </div>
        ) : (
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 2 }, (_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        )}
      </section>

      {/* ── Change history ── */}
      <section>
        <SectionHeader
          description={t("admin.settings.historyTable.description")}
          icon={<History />}
          iconTone="violet"
          title={t("admin.settings.historyTable.title")}
        />
        <Card className="mt-3 gap-3 p-3 shadow-advo-card ring-1 ring-advo-border/70">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-advo-muted">
              {t("admin.settings.notice.snapshot")}
            </span>
            <span className="text-xs font-semibold text-advo-muted tabular-nums">
              {t("admin.settings.historyTable.count", {
                shown: shownHistory.length,
                total: stats?.history.length ?? 0,
              })}
            </span>
          </div>
          <ResourceView resource={overview}>
            {() => (
              <>
                <AdvoTable
                  empty={t("admin.settings.historyTable.empty")}
                  label={t("admin.settings.historyTable.title")}
                  rowKey={(row) => row.id}
                  rows={shownHistory}
                  columns={[
                    {
                      key: "setting",
                      header: t("admin.settings.historyTable.col.setting"),
                      render: (row) => (
                        <div className="flex min-w-44 items-start gap-2.5">
                          <SoftIcon size="sm" tone={row.key === SALE_FEE_KEY ? "accent" : "teal"}>
                            {row.key === SALE_FEE_KEY ? <BadgePercent /> : <HandCoins />}
                          </SoftIcon>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-advo-text">{settingLabel(t, row.key)}</p>
                            <p className="truncate font-mono text-[11px] text-advo-muted">{row.key}</p>
                          </div>
                        </div>
                      ),
                    },
                    {
                      key: "change",
                      header: t("admin.settings.historyTable.col.change"),
                      render: (row) => (
                        <div className="flex min-w-40 items-center gap-2 text-xs tabular-nums">
                          {row.before === null ? (
                            <StatusChip tone="default">{t("admin.settings.historyTable.initial")}</StatusChip>
                          ) : (
                            <span className="text-advo-muted line-through">
                              {settingValueText(t, row.key, row.before)}
                            </span>
                          )}
                          <span className="text-advo-muted">→</span>
                          <span className="font-bold text-advo-text">{settingValueText(t, row.key, row.after)}</span>
                        </div>
                      ),
                    },
                    {
                      key: "actor",
                      header: t("admin.settings.historyTable.col.actor"),
                      render: (row) => (
                        <div className="min-w-32">
                          <p className="truncate text-xs font-semibold text-advo-text">
                            {row.actor?.name ?? t("admin.settings.none")}
                          </p>
                          <p className="truncate text-[11px] text-advo-muted">{row.actor?.email ?? ""}</p>
                        </div>
                      ),
                    },
                    {
                      key: "reason",
                      header: t("admin.settings.historyTable.col.reason"),
                      render: (row) => (
                        <span className="block max-w-64 text-xs leading-snug text-advo-muted">
                          {row.reason ?? t("admin.settings.none")}
                        </span>
                      ),
                    },
                    {
                      key: "when",
                      header: t("admin.settings.historyTable.col.when"),
                      render: (row) => (
                        <span className="text-xs whitespace-nowrap text-advo-muted tabular-nums">
                          {formatDateTime(row.at)}
                        </span>
                      ),
                    },
                  ]}
                />
                {historyCount < (stats?.history.length ?? 0) ? (
                  <div className="flex justify-center pt-1">
                    <Button
                      onPress={() => setHistoryCount((n) => n + HISTORY_PAGE_SIZE)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {t("admin.settings.historyTable.showMore", {
                        count: Math.min(HISTORY_PAGE_SIZE, (stats?.history.length ?? 0) - historyCount),
                      })}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </ResourceView>
        </Card>
      </section>
    </div>
  );
}

/* ── Fee editor ──────────────────────────────────────────────────────────── */

/**
 * One fee: its current value, a live preview of what that value charges, and a
 * save that cannot happen without a written reason.
 *
 * Both fees render through this one component on purpose. The sale fee and the
 * withdrawal fee differ only in their unit and their preview sentence, and two
 * hand-rolled forms is how one of them ends up without the audit reason or
 * without the unchanged-draft guard.
 */
function FeeEditor({
  icon,
  iconTone,
  title,
  description,
  fieldId,
  fieldLabel,
  fieldHint,
  unit,
  step,
  draft,
  onDraft,
  onReset,
  onSave,
  preview,
  lastChange,
  saved,
  modified,
  canSave,
  error,
  saving,
  renderConfirm,
}: {
  icon: ReactNode;
  iconTone: IconTone;
  title: string;
  description: string;
  /** Explicit id — a unit string is not a safe DOM id. */
  fieldId: string;
  fieldLabel: string;
  fieldHint: string;
  unit: string;
  step: string;
  draft: string;
  onDraft: (next: string) => void;
  onReset: () => void;
  /** Must throw to keep the dialog open with the API's message inline. */
  onSave: (reason: string) => Promise<void>;
  /** Null while the draft is invalid: the error replaces it rather than stacking. */
  preview: ReactNode;
  lastChange: string;
  saved: string;
  /** The text on screen differs from what is stored, valid or not. */
  modified: boolean;
  /** The draft would actually change the stored value. */
  canSave: boolean;
  error: string | null;
  saving: boolean;
  /** Built by the caller so each editor owns its own dialog and labels. */
  renderConfirm: (props: { open: boolean; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) => ReactNode;
}) {
  const { t } = useI18n();
  const [asking, setAsking] = useState(false);

  return (
    <Card className="gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70">
      <div className="flex items-start gap-3">
        <SoftIcon size="lg" tone={iconTone}>
          {icon}
        </SoftIcon>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-black text-advo-text">{title}</p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-advo-blue-soft px-2.5 py-1 text-[11px] font-bold text-advo-blue tabular-nums">
              {t("admin.settings.editor.current")} {saved}
            </span>
          </div>
          <p className="mt-1 text-xs text-advo-muted">{description}</p>
        </div>
      </div>

      <div>
        <Label htmlFor={fieldId}>
          {fieldLabel}
          <span className="text-[var(--advo-danger)]"> *</span>
        </Label>
        <div className="relative mt-1">
          <Input
            className="pr-14 tabular-nums"
            id={fieldId}
            inputMode="decimal"
            min={0}
            onChange={(e) => onDraft(e.target.value)}
            step={step}
            type="number"
            value={draft}
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs font-bold text-advo-muted">
            {unit}
          </span>
        </div>
        <p className="mt-1 text-xs text-advo-muted">{fieldHint}</p>
      </div>

      {/* An invalid draft gets one message, not a stale preview plus an error. */}
      {error ? (
        <Notice tone="danger">{error}</Notice>
      ) : (
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-xs leading-snug text-advo-text">
            <Info className="mr-1 inline size-3.5 shrink-0 text-advo-muted" />
            {preview}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--advo-border)] pt-3">
        <span className="text-[11px] font-semibold text-advo-muted">{lastChange}</span>
        <div className="flex items-center gap-2">
          {modified ? (
            <span className="flex items-center gap-1 text-[11px] font-bold text-[#b45309]">
              <span aria-hidden="true" className={`size-2 rounded-full ${TONE_BAR.warn}`} />
              {t("admin.settings.editor.modified")}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] font-bold text-advo-muted">
              <Check className="size-3" />
              {t("admin.settings.editor.unchanged")}
            </span>
          )}
          {modified ? (
            <Button onPress={onReset} size="sm" type="button" variant="ghost">
              <Undo2 className="size-3.5" />
              {t("admin.settings.editor.reset")}
            </Button>
          ) : null}
          <Button
            isDisabled={!canSave || Boolean(error) || saving}
            onPress={() => setAsking(true)}
            size="sm"
            type="button"
            variant="primary"
          >
            {t("admin.settings.editor.save")}
          </Button>
        </div>
      </div>

      {renderConfirm({ open: asking, onClose: () => setAsking(false), onConfirm: onSave })}
    </Card>
  );
}
