"use client";

import { useState } from "react";
import { formatDateTime, formatDuration, formatTzs } from "@advo/api-client";
import { Card } from "@heroui/react";
import { AdvoTable, StatusChip, statusTone } from "@advo/ui";
import { ActionButton } from "@/features/common/actions";
import { Mono, ResourceView } from "@/features/common/components";
import { deviceStateLabel, fulfillmentStateLabel, grantStateLabel, paymentStateLabel } from "@/features/common/labels";
import { useI18n, type I18n } from "@/lib/i18n";
import { api } from "@/lib/api";
import { useResource } from "@/lib/hooks";
import {
  Users,
  Smartphone,
  Activity,
  Clock,
  Receipt,
  CheckCircle2,
  Search,
  DollarSign,
  TrendingUp,
} from "lucide-react";

type Grant = {
  id: string;
  state: string;
  durationSeconds: number;
  maxDevices: number;
  activatedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  orderId: string | null;
  voucherId: string | null;
  packageSnapshot: { name?: string };
  site: { name: string };
  devices: Array<{ id: string; clientMac: string; authState: string; lastError: string | null; attempts: number }>;
};

type Customer = {
  id: string;
  phone: string;
  name: string;
  purchases: number;
  totalTzs: string;
  lastPurchaseAt: string | null;
};

type Order = {
  id: string;
  amountTzs: string;
  paymentState: string;
  fulfillmentState: string;
  createdAt: string;
  paidAt: string | null;
  priceSnapshot: { name?: string; saleFeeBasisPoints?: number };
  customer: { phone: string; firstName: string | null; lastName: string | null } | null;
  site: { name: string } | null;
  attempts: Array<{ state: string; lastError: string | null }>;
  grant: { state: string; expiresAt: string | null } | null;
};

/** Real enum vocabulary (packages/db/prisma/schema.prisma), rendered for humans. */
const SETTLED_PAYMENT_STATES = new Set(["PAID", "OVERPAID"]);

/**
 * Formats the time left on an active grant. Expiry is fixed at first activation,
 * so this counts down against `expiresAt` rather than extending.
 */
function remaining(t: I18n["t"], expiresAt: string | null): string {
  if (!expiresAt) return t("reseller.customers.remaining.notStarted");
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return t("reseller.customers.remaining.ended");
  const mins = Math.floor(ms / 60000);
  return mins >= 60
    ? t("reseller.customers.remaining.hours", { hours: Math.floor(mins / 60), minutes: mins % 60 })
    : t("reseller.customers.remaining.minutes", { minutes: mins });
}

export function ResellerCustomersScreen() {
  const { t } = useI18n();
  const grants = useResource<Grant[]>("/reseller/grants");
  const customers = useResource<Customer[]>("/reseller/customers");

  const grantList = grants.data ?? [];
  const customerList = customers.data ?? [];

  const activeGrants = grantList.filter((g) => g.state === "ACTIVE").length;
  const totalDevicesOnline = grantList.reduce((acc, g) => {
    return acc + g.devices.filter((d) => d.authState === "AUTHORIZED").length;
  }, 0);
  const totalCustomers = customerList.length;
  const totalCustomerSpend = customerList.reduce((acc, c) => acc + (Number(c.totalTzs) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-advo-blue/10 px-2.5 py-0.5 text-xs font-semibold text-advo-blue">
            <Users className="h-3.5 w-3.5" />
            {t("reseller.customers.badge")}
          </span>
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs font-medium text-slate-500">{t("reseller.customers.sync")}</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-advo-text sm:text-3xl">
          {t("nav.customersAndAccess")}
        </h1>
        <p className="mt-1 text-sm text-advo-muted">{t("reseller.customers.subtitle")}</p>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t("reseller.customers.kpi.activeSessions")}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Activity className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">{activeGrants}</div>
          <p className="mt-1 text-xs text-slate-500">{t("reseller.customers.kpi.activeSessionsHint")}</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t("reseller.customers.kpi.onlineDevices")}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-advo-blue">
              <Smartphone className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-advo-text">{totalDevicesOnline}</div>
          <p className="mt-1 text-xs text-slate-500">{t("reseller.customers.kpi.onlineDevicesHint")}</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t("reseller.customers.kpi.registeredUsers")}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-advo-text">{totalCustomers}</div>
          <p className="mt-1 text-xs text-slate-500">{t("reseller.customers.kpi.registeredUsersHint")}</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t("reseller.customers.kpi.totalSpend")}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-advo-gold">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-advo-text">{formatTzs(totalCustomerSpend)}</div>
          <p className="mt-1 text-xs text-slate-500">{t("reseller.customers.kpi.totalSpendHint")}</p>
        </Card>
      </div>

      {/* Guest Access Section */}
      <Card className="p-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-advo-text">{t("reseller.customers.guestAccess.title")}</h2>
            <p className="text-xs text-slate-500">{t("reseller.customers.guestAccess.description")}</p>
          </div>
        </div>

        <div className="mt-4">
          <ResourceView resource={grants}>
            {(rows) => (
              <AdvoTable label={t("reseller.customers.guestAccess.tableLabel")}
                rows={rows}
                rowKey={(g) => g.id}
                empty={t("reseller.customers.guestAccess.empty")}
                columns={[
                  {
                    key: "p",
                    header: t("reseller.col.packageAndSite"),
                    render: (g) => (
                      <div>
                        <p className="font-bold text-advo-text">{g.packageSnapshot.name ?? t("reseller.col.package")}</p>
                        <p className="text-xs text-slate-500">
                          {g.site.name} ·{" "}
                          <span
                            className={`font-semibold ${
                              g.orderId ? "text-advo-blue" : "text-advo-gold"
                            }`}
                          >
                            {g.orderId
                              ? t("reseller.customers.source.mobilePayment")
                              : t("reseller.customers.source.voucher")}
                          </span>
                        </p>
                      </div>
                    ),
                  },
                  {
                    key: "s",
                    header: t("reseller.col.state"),
                    render: (g) => (
                      <StatusChip tone={statusTone(g.state)}>{grantStateLabel(t, g.state)}</StatusChip>
                    ),
                  },
                  {
                    key: "t",
                    header: t("reseller.col.timeRemaining"),
                    render: (g) => (
                      <div>
                        <span className="font-semibold text-slate-800">{formatDuration(g.durationSeconds)}</span>
                        <div className="mt-0.5">
                          {g.state === "ACTIVE" ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-bold text-advo-blue">
                              <Clock className="h-3 w-3" />
                              {remaining(t, g.expiresAt)}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">{formatDateTime(g.expiresAt)}</span>
                          )}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: "d",
                    header: t("reseller.col.devices"),
                    render: (g) => (
                      <ul className="space-y-1.5">
                        {g.devices.map((d) => (
                          <li key={d.id} className="flex flex-wrap items-center gap-2 text-xs">
                            <Mono>{d.clientMac}</Mono>
                            <span
                              className={`rounded px-1.5 py-0.2 text-[10px] font-bold ${
                                d.authState === "AUTHORIZED"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {deviceStateLabel(t, d.authState)}
                            </span>
                            {["FAILED", "UNKNOWN"].includes(d.authState) &&
                            g.state !== "REVOKED" &&
                            g.state !== "EXPIRED" ? (
                              <ActionButton
                                onRun={() => api.post(`/reseller/grant-devices/${d.id}/retry`)}
                                onDone={grants.reload}
                              >
                                {t("common.retry")}
                              </ActionButton>
                            ) : null}
                            {d.lastError ? <span className="text-xs text-red-600">{d.lastError}</span> : null}
                          </li>
                        ))}
                        <li className="text-[11px] text-slate-400">
                          {t("reseller.customers.deviceSlots", { used: g.devices.length, total: g.maxDevices })}
                        </li>
                      </ul>
                    ),
                  },
                  {
                    key: "a",
                    header: "",
                    render: (g) =>
                      ["ACTIVE", "PENDING_ACTIVATION"].includes(g.state) ? (
                        <ActionButton
                          variant="danger"
                          reasonPrompt={t("reseller.customers.revokeReason")}
                          onRun={(reason) => api.post(`/reseller/grants/${g.id}/revoke`, { reason })}
                          onDone={grants.reload}
                        >
                          {t("reseller.customers.revoke")}
                        </ActionButton>
                      ) : null,
                  },
                ]}
              />
            )}
          </ResourceView>
        </div>
      </Card>

      {/* Customers Section */}
      <Card className="p-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-advo-text">{t("reseller.customers.directory.title")}</h2>
            <p className="text-xs text-slate-500">{t("reseller.customers.directory.description")}</p>
          </div>
        </div>

        <div className="mt-4">
          <ResourceView resource={customers}>
            {(rows) => (
              <AdvoTable label={t("reseller.customers.directory.tableLabel")}
                rows={rows}
                rowKey={(c) => c.id}
                empty={t("reseller.customers.directory.empty")}
                columns={[
                  {
                    key: "n",
                    header: t("reseller.col.customer"),
                    render: (c) => (
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-advo-blue/10 font-bold text-advo-blue">
                          {(c.name || c.phone).slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-advo-text">{c.name || t("reseller.customers.guest")}</p>
                          <p className="text-xs text-slate-500">{c.phone}</p>
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: "p",
                    header: t("reseller.col.totalPurchases"),
                    render: (c) => (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                        {c.purchases === 1
                          ? t("reseller.customers.ordersCount", { count: c.purchases })
                          : t("reseller.customers.ordersCountPlural", { count: c.purchases })}
                      </span>
                    ),
                  },
                  {
                    key: "t",
                    header: t("reseller.col.totalPaid"),
                    render: (c) => (
                      <span className="font-bold text-emerald-700">{formatTzs(c.totalTzs)}</span>
                    ),
                    className: "text-right",
                  },
                  {
                    key: "l",
                    header: t("reseller.col.lastPurchase"),
                    render: (c) => (
                      <span className="text-xs text-slate-500">{formatDateTime(c.lastPurchaseAt)}</span>
                    ),
                  },
                ]}
              />
            )}
          </ResourceView>
        </div>
      </Card>
    </div>
  );
}

export function ResellerOrdersScreen() {
  const { t } = useI18n();
  const orders = useResource<Order[]>("/reseller/orders");
  const [filterState, setFilterState] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const orderList = orders.data ?? [];
  const settledOrders = orderList.filter((o) => SETTLED_PAYMENT_STATES.has(o.paymentState));
  const totalVolume = settledOrders.reduce((acc, o) => acc + (Number(o.amountTzs) || 0), 0);
  const pendingOrders = orderList.filter((o) => o.paymentState === "UNPAID");

  /** Payment-state filter chips, labelled through the shared enum vocabulary. */
  const orderFilters = [
    { value: "ALL", label: t("reseller.filter.all") },
    { value: "UNPAID", label: paymentStateLabel(t, "UNPAID") },
    { value: "PAID", label: paymentStateLabel(t, "PAID") },
    { value: "OVERPAID", label: paymentStateLabel(t, "OVERPAID") },
    { value: "NEEDS_REVIEW", label: paymentStateLabel(t, "NEEDS_REVIEW") },
    { value: "REFUND_PENDING", label: paymentStateLabel(t, "REFUND_PENDING") },
    { value: "REFUNDED", label: paymentStateLabel(t, "REFUNDED") },
    { value: "CANCELLED", label: paymentStateLabel(t, "CANCELLED") },
  ];

  const filteredOrders = orderList.filter((o) => {
    if (filterState !== "ALL" && o.paymentState !== filterState) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const phone = o.customer?.phone?.toLowerCase() ?? "";
      const name = `${o.customer?.firstName ?? ""} ${o.customer?.lastName ?? ""}`.toLowerCase();
      const pkg = o.priceSnapshot.name?.toLowerCase() ?? "";
      const ref = o.id.toLowerCase();
      if (!phone.includes(q) && !name.includes(q) && !pkg.includes(q) && !ref.includes(q)) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-advo-blue/10 px-2.5 py-0.5 text-xs font-semibold text-advo-blue">
            <Receipt className="h-3.5 w-3.5" />
            {t("reseller.orders.badge")}
          </span>
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs font-medium text-slate-500">M-Pesa, Airtel Money, TigoPesa, HaloPesa</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-advo-text sm:text-3xl">{t("nav.payments")}</h1>
        <p className="mt-1 text-sm text-advo-muted">{t("reseller.orders.subtitle")}</p>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t("reseller.orders.kpi.grossVolume")}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">{formatTzs(totalVolume)}</div>
          <p className="mt-1 text-xs text-slate-500">{t("reseller.orders.kpi.grossVolumeHint")}</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t("reseller.orders.kpi.paidOrders")}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-advo-blue">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-advo-text">{settledOrders.length}</div>
          <p className="mt-1 text-xs text-slate-500">{t("reseller.orders.kpi.paidOrdersHint")}</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t("reseller.orders.kpi.pending")}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-advo-gold">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-advo-gold">{pendingOrders.length}</div>
          <p className="mt-1 text-xs text-slate-500">{t("reseller.orders.kpi.pendingHint")}</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t("reseller.orders.kpi.attempts")}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Receipt className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-advo-text">{orderList.length}</div>
          <p className="mt-1 text-xs text-slate-500">{t("reseller.orders.kpi.attemptsHint")}</p>
        </Card>
      </div>

      {/* Orders Table Container */}
      <Card className="p-6">
        {/* Search & Filter Bar */}
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              aria-label={t("reseller.search.label")}
              placeholder={t("reseller.search.placeholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-field border border-slate-200 bg-[var(--advo-page)] py-2 pl-9 pr-4 text-xs font-medium text-[var(--advo-text)] placeholder-slate-400 transition focus:border-[var(--advo-blue)] focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto">
            {orderFilters.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilterState(f.value)}
                className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                  filterState === f.value
                    ? "bg-[var(--advo-blue)] text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <ResourceView resource={orders}>
            {() => (
              <AdvoTable label={t("reseller.orders.tableLabel")}
                rows={filteredOrders}
                rowKey={(o) => o.id}
                empty={t("reseller.orders.empty")}
                columns={[
                  {
                    key: "d",
                    header: t("reseller.col.date"),
                    render: (o) => (
                      <span className="text-xs font-medium text-slate-600">
                        {formatDateTime(o.paidAt ?? o.createdAt)}
                      </span>
                    ),
                  },
                  {
                    key: "c",
                    header: t("reseller.col.customer"),
                    render: (o) =>
                      o.customer ? (
                        <div>
                          <p className="font-bold text-advo-text">
                            {[o.customer.firstName, o.customer.lastName].filter(Boolean).join(" ") ||
                              t("reseller.customers.guest")}
                          </p>
                          <p className="text-xs text-slate-400">{o.customer.phone}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      ),
                  },
                  {
                    key: "p",
                    header: t("reseller.col.packageAndSite"),
                    render: (o) => (
                      <div>
                        <p className="font-bold text-advo-text">{o.priceSnapshot.name ?? "—"}</p>
                        <p className="text-xs text-slate-400">{o.site?.name}</p>
                      </div>
                    ),
                  },
                  {
                    key: "a",
                    header: t("reseller.col.amount"),
                    render: (o) => (
                      <span className="font-bold text-emerald-700">{formatTzs(o.amountTzs)}</span>
                    ),
                    className: "text-right",
                  },
                  {
                    key: "pay",
                    header: t("reseller.col.status"),
                    render: (o) => (
                      <div>
                        <StatusChip
                          tone={
                            SETTLED_PAYMENT_STATES.has(o.paymentState)
                              ? "success"
                              : o.paymentState === "CANCELLED" || o.paymentState === "REFUNDED"
                              ? "danger"
                              : "warning"
                          }
                        >
                          {paymentStateLabel(t, o.paymentState)}
                        </StatusChip>
                        {o.attempts[0]?.lastError ? (
                          <p className="mt-1 max-w-56 text-[11px] text-red-600">{o.attempts[0].lastError}</p>
                        ) : null}
                      </div>
                    ),
                  },
                  {
                    key: "f",
                    header: t("reseller.col.grant"),
                    render: (o) => {
                      const state = o.grant?.state ?? o.fulfillmentState;
                      const isFulfilled = state === "ACTIVE" || state === "FULFILLED";
                      const label = o.grant
                        ? grantStateLabel(t, state)
                        : fulfillmentStateLabel(t, state);
                      return (
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                            isFulfilled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {label}
                        </span>
                      );
                    },
                  },
                  {
                    key: "r",
                    header: t("reseller.col.reference"),
                    render: (o) => <Mono>{o.id.slice(0, 8)}</Mono>,
                  },
                ]}
              />
            )}
          </ResourceView>
        </div>
      </Card>
    </div>
  );
}
