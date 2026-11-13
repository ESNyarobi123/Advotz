"use client";

import { useEffect, useRef, useState } from "react";
import { formatDateTime, formatTzs } from "@advo/api-client";
import { StatusChip } from "@advo/ui";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Receipt,
  RefreshCw,
  Search,
} from "lucide-react";
import type { MessageKey } from "@advo/i18n";
import { ResourceView } from "@/features/common/components";
import { useResource } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

export type SubscriptionInvoice = {
  id: string;
  amountTzs: string;
  status: "PAID" | "OPEN" | "VOID";
  plan: { name?: string } | null;
  periodStart: string | null;
  periodEnd: string | null;
  paidAt: string | null;
  createdAt: string;
  paymentState: string | null;
  payment: { state: string; lastError: string | null } | null;
};

type InvoicePage = {
  invoices: SubscriptionInvoice[];
  total: number;
  page: number;
  pageSize: number;
  totalPaidTzs: string;
};

const filters = ["ALL", "PAID", "OPEN", "VOID"] as const;
type Filter = (typeof filters)[number];

export function SubscriptionHistory({
  revision,
  onRefresh,
}: {
  revision: number;
  onRefresh: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (search.trim() === query) return;
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search, query]);

  const params = new URLSearchParams({ page: String(page) });
  if (filter !== "ALL") params.set("status", filter);
  if (query) params.set("q", query);
  const request = params.toString();

  return (
    <section
      className="scroll-mt-24"
      id="billing"
      aria-labelledby="billing-title"
    >
      <h2 id="billing-title" className="text-2xl font-bold tracking-tight">
        {t("reseller.subscription.invoices.title")}
      </h2>
      <p className="mt-1 text-sm text-advo-muted">
        {t("reseller.subscription.invoices.subtitle")}
      </p>
      <div className="mt-4 overflow-hidden rounded-[20px] border border-advo-border bg-advo-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-advo-border p-3 sm:px-5 sm:py-4">
          <div className="flex flex-wrap gap-1 rounded-xl bg-advo-page p-1">
            {filters.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={value === filter}
                onClick={() => {
                  setFilter(value);
                  setPage(1);
                }}
                className="rounded-lg px-3 py-2 text-xs font-semibold text-advo-muted outline-offset-2 transition hover:text-advo-text aria-pressed:bg-advo-surface-soft aria-pressed:text-advo-text"
              >
                {value === "ALL"
                  ? t("reseller.filter.all")
                  : t(`reseller.subscription.invoice.${value}`)}
              </button>
            ))}
          </div>
          <label className="relative block w-full sm:w-64">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-advo-muted"
              aria-hidden="true"
            />
            <input
              aria-label={t("reseller.subscription.invoices.search")}
              placeholder={t("reseller.subscription.invoices.search")}
              className="h-10 w-full rounded-xl border border-advo-border bg-advo-page pr-3 pl-9 text-sm text-advo-text placeholder:text-advo-muted focus:border-advo-gold focus:outline-none"
              type="search"
              maxLength={100}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
        <HistoryResults
          key={`${request}:${revision}`}
          request={request}
          filtered={filter !== "ALL" || Boolean(query)}
          onPage={setPage}
          onRefresh={onRefresh}
        />
      </div>
    </section>
  );
}

function HistoryResults({
  request,
  filtered,
  onPage,
  onRefresh,
}: {
  request: string;
  filtered: boolean;
  onPage: (page: number) => void;
  onRefresh: () => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const history = useResource<InvoicePage>(
    `/reseller/subscription/invoices?${request}`,
  );
  const { reload } = history;
  const totalPaid = history.data?.totalPaidTzs;
  const previousTotal = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (totalPaid === undefined) return;
    if (
      previousTotal.current !== undefined &&
      previousTotal.current !== totalPaid
    )
      void onRefresh();
    previousTotal.current = totalPaid;
  }, [onRefresh, totalPaid]);
  const checking = history.data?.invoices.some(
    (invoice) =>
      invoice.status === "OPEN" &&
      (invoice.paymentState === "PAID" ||
        invoice.paymentState === "OVERPAID" ||
        [
          "CREATED",
          "DISPATCHING",
          "PENDING",
          "UNKNOWN",
          "NEEDS_REVIEW",
        ].includes(invoice.payment?.state ?? "")),
  );
  useEffect(() => {
    if (!checking) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, 12_000);
    return () => clearInterval(timer);
  }, [checking, reload]);

  return (
    <div className="min-h-36">
      <div className="flex items-center justify-between gap-3 border-b border-advo-border px-4 py-2.5 sm:px-5">
        <p className="text-sm text-advo-muted">
          {history.data ? (
            <>
              {t("reseller.subscription.history.totalPaid")}{" "}
              <strong className="ml-1 text-advo-text tabular-nums">
                {formatTzs(history.data.totalPaidTzs)}
              </strong>
            </>
          ) : null}
        </p>
        <button
          className="rounded-lg p-2 text-advo-muted hover:bg-advo-surface-soft hover:text-advo-text disabled:opacity-50"
          type="button"
          onClick={() => void Promise.all([reload(), onRefresh()])}
          disabled={history.loading}
          aria-label={t("reseller.subscription.history.refresh")}
        >
          <RefreshCw className="size-4" />
        </button>
      </div>
      <ResourceView resource={history}>
        {({ invoices, page, pageSize, total }) => {
          const lastPage = Math.max(1, Math.ceil(total / pageSize));
          return (
            <>
              {invoices.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <span className="mx-auto grid size-11 place-items-center rounded-xl bg-advo-surface-soft text-advo-gold">
                    <Receipt className="size-5" />
                  </span>
                  <p className="mt-3 text-sm font-semibold">
                    {t(
                      filtered
                        ? "reseller.subscription.invoices.noMatch"
                        : "reseller.subscription.invoices.empty",
                    )}
                  </p>
                  {!filtered && page === 1 ? (
                    <p className="mt-1 text-sm text-advo-muted">
                      {t("reseller.subscription.invoices.emptyHint")}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div role="table" aria-labelledby="billing-title">
                  <div
                    role="row"
                    className="sr-only gap-5 border-b border-advo-border text-xs font-semibold text-advo-muted lg:not-sr-only lg:grid lg:grid-cols-[minmax(0,1.1fr)_1fr_9rem_8rem] lg:px-5 lg:py-3"
                  >
                    <span role="columnheader">
                      {t("reseller.subscription.checkout.summaryPlan")}
                    </span>
                    <span role="columnheader">
                      {t("reseller.subscription.invoice.period")}
                    </span>
                    <span role="columnheader">
                      {t("reseller.subscription.history.status")}
                    </span>
                    <span role="columnheader" className="text-right">
                      {t("reseller.subscription.checkout.summaryAmount")}
                    </span>
                  </div>
                  {invoices.map((invoice) => (
                    <InvoiceRow
                      invoice={invoice}
                      locale={locale}
                      key={invoice.id}
                    />
                  ))}
                </div>
              )}
              {page > 1 || lastPage > 1 ? (
                <div className="flex items-center justify-between gap-3 border-t border-advo-border px-4 py-3 text-xs text-advo-muted sm:px-5">
                  <span>
                    {t("reseller.subscription.history.page", {
                      page,
                      pages: lastPage,
                    })}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-advo-border p-2 hover:bg-advo-surface-soft disabled:opacity-40"
                      disabled={page <= 1}
                      aria-label={t("reseller.subscription.history.previous")}
                      onClick={() => onPage(page - 1)}
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-advo-border p-2 hover:bg-advo-surface-soft disabled:opacity-40"
                      disabled={page >= lastPage}
                      aria-label={t("reseller.subscription.history.next")}
                      onClick={() => onPage(page + 1)}
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          );
        }}
      </ResourceView>
    </div>
  );
}

function InvoiceRow({
  invoice,
  locale,
}: {
  invoice: SubscriptionInvoice;
  locale: "sw" | "en";
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const dateLocale = locale === "sw" ? "sw-TZ" : "en-GB";
  const date = (value: string | null) => formatDateTime(value, dateLocale);
  const paid = invoice.status === "PAID";
  const status =
    invoice.status === "OPEN"
      ? invoice.paymentState === "PAID" || invoice.paymentState === "OVERPAID"
        ? "COMPLETED"
        : invoice.paymentState === "NEEDS_REVIEW"
          ? "NEEDS_REVIEW"
          : (invoice.payment?.state ?? "OPEN")
      : invoice.status;
  const failed = ["FAILED", "EXPIRED", "VOIDED", "VOID"].includes(status);
  const key = `reseller.subscription.invoice.${status}` as MessageKey;
  const label = t(key);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div
      role="row"
      className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-3 border-b border-advo-border px-4 py-4 last:border-b-0 sm:px-5 lg:grid-cols-[minmax(0,1.1fr)_1fr_9rem_8rem] lg:items-center lg:gap-5"
    >
      <div role="cell" className="min-w-0">
        <p className="break-words text-sm font-bold">
          {invoice.plan?.name ?? "—"}
        </p>
        <p className="mt-1 text-xs text-advo-muted">
          {t(
            paid
              ? "reseller.subscription.invoice.paidAt"
              : "reseller.subscription.invoice.created",
            { date: date(invoice.paidAt ?? invoice.createdAt) },
          )}
        </p>
        <button
          type="button"
          title={invoice.id}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(invoice.id);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
          aria-label={
            copied ? t("common.copied") : `${t("common.copy")} ${invoice.id}`
          }
          className="mt-1.5 inline-flex items-center gap-2 rounded-md text-xs text-advo-muted hover:text-advo-text"
        >
          <span className="font-mono">{invoice.id.slice(0, 13)}</span>
          {copied ? (
            <Check className="size-3.5 text-emerald-300" />
          ) : (
            <Copy className="size-3" />
          )}
        </button>
      </div>
      <div
        role="cell"
        className="col-span-2 order-last text-xs leading-relaxed text-advo-muted lg:order-0 lg:col-span-1"
      >
        {invoice.periodStart && invoice.periodEnd ? (
          <>
            <span className="lg:sr-only">
              {t("reseller.subscription.invoice.period")} ·{" "}
            </span>
            <span className="lg:block">{date(invoice.periodStart)}</span>
            <span className="text-advo-muted">
              {" "}
              → {date(invoice.periodEnd)}
            </span>
          </>
        ) : (
          <span className="hidden lg:inline">—</span>
        )}
      </div>
      <div role="cell" className="row-start-2 w-fit lg:row-auto">
        <StatusChip tone={paid ? "success" : failed ? "danger" : "warning"}>
          {label === key ? t("reseller.subscription.invoice.OPEN") : label}
        </StatusChip>
      </div>
      <div
        role="cell"
        className="col-start-2 row-start-1 text-right text-sm font-bold whitespace-nowrap tabular-nums lg:col-start-auto lg:row-start-auto"
      >
        {formatTzs(invoice.amountTzs)}
      </div>
    </div>
  );
}
