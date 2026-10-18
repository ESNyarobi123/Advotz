"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatDateTime, formatTzs } from "@advo/api-client";
import { Card, Skeleton } from "@heroui/react";
import { Notice, StatusChip } from "@advo/ui";
import { ActionButton } from "@/features/common/actions";
import { Field, PageHero, ResourceView } from "@/features/common/components";
import type { MessageKey } from "@advo/i18n";
import { useI18n, type I18n } from "@/lib/i18n";
import { api, newIdempotencyKey } from "@/lib/api";
import { formValues, useAction, useResource } from "@/lib/hooks";
import {
  ArrowUpRight,
  ArrowDownLeft,
  BookOpen,
  Lock,
  PlusCircle,
  AlertTriangle,
  Smartphone,
  Receipt,
  Send,
  Clock,
  Search,
  X,
  Copy,
  Check,
  Phone,
  User,
  type LucideIcon,
} from "lucide-react";

type LedgerEntry = {
  id: string;
  at: string;
  account: string;
  debitTzs: string;
  creditTzs: string;
  description: string;
  sourceType: string;
};

type WalletData = {
  availableTzs: string;
  pendingTzs: string;
  reservedTzs: string;
  history?: LedgerEntry[];
};

type Destination = {
  id: string;
  recipientName: string;
  phone: string;
  verifiedAt: string | null;
  createdAt: string;
};

type Quote = {
  destination: { recipientName: string; phone: string };
  amountTzs: string;
  providerFeeTzs: string;
  platformFeeTzs: string;
  totalDebitTzs: string;
  availableTzs: string;
  sufficient: boolean;
  provider: string;
};

type WithdrawalRow = {
  id: string;
  amountTzs: string;
  totalDebitTzs: string;
  state: string;
  reviewReason: string | null;
  failureReason: string | null;
  createdAt: string;
  destinationSnapshot: { recipientName?: string; phone?: string };
};

const SETTLED_STATES = new Set(["COMPLETED"]);
const DANGER_STATES = new Set(["FAILED", "REJECTED", "REVERSED"]);
const FILTER_STATES = [
  "ALL",
  "REQUESTED",
  "PROCESSING",
  "COMPLETED",
  "NEEDS_REVIEW",
  "FAILED",
  "REJECTED",
] as const;

type FilterState = (typeof FILTER_STATES)[number];
type Sheet = "withdraw" | "destination" | null;

function stateLabel(t: I18n["t"], state: string): string {
  const key = `wallet.state.${state}` as MessageKey;
  const translated = t(key);
  return translated === key ? state.replace(/_/g, " ") : translated;
}

function stateChipTone(state: string): "success" | "danger" | "warning" | "default" {
  if (SETTLED_STATES.has(state)) return "success";
  if (DANGER_STATES.has(state)) return "danger";
  if (state === "NEEDS_REVIEW" || state === "UNKNOWN") return "warning";
  return "default";
}

export function WalletScreen({
  base,
  pendingKey,
}: {
  base: "/reseller" | "/agent";
  pendingKey: "wallet.kpi.pendingReseller" | "wallet.kpi.pendingAgent";
}) {
  const { t } = useI18n();
  const wallet = useResource<WalletData>(`${base}/wallet`);
  const destinations = useResource<Destination[]>(`${base}/payout-destinations`);
  const withdrawals = useResource<WithdrawalRow[]>(`${base}/withdrawals`);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [quote, setQuote] = useState<{ q: Quote; destinationId: string; amount: string; key: string } | null>(
    null,
  );
  const [destId, setDestId] = useState("");
  const [amount, setAmount] = useState("");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [filterState, setFilterState] = useState<FilterState>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const addDestination = useAction(async (form: HTMLFormElement) => {
    const res = await api.post<{ devVerificationCode?: string; notificationSimulated: boolean }>(
      `${base}/payout-destinations`,
      formValues(form),
    );
    setDevCode(
      res.devVerificationCode ? `Development only — SMS code: ${res.devVerificationCode}` : null,
    );
    form.reset();
    setSheet(null);
  }, destinations.reload);

  const getQuote = useAction(async () => {
    const q = await api.post<Quote>(`${base}/withdrawals/quote`, {
      destinationId: destId,
      amountTzs: amount,
    });
    setQuote({ q, destinationId: destId, amount, key: newIdempotencyKey("wd") });
  });

  const maxQuote = useAction(async () => {
    if (!destId) throw new Error("Choose a destination first.");
    const available = Number(wallet.data?.availableTzs ?? 0);
    if (!(available > 0)) throw new Error("No available balance to withdraw.");
    const probe = await api.post<Quote>(`${base}/withdrawals/quote`, {
      destinationId: destId,
      amountTzs: String(available),
    });
    const fees = Number(probe.totalDebitTzs) - Number(probe.amountTzs);
    const max = Math.floor(available - fees);
    if (max < 1) throw new Error("Available balance does not cover the payout fees.");
    const q = await api.post<Quote>(`${base}/withdrawals/quote`, {
      destinationId: destId,
      amountTzs: String(max),
    });
    setAmount(String(max));
    setQuote({ q, destinationId: destId, amount: String(max), key: newIdempotencyKey("wd") });
  });

  const submit = useAction(
    async () => {
      if (!quote) return;
      await api.post(`${base}/withdrawals`, {
        destinationId: quote.destinationId,
        amountTzs: quote.amount,
        idempotencyKey: quote.key,
      });
      setQuote(null);
      setAmount("");
      setSheet(null);
    },
    async () => {
      await Promise.all([wallet.reload(), withdrawals.reload()]);
    },
  );

  const verified = (destinations.data ?? []).filter((d) => d.verifiedAt);
  const wData = wallet.data;
  const history = wallet.data?.history ?? [];
  const requestList = withdrawals.data ?? [];
  const destList = destinations.data ?? [];

  const requestFilters = useMemo(() => {
    const count = (state: FilterState) =>
      state === "ALL" ? requestList.length : requestList.filter((r) => r.state === state).length;
    return FILTER_STATES.map((value) => ({
      value,
      label: value === "ALL" ? t("wallet.requests.filter.all") : stateLabel(t, value),
      count: count(value),
    }));
  }, [requestList, t]);

  const term = searchQuery.trim().toLowerCase();
  const filteredRequests = useMemo(
    () =>
      requestList.filter((r) => {
        if (filterState !== "ALL" && r.state !== filterState) return false;
        if (!term) return true;
        const hay = [
          r.destinationSnapshot.recipientName ?? "",
          r.destinationSnapshot.phone ?? "",
          r.id,
          r.state,
          r.failureReason ?? "",
          r.reviewReason ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(term);
      }),
    [requestList, filterState, term],
  );

  function copyRef(id: string) {
    void navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function openWithdraw() {
    setQuote(null);
    setSheet("withdraw");
  }

  function openDestination() {
    setDevCode(null);
    setSheet("destination");
  }

  function closeSheet() {
    setSheet(null);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHero
        eyebrow={t("wallet.badge")}
        title={t("nav.withdraw")}
        description={t("wallet.subtitle")}
        icon={<ArrowUpRight />}
        iconTone="accent"
        meta={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-advo-border bg-white px-2.5 py-0.5 text-[11px] font-semibold text-advo-muted">
            {t("wallet.meta")}
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openDestination}
              className="inline-flex items-center gap-1.5 rounded-xl border border-advo-border bg-white px-3.5 py-2 text-xs font-bold text-advo-text shadow-sm hover:bg-advo-page"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              {t("wallet.destinations.cta")}
            </button>
            <button
              type="button"
              onClick={openWithdraw}
              className="inline-flex items-center gap-1.5 rounded-xl bg-advo-blue px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-advo-blue-hover"
            >
              <Send className="h-3.5 w-3.5" />
              {t("wallet.request.cta")}
            </button>
          </div>
        }
      />

      <ResourceView resource={wallet}>
        {(w) => (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiCard
              hint={t("wallet.kpi.availableHint")}
              icon={ArrowUpRight}
              label={t("wallet.kpi.available")}
              tone="emerald"
              value={formatTzs(w.availableTzs)}
            />
            <KpiCard
              hint={t(pendingKey)}
              icon={Clock}
              label={t("wallet.kpi.pending")}
              tone="amber"
              value={formatTzs(w.pendingTzs)}
            />
            <KpiCard
              hint={t("wallet.kpi.reservedHint")}
              icon={Lock}
              label={t("wallet.kpi.reserved")}
              tone="rose"
              value={formatTzs(w.reservedTzs)}
            />
          </div>
        )}
      </ResourceView>

      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-black tracking-tight text-advo-text">
              {t("wallet.destinations.title")}
              <span className="ml-1.5 font-bold text-advo-muted">
                {t("wallet.destinations.count", { count: destList.length })}
              </span>
            </h2>
            <p className="text-xs text-advo-muted">{t("wallet.destinations.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={openDestination}
            className="inline-flex items-center gap-1.5 self-start rounded-full border border-advo-border bg-white px-3 py-1.5 text-[11px] font-bold text-advo-blue hover:bg-advo-page"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            {t("wallet.destinations.cta")}
          </button>
        </div>

        <ResourceView resource={destinations}>
          {(rows) =>
            rows.length === 0 ? (
              <Card className="border-dashed p-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-advo-gold">
                  <Smartphone className="h-6 w-6" />
                </div>
                <h3 className="mt-3 text-sm font-bold text-advo-text">{t("wallet.destinations.empty")}</h3>
                <button
                  type="button"
                  onClick={openDestination}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-advo-blue px-4 py-2 text-xs font-bold text-white"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  {t("wallet.destinations.cta")}
                </button>
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {rows.map((d) => (
                  <DestinationRow
                    key={d.id}
                    base={base}
                    destination={d}
                    onReload={destinations.reload}
                    t={t}
                  />
                ))}
              </div>
            )
          }
        </ResourceView>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-black tracking-tight text-advo-text">
              {t("wallet.requests.title")}
              <span className="ml-1.5 font-bold text-advo-muted">
                {t("wallet.requests.count", { count: filteredRequests.length })}
              </span>
            </h2>
            <p className="text-xs text-advo-muted">{t("wallet.requests.subtitle")}</p>
          </div>

          <div className="relative min-w-0 w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-advo-muted" />
            <input
              aria-label={t("wallet.requests.search")}
              className="w-full rounded-xl border border-advo-border bg-white py-2 pl-8 pr-8 text-xs font-medium text-advo-text transition placeholder:text-advo-muted focus:border-advo-blue focus:outline-none"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("wallet.requests.search")}
              type="search"
              value={searchQuery}
            />
            {searchQuery ? (
              <button
                aria-label={t("wallet.requests.search.clear")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-advo-muted hover:bg-slate-100"
                onClick={() => setSearchQuery("")}
                type="button"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {requestFilters.map((f) => {
            const active = filterState === f.value;
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={active}
                onClick={() => setFilterState(f.value)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${
                  active
                    ? "border-advo-blue bg-advo-blue text-white shadow-sm"
                    : "border-advo-border bg-white text-advo-muted hover:border-advo-blue/40 hover:text-advo-text"
                }`}
              >
                {f.label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                    active ? "bg-white/20 text-white" : "bg-advo-page text-advo-text"
                  }`}
                >
                  {f.count}
                </span>
              </button>
            );
          })}
        </div>

        <ResourceView resource={withdrawals}>
          {(rows) =>
            rows.length === 0 ? (
              <Card className="border-dashed p-12 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50 text-advo-blue">
                  <Send className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-base font-bold text-advo-text">{t("wallet.requests.empty")}</h3>
                <button
                  type="button"
                  onClick={openWithdraw}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-advo-blue px-4 py-2 text-xs font-bold text-white"
                >
                  <Send className="h-3.5 w-3.5" />
                  {t("wallet.request.cta")}
                </button>
              </Card>
            ) : filteredRequests.length === 0 ? (
              <Card className="p-8 text-center text-xs text-advo-muted">{t("wallet.requests.noMatch")}</Card>
            ) : (
              <div className="flex flex-col gap-2.5">
                {filteredRequests.map((r) => (
                  <WithdrawalDetailRow
                    key={r.id}
                    copied={copiedId === r.id}
                    onCopy={() => copyRef(r.id)}
                    request={r}
                    t={t}
                  />
                ))}
              </div>
            )
          }
        </ResourceView>
      </section>

      {/* Exact heading kept for e2e: dashboards.spec.ts */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-advo-text">
            {t("wallet.ledger.title")}
            {history.length > 0 ? (
              <span className="ml-1.5 text-sm font-bold text-advo-muted">
                {t("wallet.ledger.count", { count: history.length })}
              </span>
            ) : null}
          </h2>
          <p className="text-xs text-advo-muted">{t("wallet.ledger.subtitle")}</p>
        </div>

        {wallet.error && wallet.data === undefined ? (
          <Notice tone="danger">
            {t("wallet.ledger.error", { error: wallet.error.message })}
          </Notice>
        ) : wallet.data === undefined ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : history.length === 0 ? (
          <Card className="border-dashed p-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
              <BookOpen className="h-6 w-6" />
            </div>
            <h3 className="mt-3 text-sm font-bold text-advo-text">{t("wallet.ledger.empty")}</h3>
          </Card>
        ) : (
          <div className="flex flex-col gap-2.5">
            {history.map((entry) => (
              <LedgerDetailRow key={entry.id} entry={entry} t={t} />
            ))}
          </div>
        )}
      </section>

      <BottomSheet
        open={sheet === "withdraw"}
        onClose={closeSheet}
        title={t("wallet.sheet.withdraw.title")}
        subtitle={t("wallet.sheet.withdraw.subtitle")}
        icon={<Send className="h-5 w-5" />}
      >
        {verified.length === 0 ? (
          <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-6 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-advo-gold" />
            <h3 className="mt-2 text-sm font-bold text-advo-text">{t("wallet.sheet.withdraw.noDest")}</h3>
            <p className="mt-1 text-xs text-slate-500">{t("wallet.sheet.withdraw.noDestBody")}</p>
            <button
              type="button"
              onClick={openDestination}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-advo-blue px-4 py-2 text-xs font-semibold text-white shadow hover:bg-advo-blue-hover"
            >
              <PlusCircle className="h-4 w-4" />
              {t("wallet.sheet.withdraw.addNow")}
            </button>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              maxQuote.setError(null);
              void getQuote.run();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="wd-dest" className="block text-xs font-semibold text-slate-700">
                  {t("wallet.sheet.withdraw.destination")}
                </label>
                <select
                  id="wd-dest"
                  value={destId}
                  onChange={(e) => {
                    setDestId(e.target.value);
                    setQuote(null);
                  }}
                  required
                  className="mt-1.5 w-full rounded-xl border border-advo-border bg-advo-page px-3.5 py-2.5 text-sm font-medium text-advo-text transition focus:border-advo-blue focus:bg-white focus:outline-none"
                >
                  <option value="">{t("wallet.sheet.withdraw.chooseDest")}</option>
                  {verified.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.recipientName} ({d.phone})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="wd-amount" className="block text-xs font-semibold text-slate-700">
                  {t("wallet.sheet.withdraw.amount")}
                </label>
                <input
                  id="wd-amount"
                  type="number"
                  min={1}
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setQuote(null);
                  }}
                  placeholder="e.g. 10000"
                  required
                  className="mt-1.5 w-full rounded-xl border border-advo-border bg-advo-page px-3.5 py-2.5 text-sm font-medium text-advo-text transition focus:border-advo-blue focus:bg-white focus:outline-none"
                />
                {wData?.availableTzs && Number(wData.availableTzs) > 0 ? (
                  <button
                    type="button"
                    disabled={maxQuote.pending}
                    onClick={() => {
                      getQuote.setError(null);
                      void maxQuote.run();
                    }}
                    className="mt-1.5 text-[11px] font-semibold text-advo-blue hover:underline disabled:opacity-50"
                  >
                    {maxQuote.pending
                      ? t("wallet.sheet.withdraw.maxCalculating")
                      : t("wallet.sheet.withdraw.max", { amount: formatTzs(wData.availableTzs) })}
                  </button>
                ) : null}
              </div>
            </div>

            <button
              type="submit"
              disabled={getQuote.pending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50 sm:w-auto"
            >
              <Receipt className="h-4 w-4" />
              {getQuote.pending ? t("wallet.sheet.withdraw.quoting") : t("wallet.sheet.withdraw.quote")}
            </button>
          </form>
        )}

        {getQuote.error || maxQuote.error ? (
          <div className="mt-3">
            <Notice tone="danger">{getQuote.error ?? maxQuote.error}</Notice>
          </div>
        ) : null}

        {quote ? (
          <div className="mt-5 rounded-xl border-2 border-advo-blue/30 bg-blue-50/30 p-4">
            <div className="flex items-center justify-between border-b border-blue-100 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-advo-blue">
                {t("wallet.sheet.withdraw.summary")}
              </span>
              <span className="text-[10px] font-semibold text-slate-500">
                {t("wallet.sheet.withdraw.guaranteed")}
              </span>
            </div>

            <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
              <div>
                <span className="text-slate-500">{t("wallet.sheet.withdraw.destination")}</span>
                <p className="mt-0.5 font-bold text-advo-text">
                  {quote.q.destination.recipientName} ({quote.q.destination.phone})
                </p>
              </div>
              <div>
                <span className="text-slate-500">{t("wallet.sheet.withdraw.net")}</span>
                <p className="mt-0.5 font-bold text-emerald-700">{formatTzs(quote.q.amountTzs)}</p>
              </div>
              <div>
                <span className="text-slate-500">{t("wallet.sheet.withdraw.fees")}</span>
                <p className="mt-0.5 font-semibold text-slate-700">
                  {formatTzs(quote.q.providerFeeTzs)} + {formatTzs(quote.q.platformFeeTzs)}
                </p>
              </div>
              <div>
                <span className="text-slate-500">{t("wallet.sheet.withdraw.total")}</span>
                <p className="mt-0.5 font-extrabold text-advo-text">{formatTzs(quote.q.totalDebitTzs)}</p>
              </div>
            </div>

            {quote.q.provider === "fake" ? (
              <p className="mt-3 text-xs text-advo-gold">{t("wallet.sheet.withdraw.fake")}</p>
            ) : null}

            {!quote.q.sufficient ? (
              <div className="mt-4">
                <Notice tone="danger">
                  {t("wallet.sheet.withdraw.insufficient", {
                    amount: formatTzs(quote.q.availableTzs),
                  })}
                </Notice>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void submit.run()}
                  disabled={submit.pending}
                  className="inline-flex items-center gap-2 rounded-xl bg-advo-blue px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-advo-blue-hover disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  {submit.pending
                    ? t("wallet.sheet.withdraw.submitting")
                    : t("wallet.sheet.withdraw.confirm")}
                </button>
                <button
                  type="button"
                  onClick={() => setQuote(null)}
                  className="rounded-xl border border-advo-border px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-advo-page"
                >
                  {t("wallet.sheet.withdraw.cancel")}
                </button>
              </div>
            )}

            {submit.error ? (
              <div className="mt-3">
                <Notice tone="danger">{submit.error}</Notice>
              </div>
            ) : null}
          </div>
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={sheet === "destination"}
        onClose={closeSheet}
        title={t("wallet.sheet.dest.title")}
        subtitle={t("wallet.sheet.dest.subtitle")}
        icon={<Smartphone className="h-5 w-5" />}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void addDestination.run(e.currentTarget);
          }}
        >
          <Field
            name="recipientName"
            label={t("wallet.sheet.dest.name")}
            placeholder={t("wallet.sheet.dest.namePlaceholder")}
            required
          />
          <Field
            name="phone"
            label={t("wallet.sheet.dest.phone")}
            placeholder="0712 345 678"
            required
          />

          {addDestination.error ? <Notice tone="danger">{addDestination.error}</Notice> : null}
          {devCode ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-advo-blue">{devCode}</div>
          ) : null}

          <button
            type="submit"
            disabled={addDestination.pending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-advo-blue px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-advo-blue-hover disabled:opacity-50"
          >
            <Smartphone className="h-4 w-4" />
            {addDestination.pending
              ? t("wallet.sheet.dest.submitting")
              : t("wallet.sheet.dest.submit")}
          </button>
        </form>
      </BottomSheet>
    </div>
  );
}

function DestinationRow({
  destination: d,
  base,
  onReload,
  t,
}: {
  destination: Destination;
  base: "/reseller" | "/agent";
  onReload: () => void | Promise<void>;
  t: I18n["t"];
}) {
  const verified = Boolean(d.verifiedAt);
  return (
    <Card className="overflow-hidden p-0 transition-shadow hover:shadow-advo-lift">
      <div className="flex items-center gap-3 p-3.5 sm:gap-4 sm:p-4">
        <span
          className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl ring-1 ${
            verified
              ? "bg-emerald-50 text-emerald-700 ring-emerald-200/70"
              : "bg-amber-50 text-amber-800 ring-amber-200/70"
          }`}
        >
          <Smartphone className="h-5 w-5" />
          <span
            aria-hidden="true"
            className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-white ${
              verified ? "bg-emerald-500" : "bg-amber-400"
            }`}
          />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-black tracking-tight text-advo-text">{d.recipientName}</h3>
            <StatusChip tone={verified ? "success" : "warning"}>
              {verified ? t("wallet.destinations.verified") : t("wallet.destinations.unverified")}
            </StatusChip>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-advo-muted">
            <span className="inline-flex items-center gap-1 font-semibold text-advo-text/80">
              <Phone className="h-3 w-3 text-slate-400" />
              {d.phone}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 border-l border-advo-border/60 pl-3">
          {!verified ? (
            <ActionButton
              variant="primary"
              onRun={async () => {
                const code = window.prompt(t("wallet.destinations.verifyPrompt"));
                if (!code) return;
                await api.post(`${base}/payout-destinations/${d.id}/verify`, { code: code.trim() });
              }}
              onDone={onReload}
            >
              {t("wallet.destinations.verify")}
            </ActionButton>
          ) : null}
          <ActionButton
            variant="danger"
            confirm={t("wallet.destinations.removeConfirm")}
            onRun={() => api.del(`${base}/payout-destinations/${d.id}`)}
            onDone={onReload}
          >
            {t("wallet.destinations.remove")}
          </ActionButton>
        </div>
      </div>
    </Card>
  );
}

function WithdrawalDetailRow({
  request: r,
  t,
  copied,
  onCopy,
}: {
  request: WithdrawalRow;
  t: I18n["t"];
  copied: boolean;
  onCopy: () => void;
}) {
  const settled = SETTLED_STATES.has(r.state);
  const name = r.destinationSnapshot.recipientName ?? "—";
  const err = r.failureReason ?? r.reviewReason;

  return (
    <Card className="overflow-hidden p-0 transition-shadow hover:shadow-advo-lift">
      <div className="flex items-center gap-3 p-3.5 sm:gap-4 sm:p-4">
        <span
          className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-sm font-black ring-1 ${
            settled
              ? "bg-emerald-50 text-emerald-700 ring-emerald-200/70"
              : DANGER_STATES.has(r.state)
                ? "bg-rose-50 text-rose-700 ring-rose-200/70"
                : "bg-advo-blue/10 text-advo-blue ring-advo-blue/20"
          }`}
        >
          {(name || "?").slice(0, 1).toUpperCase()}
          <span
            aria-hidden="true"
            className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-white ${
              settled
                ? "bg-emerald-500"
                : DANGER_STATES.has(r.state)
                  ? "bg-rose-400"
                  : "bg-amber-400"
            }`}
          />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-black tracking-tight text-advo-text" title={name}>
              {name}
            </h3>
            <StatusChip tone={stateChipTone(r.state)}>{stateLabel(t, r.state)}</StatusChip>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-advo-muted">
            {r.destinationSnapshot.phone ? (
              <span className="inline-flex items-center gap-1 font-semibold text-advo-text/80">
                <Phone className="h-3 w-3 text-slate-400" />
                {r.destinationSnapshot.phone}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <User className="h-3 w-3 text-slate-400" />
                {name}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3 text-slate-400" />
              {formatDateTime(r.createdAt)}
            </span>
            <span className="inline-flex items-center gap-1 font-semibold">
              {t("wallet.row.debit", { amount: formatTzs(r.totalDebitTzs) })}
            </span>
          </div>

          <dl className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-advo-border/70 bg-advo-page px-2 py-1">
              <span className="text-[9px] font-bold tracking-wider text-slate-400 uppercase">
                {t("reseller.col.reference")}
              </span>
              <span className="font-mono text-[10px] font-bold text-advo-text">{r.id.slice(0, 8)}</span>
              <button
                aria-label={copied ? t("common.copied") : t("common.copy")}
                className="rounded-md p-0.5 text-advo-muted transition hover:bg-white hover:text-advo-text"
                onClick={onCopy}
                type="button"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
              </button>
            </span>
            {err ? (
              <span className="inline-flex max-w-full items-center gap-1 rounded-lg border border-rose-200/70 bg-rose-50/60 px-2 py-1 text-[10px] font-bold text-rose-700">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span className="truncate" title={err}>
                  {err}
                </span>
              </span>
            ) : null}
          </dl>
        </div>

        <div className="flex shrink-0 flex-col items-end justify-center gap-0.5 border-l border-advo-border/60 pl-3 sm:pl-4">
          <p
            className={`text-base font-black tracking-tight tabular-nums sm:text-lg ${
              settled ? "text-emerald-700" : "text-advo-text"
            }`}
          >
            {formatTzs(r.amountTzs)}
          </p>
          <p className="text-[10px] font-semibold text-advo-muted">
            {settled ? t("wallet.row.settled") : t("wallet.row.inFlight")}
          </p>
        </div>
      </div>
    </Card>
  );
}

function LedgerDetailRow({ entry, t }: { entry: LedgerEntry; t: I18n["t"] }) {
  const isCredit = entry.creditTzs !== "0";
  const isDebit = entry.debitTzs !== "0";
  const amount = isCredit ? entry.creditTzs : entry.debitTzs;
  const signed = isCredit ? `+${formatTzs(amount)}` : `-${formatTzs(amount)}`;

  return (
    <Card className="overflow-hidden p-0 transition-shadow hover:shadow-advo-lift">
      <div className="flex items-center gap-3 p-3.5 sm:gap-4 sm:p-4">
        <span
          className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl ring-1 ${
            isCredit
              ? "bg-emerald-50 text-emerald-700 ring-emerald-200/70"
              : "bg-rose-50 text-rose-700 ring-rose-200/70"
          }`}
        >
          {isCredit ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
          <span
            aria-hidden="true"
            className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-white ${
              isCredit ? "bg-emerald-500" : "bg-rose-400"
            }`}
          />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-black tracking-tight text-advo-text" title={entry.description}>
              {entry.description}
            </h3>
            <StatusChip tone={isCredit ? "success" : "danger"}>
              {isCredit ? t("wallet.ledger.row.credit") : t("wallet.ledger.row.debit")}
            </StatusChip>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-advo-muted">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3 text-slate-400" />
              {formatDateTime(entry.at)}
            </span>
            <span className="inline-flex min-w-0 items-center gap-1">
              <BookOpen className="h-3 w-3 shrink-0 text-slate-400" />
              <span className="truncate font-mono text-[10px] font-bold text-advo-text/80">{entry.account}</span>
            </span>
            {entry.sourceType ? (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                {entry.sourceType.replace(/_/g, " ")}
              </span>
            ) : null}
          </div>

          {/* Show both sides when a row carries both (rare) */}
          {isDebit && isCredit ? (
            <dl className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200/70 bg-rose-50/60 px-2 py-1 text-[10px] font-bold text-rose-700">
                {t("wallet.ledger.debit")} −{formatTzs(entry.debitTzs)}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200/70 bg-emerald-50/60 px-2 py-1 text-[10px] font-bold text-emerald-700">
                {t("wallet.ledger.credit")} +{formatTzs(entry.creditTzs)}
              </span>
            </dl>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end justify-center gap-0.5 border-l border-advo-border/60 pl-3 sm:pl-4">
          <p
            className={`text-base font-black tracking-tight tabular-nums sm:text-lg ${
              isCredit ? "text-emerald-700" : "text-rose-600"
            }`}
          >
            {isDebit && isCredit ? formatTzs(amount) : signed}
          </p>
          <p className="text-[10px] font-semibold text-advo-muted">
            {isCredit ? t("wallet.ledger.row.credit") : t("wallet.ledger.row.debit")}
          </p>
        </div>
      </div>
    </Card>
  );
}

function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        aria-label={t("wallet.sheet.close")}
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
        onClick={onClose}
        type="button"
      />
      <div
        className="relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-advo-border bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-sheet-title"
      >
        <div className="sticky top-0 z-10 border-b border-advo-border/70 bg-white/95 px-5 pb-4 pt-3 backdrop-blur">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-advo-blue/10 text-advo-blue">
              {icon}
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="wallet-sheet-title" className="text-base font-black tracking-tight text-advo-text">
                {title}
              </h2>
              <p className="text-xs text-advo-muted">{subtitle}</p>
            </div>
            <button
              aria-label={t("wallet.sheet.close")}
              className="rounded-lg p-1.5 text-advo-muted hover:bg-advo-page hover:text-advo-text"
              onClick={onClose}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  tone: "emerald" | "amber" | "rose";
}) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-advo-gold",
    rose: "bg-slate-100 text-slate-600",
  }[tone];
  const valueTone =
    tone === "emerald" ? "text-emerald-600" : tone === "amber" ? "text-advo-gold" : "text-slate-700";

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
        <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${tones}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${valueTone}`}>{value}</div>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </Card>
  );
}
