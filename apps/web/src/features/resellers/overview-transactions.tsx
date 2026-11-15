"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDateTime, formatTzs } from "@advo/api-client";
import { LOCALE_META } from "@advo/i18n";
import { StatusChip, statusTone } from "@advo/ui";
import { ArrowUpRight, CircleAlert, Receipt, Search } from "lucide-react";
import { ResourceView } from "@/features/common/components";
import {
  fulfillmentStateLabel,
  paymentStateLabel,
} from "@/features/common/labels";
import { useSiteScope } from "@/features/resellers/site-scope";
import { useResource } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

const filters = ["all", "paid", "attention"] as const;
type Filter = (typeof filters)[number];

type Order = {
  id: string;
  amountTzs: string;
  paymentState: string;
  fulfillmentState: string;
  createdAt: string;
  paidAt: string | null;
  priceSnapshot: { name?: string } | null;
  customer: {
    phone: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  site: { name: string } | null;
};

export function RecentTransactions({
  attentionCount,
  refresh,
  focusReview,
}: {
  attentionCount: number;
  refresh: number;
  focusReview: number;
}) {
  const { t } = useI18n();
  const { scoped } = useSiteScope();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (focusReview > 0) {
      setFilter("attention");
      setSearch("");
    }
  }, [focusReview]);
  const path = scoped(
    `/reseller/orders?take=8${filter === "all" ? "" : `&status=${filter}`}`,
  );

  return (
    <section
      id="transactions"
      aria-labelledby="transactions-title"
      className="scroll-mt-20"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2
            id="transactions-title"
            className="text-2xl font-bold tracking-tight"
          >
            {t("reseller.overview.recent.title")}
          </h2>
          <p className="mt-1 text-sm text-advo-muted">
            {t("reseller.overview.activitySubtitle")}
          </p>
        </div>
        <Link
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-advo-border bg-advo-card px-3 text-sm font-semibold hover:bg-advo-surface-soft"
          href="/reseller/orders"
        >
          {t("reseller.overview.recent.viewAll")}
          <ArrowUpRight className="size-4" />
        </Link>
      </div>
      <div className="min-w-0 overflow-hidden rounded-[20px] border border-advo-border bg-advo-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-advo-border p-3.5 sm:px-5">
          <div
            role="group"
            aria-label={t("reseller.col.status")}
            className="flex flex-wrap gap-1 rounded-xl bg-advo-page p-1"
          >
            {filters.map((value) => (
              <button
                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-advo-muted hover:text-advo-text aria-pressed:bg-advo-surface-soft aria-pressed:text-advo-text sm:px-3"
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
              >
                {t(`reseller.filter.${value}`)}
                {value === "attention" && attentionCount > 0 ? (
                  <span className="rounded bg-[#ffc972]/10 px-1.5 py-0.5 text-[#ffc972] tabular-nums">
                    {attentionCount}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <label className="relative block w-full sm:w-62">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-advo-muted"
            />
            <input
              aria-label={t("reseller.overview.searchRecent")}
              className="h-10 w-full rounded-xl border border-advo-border bg-advo-page pr-3 pl-9 text-sm text-advo-text placeholder:text-advo-muted focus:border-advo-gold focus:outline-none"
              type="search"
              placeholder={t("reseller.overview.searchRecent")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
        <RecentResults
          key={path}
          path={path}
          refresh={refresh}
          filter={filter}
          search={search}
        />
      </div>
    </section>
  );
}

function RecentResults({
  path,
  refresh,
  filter,
  search,
}: {
  path: string;
  refresh: number;
  filter: Filter;
  search: string;
}) {
  const { t, locale } = useI18n();
  const orders = useResource<Order[]>(path);
  const { reload } = orders;
  useEffect(() => {
    if (refresh > 0) void reload();
  }, [refresh, reload]);

  return (
    <ResourceView resource={orders}>
      {(rows) => {
        const query = search.trim().toLowerCase();
        const visible = rows.filter(
          (order) =>
            !query ||
            [
              order.id,
              order.priceSnapshot?.name,
              order.site?.name,
              order.customer?.phone,
              [order.customer?.firstName, order.customer?.lastName]
                .filter(Boolean)
                .join(" "),
            ].some((field) => field?.toLowerCase().includes(query)),
        );
        if (!visible.length) {
          return (
            <div className="px-4 py-8 text-center">
              <span className="mx-auto grid size-10 place-items-center rounded-xl bg-advo-surface-soft text-[#ffc972]">
                {filter === "attention" ? (
                  <CircleAlert className="size-5" />
                ) : (
                  <Receipt className="size-5" />
                )}
              </span>
              <p className="mt-2 text-sm text-advo-muted">
                {t(
                  query || filter === "paid"
                    ? "reseller.overview.recent.empty"
                    : filter === "attention"
                      ? "reseller.overview.noReview"
                      : "reseller.overview.noTransactions",
                )}
              </p>
            </div>
          );
        }
        return (
          <div role="table" aria-labelledby="transactions-title">
            <div
              role="row"
              className="sr-only gap-4 border-b border-advo-border text-xs font-semibold text-advo-muted xl:not-sr-only xl:grid xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.9fr)] xl:px-5 xl:py-3"
            >
              <span role="columnheader">{t("reseller.col.customer")}</span>
              <span role="columnheader">
                {t("reseller.col.packageAndSite")}
              </span>
              <span role="columnheader">{t("reseller.col.status")}</span>
              <span role="columnheader" className="text-right">
                {t("reseller.overview.amount")}
              </span>
            </div>
            {visible.map((order) => {
              const name = [order.customer?.firstName, order.customer?.lastName]
                .filter(Boolean)
                .join(" ");
              const date = formatDateTime(
                order.paidAt ?? order.createdAt,
                LOCALE_META[locale].intlLocale,
              );
              return (
                <div
                  key={order.id}
                  role="row"
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5 border-b border-advo-border px-4 py-3.5 last:border-b-0 sm:px-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.9fr)] xl:items-center xl:gap-4"
                >
                  <div role="cell" className="min-w-0">
                    <p className="text-sm font-semibold break-words">
                      {name || order.customer?.phone || t("reseller.walkIn")}
                    </p>
                    <p className="mt-1 text-xs text-advo-muted">{date}</p>
                    <p
                      className="mt-1 font-mono text-[11px] text-advo-muted"
                      title={order.id}
                    >
                      {order.id.slice(0, 8).toUpperCase()}
                    </p>
                  </div>
                  <div
                    role="cell"
                    className="min-w-0 text-xs leading-relaxed text-advo-muted"
                  >
                    <p className="font-medium break-words text-advo-text">
                      {order.priceSnapshot?.name ?? "—"}
                    </p>
                    {order.site?.name ? (
                      <p className="break-words">{order.site.name}</p>
                    ) : null}
                  </div>
                  <div
                    role="cell"
                    className="col-start-2 row-start-2 flex flex-col items-end gap-1 xl:col-start-auto xl:row-start-auto xl:items-start"
                  >
                    <StatusChip tone={statusTone(order.paymentState)}>
                      {paymentStateLabel(t, order.paymentState)}
                    </StatusChip>
                    {order.fulfillmentState === "NEEDS_REVIEW" &&
                    order.paymentState !== "NEEDS_REVIEW" ? (
                      <span className="max-w-32 text-right text-[11px] text-[#ffc972] xl:text-left">
                        {t("reseller.col.grant")} ·{" "}
                        {fulfillmentStateLabel(t, order.fulfillmentState)}
                      </span>
                    ) : null}
                  </div>
                  <div
                    role="cell"
                    className="col-start-2 row-start-1 text-right text-sm font-bold whitespace-nowrap tabular-nums xl:col-start-auto xl:row-start-auto"
                  >
                    {formatTzs(order.amountTzs)}
                  </div>
                </div>
              );
            })}
          </div>
        );
      }}
    </ResourceView>
  );
}
