"use client";

import { useMemo, useState } from "react";
import { formatDateTime, formatTzs } from "@advo/api-client";
import { Button, Card, Input } from "@heroui/react";
import { AdvoKpi, AdvoSelect, AdvoTable, Notice, SoftIcon, StatusChip } from "@advo/ui";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BookOpenCheck,
  Building2,
  CircleCheck,
  Info,
  Layers,
  RefreshCw,
  Scale,
  ScrollText,
  Search,
  TriangleAlert,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { Mono, PageHero, ResourceView, SectionHeader } from "@/features/common/components";
import {
  CardSkeleton,
  DetailRow,
  DetailSection,
  DialogShell,
  DistributionCard,
  HeroChip,
  KpiSkeleton,
  useUrlFilter,
  type StateTone,
} from "@/features/common/distribution";
import { useResource } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { MessageKey, TranslateVars } from "@advo/i18n";

type T = (key: MessageKey, vars?: TranslateVars) => string;

/* ── Wire shapes ─────────────────────────────────────────────────────────── */

type LedgerSummary = {
  totals: {
    debitsTzs: string;
    creditsTzs: string;
    differenceTzs: string;
    balanced: boolean;
    journalLines: number;
  };
  journals: {
    total: number;
    reversals: number;
    last24h: number;
    oldestAt: string | null;
    newestAt: string | null;
    /** One bucket per canonical event, with the raw names it was ever stored under. */
    bySource: Array<{ event: string; sources: string[]; journals: number; amountTzs: string }>;
  };
  accounts: {
    total: number;
    funded: number;
    byType: Array<{ type: string; normalBalance: string; family: string; accounts: number; balanceTzs: string; lineCount: string }>;
    byFamily: Array<{ family: string; accounts: number; balanceTzs: string; lineCount: string }>;
    byOwner: Array<{
      ownerType: string;
      accounts: number;
      balanceTzs: string;
      owedTzs: string;
      owedAccounts: number;
      lineCount: string;
    }>;
    bySide: Array<{ normalBalance: string; accounts: number; balanceTzs: string }>;
  };
};

type JournalLine = {
  id: string;
  accountId: string;
  ownerType: string;
  ownerId: string;
  ownerName: string | null;
  accountType: string;
  normalBalance: string;
  balanceAfterTzs: string | null;
  debitTzs: string;
  creditTzs: string;
};

type JournalRow = {
  id: string;
  sourceKey: string;
  sourceType: string;
  event: string;
  description: string;
  reversesJournalId: string | null;
  actorUserId: string | null;
  createdAt: string;
  debitTzs: string;
  creditTzs: string;
  lines: JournalLine[];
};

type JournalDetail = JournalRow & {
  actor: { name: string; email: string; role: string } | null;
  reverses: { id: string; sourceKey: string; description: string; createdAt: string } | null;
  reversedBy: { id: string; sourceKey: string; description: string; createdAt: string } | null;
};

type AccountRow = {
  id: string;
  ownerType: string;
  ownerId: string;
  type: string;
  currency: string;
  normalBalance: string;
  debitTzs: string;
  creditTzs: string;
  balanceTzs: string;
  lineCount: number;
  lastLineAt: string | null;
  owner: { type: string; name: string; handle: string; status: string } | null;
};

type AccountsResponse = { rows: AccountRow[]; total: number; funded: number };
type JournalsResponse = { rows: JournalRow[]; total: number; take: number; skip: number };

/* ── Labels ──────────────────────────────────────────────────────────────── */

const ACCOUNT_TYPES = [
  "PROVIDER_CLEARING",
  "PAYOUT_CLEARING",
  "PROVIDER_FEE_EXPENSE",
  "COMMISSION_EXPENSE",
  "OVERPAYMENT_LIABILITY",
  "RESELLER_PAYABLE",
  "RESELLER_PENDING_SETTLEMENT",
  "AGENT_PENDING_PAYABLE",
  "AGENT_AVAILABLE_PAYABLE",
  "WITHDRAWAL_RESERVE",
  "PLATFORM_SALE_FEE_REVENUE",
  "PLATFORM_WITHDRAWAL_FEE_REVENUE",
  "PLATFORM_SUBSCRIPTION_REVENUE",
] as const;

const OWNER_TYPES = ["PLATFORM", "RESELLER", "AGENT"] as const;
const FAMILIES = ["CLEARING", "OBLIGATION", "REVENUE", "COST"] as const;
const SIDES = ["DEBIT", "CREDIT"] as const;

/**
 * Known enum members get a real translation; anything else is humanised.
 *
 * The ledger groups by values the database holds as free text (`sourceType` is a
 * String, not an enum), so a value this build has never heard of must render as
 * something readable instead of `admin.ledger.event.some_new_thing`.
 */
const accountTypeLabel = (t: T, type: string) =>
  (ACCOUNT_TYPES as readonly string[]).includes(type)
    ? t(`admin.ledger.account.${type}` as MessageKey)
    : humanise(type);

const ownerLabel = (t: T, ownerType: string) =>
  (OWNER_TYPES as readonly string[]).includes(ownerType)
    ? t(`admin.ledger.owner.${ownerType}` as MessageKey)
    : humanise(ownerType);

const familyLabel = (t: T, family: string) =>
  (FAMILIES as readonly string[]).includes(family)
    ? t(`admin.ledger.family.${family}` as MessageKey)
    : humanise(family);

const sideLabel = (t: T, side: string) =>
  (SIDES as readonly string[]).includes(side)
    ? t(`admin.ledger.side.${side}` as MessageKey)
    : humanise(side);

const eventLabel = (t: T, event: string) =>
  t(`admin.ledger.event.${event}` as MessageKey) === `admin.ledger.event.${event}`
    ? humanise(event)
    : t(`admin.ledger.event.${event}` as MessageKey);

/** `commission_accrual` → "Commission accrual", for values with no catalog entry. */
function humanise(value: string): string {
  const words = value.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/* ── Colour ──────────────────────────────────────────────────────────────── */

/**
 * The board is a composition chart, not a status list, so the bar colour tells
 * the categories apart rather than judging them. One thing is always a fault
 * though: a negative balance means postings ran against the account's own side,
 * so that turns the bar red whichever bucket it sits in.
 */
function amountTone(balanceTzs: string, preferred: StateTone): StateTone {
  return balanceTzs.startsWith("-") ? "bad" : preferred;
}

const FAMILY_TONE: Record<string, StateTone> = {
  CLEARING: "progress",
  OBLIGATION: "warn",
  REVENUE: "good",
  COST: "neutral",
};

const OWNER_TONE: Record<string, StateTone> = {
  PLATFORM: "progress",
  RESELLER: "good",
  AGENT: "warn",
};

/**
 * Event colours by what the event does to the book: money in, money held, money
 * out, or a correction. A failure and a reversal are the only ones that must
 * read as bad, because those are the rows an operator opens first.
 */
const EVENT_TONE: Record<string, StateTone> = {
  wifi_sale_receipt: "good",
  wifi_sale_settlement: "good",
  subscription_receipt: "good",
  overpayment: "warn",
  withdrawal_reserve: "warn",
  withdrawal_release: "neutral",
  payout_completed: "progress",
  payout_failed: "bad",
  payout_reversed: "bad",
  commission_accrual: "progress",
  commission_release: "progress",
  commission_reversal: "bad",
};

const eventTone = (event: string): StateTone => EVENT_TONE[event] ?? "neutral";

const JOURNAL_PAGE_SIZE = 20;
const ACCOUNT_PAGE_SIZE = 15;
/** Matches the API's own clamp, so "load everything" is still a bounded request. */
const JOURNALS_LOADED = 200;

const isNegative = (value: string) => value.startsWith("-") && value !== "0";

/* ── Screen ──────────────────────────────────────────────────────────────── */

export function AdminLedgerScreen() {
  const { t } = useI18n();

  // Every filter lives in the URL, so a filtered view survives a reload and can
  // be handed to whoever has to explain the number.
  const [event, setEvent] = useUrlFilter("event");
  const [owner, setOwner] = useUrlFilter("owner");
  const [family, setFamily] = useUrlFilter("family");
  const [side, setSide] = useUrlFilter("side");

  const [journalQuery, setJournalQuery] = useState("");
  const [accountQuery, setAccountQuery] = useState("");
  const [journalCount, setJournalCount] = useState(JOURNAL_PAGE_SIZE);
  const [accountCount, setAccountCount] = useState(ACCOUNT_PAGE_SIZE);
  const [detail, setDetail] = useState<JournalRow | null>(null);

  const summary = useResource<LedgerSummary>("/admin/ledger/summary");

  // The event filter is applied by the API (it has the index and knows which raw
  // spellings belong to the event); free-text search stays client-side so typing
  // does not fire a request per keystroke.
  const journals = useResource<JournalsResponse>(
    `/admin/ledger/journals?take=${JOURNALS_LOADED}${event ? `&event=${encodeURIComponent(event)}` : ""}`,
  );

  const accountParams = useMemo(() => {
    const params = new URLSearchParams();
    if (owner) params.set("ownerType", owner);
    if (family) params.set("family", family);
    if (side) params.set("normalBalance", side);
    return params.toString();
  }, [owner, family, side]);
  const accounts = useResource<AccountsResponse>(`/admin/ledger/accounts${accountParams ? `?${accountParams}` : ""}`);

  const stats = summary.data;

  async function reload() {
    await Promise.all([summary.reload(), journals.reload(), accounts.reload()]);
  }

  /* ── Card rows ───────────────────────────────────────────────────────── */

  const eventRows = useMemo(() => {
    if (!stats) return [];
    return stats.journals.bySource.map((bucket) => ({
      state: bucket.event,
      count: bucket.journals,
      label: eventLabel(t, bucket.event),
      tone: eventTone(bucket.event),
      meta: formatTzs(bucket.amountTzs),
    }));
  }, [stats, t]);

  const obligationRows = useMemo(() => {
    if (!stats) return [];
    return stats.accounts.byOwner.map((bucket) => ({
      state: bucket.ownerType,
      count: bucket.owedAccounts,
      label: ownerLabel(t, bucket.ownerType),
      tone: amountTone(bucket.owedTzs, OWNER_TONE[bucket.ownerType] ?? "neutral"),
      meta: formatTzs(bucket.owedTzs),
    }));
  }, [stats, t]);

  const familyRows = useMemo(() => {
    if (!stats) return [];
    return stats.accounts.byFamily.map((bucket) => ({
      state: bucket.family,
      count: bucket.accounts,
      label: familyLabel(t, bucket.family),
      tone: amountTone(bucket.balanceTzs, FAMILY_TONE[bucket.family] ?? "neutral"),
      meta: formatTzs(bucket.balanceTzs),
    }));
  }, [stats, t]);

  const sideRows = useMemo(() => {
    if (!stats) return [];
    const rows = stats.accounts.bySide.map((bucket) => ({
      state: bucket.normalBalance,
      count: bucket.accounts,
      label: t(bucket.normalBalance === "DEBIT" ? "admin.ledger.sides.debit" : "admin.ledger.sides.credit"),
      tone: amountTone(bucket.balanceTzs, bucket.normalBalance === "DEBIT" ? "progress" : "good"),
      meta: formatTzs(bucket.balanceTzs),
    }));
    // The two sides of a balanced book are equal by definition; showing the gap
    // as its own row is what makes an out-of-balance ledger impossible to miss.
    if (stats.totals.balanced) return rows;
    return [
      ...rows,
      {
        state: "difference",
        count: Math.abs(Number(stats.totals.differenceTzs)),
        label: t("admin.ledger.sides.difference"),
        tone: "bad" as StateTone,
        meta: formatTzs(stats.totals.differenceTzs),
      },
    ];
  }, [stats, t]);

  /* ── Tables ──────────────────────────────────────────────────────────── */

  const journalRows = useMemo(() => {
    const rows = journals.data?.rows ?? [];
    const needle = journalQuery.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [row.description, row.sourceKey, row.event, row.sourceType]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(needle)),
    );
  }, [journals.data, journalQuery]);

  const shownJournals = journalRows.slice(0, journalCount);
  const accountRows = accounts.data?.rows ?? [];
  const shownAccounts = accountRows.slice(0, accountCount);

  const filtersActive = Boolean(owner || family || side || accountQuery);
  const journalLoadTruncated = (journals.data?.total ?? 0) > (journals.data?.rows.length ?? 0);

  const debitSide = stats?.accounts.bySide.find((bucket) => bucket.normalBalance === "DEBIT");
  const creditSide = stats?.accounts.bySide.find((bucket) => bucket.normalBalance === "CREDIT");

  const closeDetail = () => setDetail(null);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-4">
      <PageHero
        actions={
          <Button isDisabled={summary.loading} onPress={() => void reload()} size="sm" type="button" variant="outline">
            <RefreshCw className={`size-4 ${summary.loading ? "animate-spin" : ""}`} />
            {t("admin.ledger.action.refresh")}
          </Button>
        }
        description={t("admin.ledger.description")}
        eyebrow={t("admin.ledger.eyebrow")}
        icon={<BookOpenCheck />}
        iconTone="gold"
        meta={
          stats ? (
            <>
              <HeroChip icon={<ScrollText className="size-3" />}>
                {t("admin.ledger.hero.journals", { count: stats.journals.total })}
              </HeroChip>
              <HeroChip icon={<Wallet className="size-3" />}>
                {t("admin.ledger.hero.accounts", { count: stats.accounts.total })}
              </HeroChip>
              <HeroChip icon={<Layers className="size-3" />}>
                {t("admin.ledger.hero.legs", { count: stats.totals.journalLines })}
              </HeroChip>
              {stats.totals.balanced ? (
                <HeroChip icon={<CircleCheck className="size-3" />} tone="success">
                  {t("admin.ledger.hero.balanced")}
                </HeroChip>
              ) : (
                <HeroChip icon={<TriangleAlert className="size-3" />} tone="danger">
                  {t("admin.ledger.hero.unbalanced", { amount: formatTzs(stats.totals.differenceTzs) })}
                </HeroChip>
              )}
            </>
          ) : null
        }
        title={t("admin.ledger.title")}
      />

      {stats && !stats.totals.balanced ? (
        <Notice tone="danger">
          {t("admin.ledger.notice.unbalanced", { amount: formatTzs(stats.totals.differenceTzs) })}
        </Notice>
      ) : null}

      {/* ── KPI row ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {stats ? (
          <>
            <AdvoKpi
              hint={
                debitSide && debitSide.accounts > 0
                  ? t("admin.ledger.kpi.debits.hint", { count: debitSide.accounts })
                  : t("admin.ledger.kpi.debits.empty")
              }
              icon={<ArrowDownToLine />}
              iconTone="accent"
              label={t("admin.ledger.kpi.debits.title")}
              value={formatTzs(stats.totals.debitsTzs)}
            />
            <AdvoKpi
              hint={
                creditSide && creditSide.accounts > 0
                  ? t("admin.ledger.kpi.credits.hint", { count: creditSide.accounts })
                  : t("admin.ledger.kpi.credits.empty")
              }
              icon={<ArrowUpFromLine />}
              iconTone="teal"
              label={t("admin.ledger.kpi.credits.title")}
              value={formatTzs(stats.totals.creditsTzs)}
            />
            <AdvoKpi
              delta={
                stats.journals.last24h > 0 ? (
                  <span className="text-[11px] font-semibold text-advo-muted tabular-nums">
                    {t("admin.ledger.kpi.journals.today", { count: stats.journals.last24h })}
                  </span>
                ) : undefined
              }
              hint={
                stats.journals.bySource.length > 0
                  ? t("admin.ledger.kpi.journals.hint", {
                      events: stats.journals.bySource.length,
                      date: formatDateTime(stats.journals.oldestAt),
                    })
                  : t("admin.ledger.kpi.journals.empty")
              }
              icon={<ScrollText />}
              iconTone="violet"
              label={t("admin.ledger.kpi.journals.title")}
              value={stats.journals.total}
            />
            <AdvoKpi
              delta={
                debitSide && creditSide ? (
                  <span className="text-[11px] font-semibold text-advo-muted tabular-nums">
                    {t("admin.ledger.kpi.accounts.sides", {
                      debit: debitSide.accounts,
                      credit: creditSide.accounts,
                    })}
                  </span>
                ) : undefined
              }
              hint={
                stats.accounts.funded > 0
                  ? t("admin.ledger.kpi.accounts.hint", {
                      count: stats.accounts.funded,
                      total: stats.accounts.total,
                    })
                  : t("admin.ledger.kpi.accounts.empty")
              }
              icon={<Layers />}
              iconTone="gold"
              label={t("admin.ledger.kpi.accounts.title")}
              value={stats.accounts.total}
            />
            <AdvoKpi
              delta={
                stats.journals.reversals > 0 ? (
                  <span className="text-[11px] font-semibold text-advo-muted tabular-nums">
                    {t("admin.ledger.kpi.integrity.reversals", { count: stats.journals.reversals })}
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold text-advo-muted">
                    {t("admin.ledger.kpi.integrity.noReversals")}
                  </span>
                )
              }
              hint={
                stats.totals.balanced
                  ? t("admin.ledger.kpi.integrity.hint.balanced")
                  : t("admin.ledger.kpi.integrity.hint.unbalanced", {
                      amount: formatTzs(stats.totals.differenceTzs),
                    })
              }
              icon={<Scale />}
              iconTone={stats.totals.balanced ? "success" : "danger"}
              label={t("admin.ledger.kpi.integrity.title")}
              value={
                <StatusChip tone={stats.totals.balanced ? "success" : "danger"} size="md">
                  {t(stats.totals.balanced ? "admin.ledger.kpi.integrity.balanced" : "admin.ledger.kpi.integrity.unbalanced")}
                </StatusChip>
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
          description={t("admin.ledger.board.hint")}
          icon={<BookOpenCheck />}
          iconTone="gold"
          title={t("admin.ledger.board.title")}
        />
        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats ? (
            <>
              <DistributionCard
                empty={t("admin.ledger.events.empty")}
                hint={t("admin.ledger.events.hint")}
                icon={<ScrollText />}
                iconTone="accent"
                onPick={(next) => {
                  setEvent(event === next ? "" : next);
                  setJournalCount(JOURNAL_PAGE_SIZE);
                }}
                pickedState={event}
                rows={eventRows}
                title={t("admin.ledger.events.title")}
                totalLabel={t("admin.ledger.events.total", { count: stats.journals.total })}
              />
              <DistributionCard
                empty={t("admin.ledger.obligations.empty")}
                hint={t("admin.ledger.obligations.hint")}
                icon={<Users />}
                iconTone="warning"
                onPick={(next) => {
                  const alreadyPicked = owner === next && family === "OBLIGATION";
                  setOwner(alreadyPicked ? "" : next);
                  setFamily(alreadyPicked ? "" : "OBLIGATION");
                  setAccountCount(ACCOUNT_PAGE_SIZE);
                }}
                pickedState={family === "OBLIGATION" ? owner : ""}
                rows={obligationRows}
                title={t("admin.ledger.obligations.title")}
                totalLabel={t("admin.ledger.obligations.total", {
                  amount: formatTzs(stats.accounts.byFamily.find((f) => f.family === "OBLIGATION")?.balanceTzs ?? "0"),
                })}
              />
              <DistributionCard
                empty={t("admin.ledger.families.empty")}
                hint={t("admin.ledger.families.hint")}
                icon={<Layers />}
                iconTone="violet"
                onPick={(next) => {
                  setFamily(family === next ? "" : next);
                  setAccountCount(ACCOUNT_PAGE_SIZE);
                }}
                pickedState={family}
                rows={familyRows}
                title={t("admin.ledger.families.title")}
                totalLabel={t("admin.ledger.families.total", { count: stats.accounts.total })}
              />
              <DistributionCard
                empty={t("admin.ledger.sides.empty")}
                hint={t("admin.ledger.sides.hint")}
                icon={<Scale />}
                iconTone={stats.totals.balanced ? "success" : "danger"}
                onPick={(next) => {
                  setSide(side === next ? "" : next);
                  setAccountCount(ACCOUNT_PAGE_SIZE);
                }}
                pickedState={side}
                rows={sideRows}
                title={t("admin.ledger.sides.title")}
                totalLabel={t("admin.ledger.sides.total", { count: stats.totals.journalLines })}
              />
            </>
          ) : (
            Array.from({ length: 4 }, (_, i) => <CardSkeleton key={i} />)
          )}
        </div>
      </section>

      {/* ── Journals ── */}
      <section>
        <SectionHeader
          description={t("admin.ledger.journals.description")}
          icon={<ScrollText />}
          iconTone="accent"
          title={t("admin.ledger.journals.title")}
        />
        <Card className="mt-3 gap-3 p-3 shadow-advo-card ring-1 ring-advo-border/70">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-advo-muted" />
              <Input
                aria-label={t("admin.ledger.journals.filter.search")}
                className="pl-9"
                onChange={(e) => {
                  setJournalQuery(e.target.value);
                  setJournalCount(JOURNAL_PAGE_SIZE);
                }}
                placeholder={t("admin.ledger.journals.filter.search")}
                value={journalQuery}
              />
            </div>
            <AdvoSelect
              aria-label={t("admin.ledger.journals.filter.event")}
              className="w-auto"
              onChange={(e) => {
                setEvent(e.target.value);
                setJournalCount(JOURNAL_PAGE_SIZE);
              }}
              value={event}
            >
              <option value="">{t("admin.ledger.journals.filter.allEvents")}</option>
              {(stats?.journals.bySource ?? []).map((bucket) => (
                <option key={bucket.event} value={bucket.event}>
                  {eventLabel(t, bucket.event)}
                </option>
              ))}
            </AdvoSelect>
            {event || journalQuery ? (
              <Button
                onPress={() => {
                  setEvent("");
                  setJournalQuery("");
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                <X className="size-3.5" />
                {t("admin.ledger.journals.filter.clear")}
              </Button>
            ) : null}
            <span className="ml-auto shrink-0 text-xs font-semibold text-advo-muted tabular-nums">
              {t("admin.ledger.journals.count", {
                shown: shownJournals.length,
                total: journalRows.length,
              })}
            </span>
          </div>

          <ResourceView resource={journals}>
            {() => (
              <>
                <AdvoTable
                  empty={
                    (journals.data?.rows.length ?? 0) === 0
                      ? t("admin.ledger.journals.empty")
                      : t("admin.ledger.journals.noMatch")
                  }
                  label={t("admin.ledger.journals.title")}
                  rowKey={(row) => row.id}
                  rows={shownJournals}
                  columns={[
                    {
                      key: "entry",
                      header: t("admin.ledger.journals.col.entry"),
                      render: (row) => (
                        <div className="flex min-w-44 max-w-72 items-start gap-2.5">
                          <SoftIcon size="sm" tone={row.reversesJournalId ? "warning" : "accent"}>
                            {row.reversesJournalId ? <TriangleAlert /> : <ScrollText />}
                          </SoftIcon>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-advo-text">{row.description}</p>
                            <p className="truncate font-mono text-[11px] text-advo-muted">{row.sourceKey}</p>
                          </div>
                        </div>
                      ),
                    },
                    {
                      key: "event",
                      header: t("admin.ledger.journals.col.event"),
                      render: (row) => (
                        <div className="flex min-w-32 flex-wrap items-center gap-1.5">
                          <StatusChip tone={chipTone(eventTone(row.event))}>{eventLabel(t, row.event)}</StatusChip>
                          {row.reversesJournalId ? (
                            <StatusChip tone="warning">{t("admin.ledger.journals.reversal")}</StatusChip>
                          ) : null}
                        </div>
                      ),
                    },
                    {
                      key: "legs",
                      header: t("admin.ledger.journals.col.legs"),
                      render: (row) => (
                        <div className="min-w-32 max-w-52">
                          <p className="text-xs font-bold text-advo-text tabular-nums">
                            {t("admin.ledger.journals.legs", { count: row.lines.length })}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-advo-muted">
                            {[...new Set(row.lines.map((line) => accountTypeLabel(t, line.accountType)))].join(", ")}
                          </p>
                        </div>
                      ),
                    },
                    {
                      key: "amount",
                      header: t("admin.ledger.journals.col.amount"),
                      render: (row) => (
                        <div className="min-w-24">
                          <p className="text-sm font-bold text-advo-text tabular-nums">{formatTzs(row.debitTzs)}</p>
                          {row.debitTzs === row.creditTzs ? (
                            <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-[#166534]">
                              <CircleCheck className="size-3" />
                              {t("admin.ledger.journals.balanced")}
                            </p>
                          ) : (
                            <p className="mt-0.5 text-[11px] font-semibold text-[var(--advo-danger)]">
                              {t("admin.ledger.detail.unbalanced")}
                            </p>
                          )}
                        </div>
                      ),
                    },
                    {
                      key: "posted",
                      header: t("admin.ledger.journals.col.posted"),
                      render: (row) => (
                        <span className="text-xs whitespace-nowrap text-advo-muted tabular-nums">
                          {formatDateTime(row.createdAt)}
                        </span>
                      ),
                    },
                    {
                      key: "actions",
                      header: t("admin.ledger.journals.col.actions"),
                      render: (row) => (
                        <Button
                          className="text-xs"
                          onPress={() => setDetail(row)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <Info className="size-3.5" />
                          {t("admin.ledger.journals.action.detail")}
                        </Button>
                      ),                    },
                  ]}
                />
                {journalLoadTruncated ? (
                  <p className="px-1 text-[11px] text-advo-muted">
                    {t("admin.ledger.journals.truncated", { total: JOURNALS_LOADED })}
                  </p>
                ) : null}
                {journalCount < journalRows.length ? (
                  <div className="flex justify-center pt-1">
                    <Button
                      onPress={() => setJournalCount((n) => n + JOURNAL_PAGE_SIZE)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {t("admin.ledger.journals.showMore", {
                        count: Math.min(JOURNAL_PAGE_SIZE, journalRows.length - journalCount),
                      })}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </ResourceView>
        </Card>
      </section>

      {/* ── Chart of accounts ── */}
      <section>
        <SectionHeader
          description={t("admin.ledger.accounts.description")}
          icon={<Layers />}
          iconTone="teal"
          title={t("admin.ledger.accounts.title")}
        />
        <Card className="mt-3 gap-3 p-3 shadow-advo-card ring-1 ring-advo-border/70">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-advo-muted" />
              <Input
                aria-label={t("admin.ledger.accounts.filter.search")}
                className="pl-9"
                onChange={(e) => {
                  setAccountQuery(e.target.value);
                  setAccountCount(ACCOUNT_PAGE_SIZE);
                }}
                placeholder={t("admin.ledger.accounts.filter.search")}
                value={accountQuery}
              />
            </div>
            <AdvoSelect
              aria-label={t("admin.ledger.accounts.filter.owner")}
              className="w-auto"
              onChange={(e) => {
                setOwner(e.target.value);
                setAccountCount(ACCOUNT_PAGE_SIZE);
              }}
              value={owner}
            >
              <option value="">{t("admin.ledger.accounts.filter.allOwners")}</option>
              {OWNER_TYPES.map((value) => (
                <option key={value} value={value}>
                  {ownerLabel(t, value)}
                </option>
              ))}
            </AdvoSelect>
            <AdvoSelect
              aria-label={t("admin.ledger.accounts.filter.family")}
              className="w-auto"
              onChange={(e) => {
                setFamily(e.target.value);
                setAccountCount(ACCOUNT_PAGE_SIZE);
              }}
              value={family}
            >
              <option value="">{t("admin.ledger.accounts.filter.allFamilies")}</option>
              {FAMILIES.map((value) => (
                <option key={value} value={value}>
                  {familyLabel(t, value)}
                </option>
              ))}
            </AdvoSelect>
            <AdvoSelect
              aria-label={t("admin.ledger.accounts.filter.side")}
              className="w-auto"
              onChange={(e) => {
                setSide(e.target.value);
                setAccountCount(ACCOUNT_PAGE_SIZE);
              }}
              value={side}
            >
              <option value="">{t("admin.ledger.accounts.filter.allSides")}</option>
              {SIDES.map((value) => (
                <option key={value} value={value}>
                  {sideLabel(t, value)}
                </option>
              ))}
            </AdvoSelect>
            {filtersActive ? (
              <Button
                onPress={() => {
                  setOwner("");
                  setFamily("");
                  setSide("");
                  setAccountQuery("");
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                <X className="size-3.5" />
                {t("admin.ledger.journals.filter.clear")}
              </Button>
            ) : null}
            <span className="ml-auto shrink-0 text-xs font-semibold text-advo-muted tabular-nums">
              {t("admin.ledger.accounts.count", {
                shown: shownAccounts.length,
                total: accountRows.length,
              })}
            </span>
          </div>

          <ResourceView resource={accounts}>
            {() => (
              <>
                <AdvoTable
                  empty={
                    (accounts.data?.rows.length ?? 0) === 0
                      ? t("admin.ledger.accounts.empty")
                      : t("admin.ledger.accounts.noMatch")
                  }
                  label={t("admin.ledger.accounts.title")}
                  rowKey={(row) => row.id}
                  rows={shownAccounts}
                  columns={[
                    {
                      key: "account",
                      header: t("admin.ledger.accounts.col.account"),
                      render: (row) => (
                        <div className="flex min-w-56 items-start gap-2.5">
                          <SoftIcon
                            size="sm"
                            tone={row.ownerType === "RESELLER" ? "teal" : row.ownerType === "AGENT" ? "violet" : "accent"}
                          >
                            {row.ownerType === "PLATFORM" ? <Building2 /> : <Users />}
                          </SoftIcon>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-advo-text">
                              {row.owner?.name ?? t("admin.ledger.owner.PLATFORM")}
                            </p>
                            <p className="truncate text-xs text-advo-muted">
                              {accountTypeLabel(t, row.type)}
                            </p>
                            <p className="truncate text-[11px] text-advo-muted tabular-nums">
                              {row.owner?.handle ?? row.ownerId}
                              {row.owner?.status ? ` · ${humanise(row.owner.status)}` : ""}
                            </p>
                          </div>
                        </div>
                      ),
                    },
                    {
                      key: "side",
                      header: t("admin.ledger.accounts.col.side"),
                      render: (row) => (
                        <StatusChip tone={row.normalBalance === "DEBIT" ? "accent" : "success"}>
                          {sideLabel(t, row.normalBalance)}
                        </StatusChip>
                      ),
                    },
                    {
                      key: "debits",
                      header: t("admin.ledger.accounts.col.debits"),
                      render: (row) => (
                        <span className="text-xs text-advo-muted tabular-nums">{formatTzs(row.debitTzs)}</span>
                      ),
                    },
                    {
                      key: "credits",
                      header: t("admin.ledger.accounts.col.credits"),
                      render: (row) => (
                        <span className="text-xs text-advo-muted tabular-nums">{formatTzs(row.creditTzs)}</span>
                      ),
                    },
                    {
                      key: "balance",
                      header: t("admin.ledger.accounts.col.balance"),
                      render: (row) => (
                        <div className="min-w-28">
                          <p
                            className={`text-sm font-bold tabular-nums ${
                              isNegative(row.balanceTzs) ? "text-[var(--advo-danger)]" : "text-advo-text"
                            }`}
                          >
                            {formatTzs(row.balanceTzs)}
                          </p>
                          {row.balanceTzs === "0" ? (
                            <p className="mt-0.5 text-[11px] font-semibold text-advo-muted">
                              {t("admin.ledger.accounts.zero")}
                            </p>
                          ) : null}
                        </div>
                      ),
                    },
                    {
                      key: "postings",
                      header: t("admin.ledger.accounts.col.postings"),
                      render: (row) => (
                        <span className="text-xs font-semibold text-advo-text tabular-nums">{row.lineCount}</span>
                      ),
                    },
                    {
                      key: "last",
                      header: t("admin.ledger.accounts.col.lastMovement"),
                      render: (row) => (
                        <span className="text-xs whitespace-nowrap text-advo-muted tabular-nums">
                          {row.lastLineAt ? formatDateTime(row.lastLineAt) : t("admin.ledger.none")}
                        </span>
                      ),
                    },
                  ]}
                />
                {accountCount < accountRows.length ? (
                  <div className="flex justify-center pt-1">
                    <Button
                      onPress={() => setAccountCount((n) => n + ACCOUNT_PAGE_SIZE)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {t("admin.ledger.journals.showMore", {
                        count: Math.min(ACCOUNT_PAGE_SIZE, accountRows.length - accountCount),
                      })}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </ResourceView>
        </Card>
      </section>

      <JournalDetailDialog journal={detail} onClose={closeDetail} />
    </div>
  );
}

/* ── Detail dialog ───────────────────────────────────────────────────────── */

/** `StatusChip` tone for the composition palette used by the board. */
function chipTone(tone: StateTone): "success" | "warning" | "danger" | "accent" | "default" {
  if (tone === "good") return "success";
  if (tone === "bad") return "danger";
  if (tone === "warn") return "warning";
  if (tone === "progress") return "accent";
  return "default";
}

/**
 * One journal, fetched by id so the operator gets the *running* balance each leg
 * left behind. The list row cannot carry that: a balance-after is only knowable
 * by walking the account's later postings, which is a detail-view question.
 */
function JournalDetailDialog({ journal, onClose }: { journal: JournalRow | null; onClose: () => void }) {
  const { t } = useI18n();
  const detail = useResource<JournalDetail>(journal ? `/admin/ledger/journals/${journal.id}` : null);

  return (
    <DialogShell onClose={onClose} open={Boolean(journal)} size="lg">
      {journal ? (
        <>
          <div className="flex items-start gap-3 p-5 pb-3">
            <SoftIcon size="lg" tone={journal.reversesJournalId ? "warning" : "accent"}>
              <ScrollText />
            </SoftIcon>
            <div className="min-w-0">
              <h2 className="text-base font-black tracking-tight text-advo-text">{t("admin.ledger.detail.title")}</h2>
              <p className="mt-0.5 text-sm text-advo-text">{journal.description}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusChip tone={chipTone(eventTone(journal.event))}>{eventLabel(t, journal.event)}</StatusChip>
                <StatusChip tone={journal.reversesJournalId ? "warning" : "default"}>
                  {t(journal.reversesJournalId ? "admin.ledger.detail.status.reversal" : "admin.ledger.detail.status.posted")}
                </StatusChip>
                <span className="text-[11px] font-bold text-advo-muted tabular-nums">
                  {t("admin.ledger.detail.legs", { count: journal.lines.length })}
                </span>
                <span className="text-[11px] font-bold text-advo-muted tabular-nums">
                  {formatDateTime(journal.createdAt)}
                </span>
              </div>
            </div>
          </div>

          <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 pb-5">
            <div>
              <DetailSection>{t("admin.ledger.detail.section.identity")}</DetailSection>
              <DetailRow
                label={t("admin.ledger.detail.sourceKey")}
                value={<Mono>{journal.sourceKey}</Mono>}
              />
              <DetailRow label={t("admin.ledger.detail.event")} value={eventLabel(t, journal.event)} />
              <DetailRow label={t("admin.ledger.detail.rawEvent")} value={<Mono>{journal.sourceType}</Mono>} />
              <DetailRow
                label={t("admin.ledger.detail.actor")}
                value={
                  detail.data?.actor
                    ? `${detail.data.actor.name} · ${detail.data.actor.email}`
                    : t("admin.ledger.detail.system")
                }
              />
              <DetailRow label={t("admin.ledger.detail.created")} value={formatDateTime(journal.createdAt)} />
            </div>

            <div>
              <DetailSection>{t("admin.ledger.detail.section.postings")}</DetailSection>
              {detail.error ? (
                <Notice tone="danger">{t("admin.ledger.detail.failed")}</Notice>
              ) : detail.data === undefined ? (
                <p className="py-2 text-xs text-advo-muted">{t("admin.ledger.detail.loading")}</p>
              ) : (
                <AdvoTable
                  empty={t("admin.ledger.journals.empty")}
                  label={t("admin.ledger.detail.section.postings")}
                  rowKey={(line) => line.id}
                  rows={detail.data.lines}
                  columns={[
                    {
                      key: "account",
                      header: t("admin.ledger.detail.col.account"),
                      render: (line) => (
                        <div className="min-w-44">
                          <p className="text-xs font-bold text-advo-text">{accountTypeLabel(t, line.accountType)}</p>
                          <p className="truncate text-[11px] text-advo-muted">
                            {line.ownerName ?? ownerLabel(t, line.ownerType)}
                          </p>
                        </div>
                      ),
                    },
                    {
                      key: "debit",
                      header: t("admin.ledger.detail.col.debit"),
                      className: "text-right",
                      render: (line) => (
                        <span className={`text-xs tabular-nums ${line.debitTzs !== "0" ? "font-bold text-advo-text" : "text-advo-muted"}`}>
                          {line.debitTzs !== "0" ? formatTzs(line.debitTzs) : t("admin.ledger.none")}
                        </span>
                      ),
                    },
                    {
                      key: "credit",
                      header: t("admin.ledger.detail.col.credit"),
                      className: "text-right",
                      render: (line) => (
                        <span className={`text-xs tabular-nums ${line.creditTzs !== "0" ? "font-bold text-advo-text" : "text-advo-muted"}`}>
                          {line.creditTzs !== "0" ? formatTzs(line.creditTzs) : t("admin.ledger.none")}
                        </span>
                      ),
                    },
                    {
                      key: "after",
                      header: t("admin.ledger.detail.col.balanceAfter"),
                      className: "text-right",
                      render: (line) => (
                        <span className="text-xs whitespace-nowrap text-advo-muted tabular-nums">
                          {line.balanceAfterTzs === null ? t("admin.ledger.none") : formatTzs(line.balanceAfterTzs)}
                        </span>
                      ),
                    },
                  ]}
                />
              )}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-xs font-bold text-advo-muted">{t("admin.ledger.detail.total")}</span>
                <span className="flex flex-wrap items-center gap-3 text-xs font-bold text-advo-text tabular-nums">
                  <span>
                    {t("admin.ledger.detail.col.debit")} {formatTzs(journal.debitTzs)}
                  </span>
                  <span>
                    {t("admin.ledger.detail.col.credit")} {formatTzs(journal.creditTzs)}
                  </span>
                  <StatusChip tone={journal.debitTzs === journal.creditTzs ? "success" : "danger"}>
                    {t(
                      journal.debitTzs === journal.creditTzs
                        ? "admin.ledger.detail.balanced"
                        : "admin.ledger.detail.unbalanced",
                    )}
                  </StatusChip>
                </span>
              </div>
            </div>

            <div>
              <DetailSection>{t("admin.ledger.detail.section.trail")}</DetailSection>
              {detail.data?.reverses || detail.data?.reversedBy ? (
                <>
                  {detail.data.reverses ? (
                    <DetailRow
                      label={t("admin.ledger.detail.reverses")}
                      value={
                        <span>
                          {detail.data.reverses.description}
                          <br />
                          <Mono>{detail.data.reverses.sourceKey}</Mono>
                        </span>
                      }
                    />
                  ) : null}
                  {detail.data.reversedBy ? (
                    <DetailRow
                      label={t("admin.ledger.detail.reversedBy")}
                      value={
                        <span>
                          {detail.data.reversedBy.description}
                          <br />
                          <Mono>{detail.data.reversedBy.sourceKey}</Mono>
                        </span>
                      }
                    />
                  ) : null}
                </>
              ) : (
                <p className="py-1 text-xs text-advo-muted">{t("admin.ledger.detail.noTrail")}</p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-[var(--advo-border)] p-4">
            <Button onPress={onClose} size="sm" type="button" variant="outline">
              {t("admin.ledger.detail.close")}
            </Button>
          </div>
        </>
      ) : null}
    </DialogShell>
  );
}
