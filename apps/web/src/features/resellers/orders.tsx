"use client";

import { useMemo, useState } from "react";
import { formatDateTime, formatTzs } from "@advo/api-client";
import { Card } from "@heroui/react";
import { StatusChip } from "@advo/ui";
import { PageHero, ResourceView } from "@/features/common/components";
import { fulfillmentStateLabel, grantStateLabel, paymentStateLabel } from "@/features/common/labels";
import { useI18n, type I18n } from "@/lib/i18n";
import { useResource } from "@/lib/hooks";
import {
  Receipt,
  CheckCircle2,
  Search,
  DollarSign,
  Clock,
  MapPin,
  Package,
  Phone,
  Copy,
  Check,
  AlertTriangle,
  X,
  type LucideIcon,
} from "lucide-react";

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

const SETTLED_PAYMENT_STATES = new Set(["PAID", "OVERPAID"]);
const DANGER_PAYMENT_STATES = new Set(["CANCELLED", "REFUNDED"]);

function paymentTone(state: string): "success" | "danger" | "warning" {
  if (SETTLED_PAYMENT_STATES.has(state)) return "success";
  if (DANGER_PAYMENT_STATES.has(state)) return "danger";
  return "warning";
}

function customerName(o: Order, t: I18n["t"]): string {
  if (!o.customer) return t("reseller.customers.guest");
  const name = [o.customer.firstName, o.customer.lastName].filter(Boolean).join(" ");
  return name || t("reseller.customers.guest");
}

function customerInitial(o: Order): string {
  if (!o.customer) return "?";
  const name = [o.customer.firstName, o.customer.lastName].filter(Boolean).join(" ");
  return (name || o.customer.phone || "?").slice(0, 1).toUpperCase();
}

export function ResellerOrdersScreen() {
  const { t } = useI18n();
  const orders = useResource<Order[]>("/reseller/orders");
  const [filterState, setFilterState] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const orderList = orders.data ?? [];
  const settledOrders = orderList.filter((o) => SETTLED_PAYMENT_STATES.has(o.paymentState));
  const totalVolume = settledOrders.reduce((acc, o) => acc + (Number(o.amountTzs) || 0), 0);
  const pendingOrders = orderList.filter((o) => o.paymentState === "UNPAID");
  const reviewOrders = orderList.filter((o) => o.paymentState === "NEEDS_REVIEW");

  const orderFilters = useMemo(() => {
    const count = (state: string) =>
      state === "ALL" ? orderList.length : orderList.filter((o) => o.paymentState === state).length;
    return [
      { value: "ALL", label: t("reseller.filter.all"), count: count("ALL") },
      { value: "PAID", label: paymentStateLabel(t, "PAID"), count: count("PAID") },
      { value: "UNPAID", label: paymentStateLabel(t, "UNPAID"), count: count("UNPAID") },
      { value: "NEEDS_REVIEW", label: paymentStateLabel(t, "NEEDS_REVIEW"), count: count("NEEDS_REVIEW") },
      { value: "OVERPAID", label: paymentStateLabel(t, "OVERPAID"), count: count("OVERPAID") },
      { value: "REFUND_PENDING", label: paymentStateLabel(t, "REFUND_PENDING"), count: count("REFUND_PENDING") },
      { value: "REFUNDED", label: paymentStateLabel(t, "REFUNDED"), count: count("REFUNDED") },
      { value: "CANCELLED", label: paymentStateLabel(t, "CANCELLED"), count: count("CANCELLED") },
    ];
  }, [orderList, t]);

  const term = searchQuery.trim().toLowerCase();
  const filteredOrders = useMemo(
    () =>
      orderList.filter((o) => {
        if (filterState !== "ALL" && o.paymentState !== filterState) return false;
        if (!term) return true;
        const phone = o.customer?.phone?.toLowerCase() ?? "";
        const name = `${o.customer?.firstName ?? ""} ${o.customer?.lastName ?? ""}`.toLowerCase();
        const pkg = o.priceSnapshot.name?.toLowerCase() ?? "";
        const site = o.site?.name?.toLowerCase() ?? "";
        const ref = o.id.toLowerCase();
        return phone.includes(term) || name.includes(term) || pkg.includes(term) || site.includes(term) || ref.includes(term);
      }),
    [orderList, filterState, term],
  );

  function copyRef(id: string) {
    void navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHero
        eyebrow={t("reseller.orders.badge")}
        title={t("nav.payments")}
        description={t("reseller.orders.subtitle")}
        icon={<Receipt />}
        iconTone="accent"
        meta={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-advo-border bg-white px-2.5 py-0.5 text-[11px] font-semibold text-advo-muted">
            M-Pesa · Tigo Pesa · Airtel · HaloPesa
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          hint={t("reseller.orders.kpi.grossVolumeHint")}
          icon={DollarSign}
          label={t("reseller.orders.kpi.grossVolume")}
          tone="emerald"
          value={formatTzs(totalVolume)}
        />
        <KpiCard
          hint={t("reseller.orders.kpi.paidOrdersHint")}
          icon={CheckCircle2}
          label={t("reseller.orders.kpi.paidOrders")}
          tone="blue"
          value={settledOrders.length}
        />
        <KpiCard
          hint={t("reseller.orders.kpi.pendingHint")}
          icon={Clock}
          label={t("reseller.orders.kpi.pending")}
          tone="amber"
          value={pendingOrders.length}
        />
        <KpiCard
          hint={t("reseller.orders.kpi.reviewHint")}
          icon={AlertTriangle}
          label={t("reseller.orders.kpi.review")}
          tone="rose"
          value={reviewOrders.length}
        />
      </div>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-black tracking-tight text-advo-text">
              {t("reseller.orders.list.title")}
              <span className="ml-1.5 font-bold text-advo-muted">
                {t("reseller.orders.list.count", { count: filteredOrders.length })}
              </span>
            </h2>
            <p className="text-xs text-advo-muted">{t("reseller.orders.list.subtitle")}</p>
          </div>

          <div className="relative min-w-0 w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-advo-muted" />
            <input
              aria-label={t("reseller.search.label")}
              className="w-full rounded-xl border border-advo-border bg-white py-2 pl-8 pr-8 text-xs font-medium text-advo-text transition placeholder:text-advo-muted focus:border-advo-blue focus:outline-none"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("reseller.search.placeholder")}
              type="search"
              value={searchQuery}
            />
            {searchQuery ? (
              <button
                aria-label={t("reseller.orders.search.clear")}
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
          {orderFilters.map((f) => {
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

        <ResourceView resource={orders}>
          {(rows) =>
            rows.length === 0 ? (
              <Card className="border-dashed p-12 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50 text-advo-blue">
                  <Receipt className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-base font-bold text-advo-text">{t("reseller.orders.empty")}</h3>
              </Card>
            ) : filteredOrders.length === 0 ? (
              <Card className="p-8 text-center text-xs text-advo-muted">{t("reseller.orders.empty")}</Card>
            ) : (
              <div className="flex flex-col gap-2.5">
                {filteredOrders.map((o) => (
                  <OrderDetailRow
                    key={o.id}
                    copied={copiedId === o.id}
                    onCopy={() => copyRef(o.id)}
                    order={o}
                    t={t}
                  />
                ))}
              </div>
            )
          }
        </ResourceView>
      </section>
    </div>
  );
}

/** Horizontal detail row — guest + package left, amount & status right. */
function OrderDetailRow({
  order: o,
  t,
  copied,
  onCopy,
}: {
  order: Order;
  t: I18n["t"];
  copied: boolean;
  onCopy: () => void;
}) {
  const paid = SETTLED_PAYMENT_STATES.has(o.paymentState);
  const grantState = o.grant?.state ?? o.fulfillmentState;
  const grantLabel = o.grant ? grantStateLabel(t, grantState) : fulfillmentStateLabel(t, grantState);
  const grantOk = grantState === "ACTIVE" || grantState === "FULFILLED";
  const when = formatDateTime(o.paidAt ?? o.createdAt);
  const pkg = o.priceSnapshot.name ?? "—";
  const err = o.attempts[0]?.lastError ?? null;

  return (
    <Card className="overflow-hidden p-0 transition-shadow hover:shadow-advo-lift">
      <div className="flex items-center gap-3 p-3.5 sm:gap-4 sm:p-4">
        <span
          className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-sm font-black ring-1 ${
            paid
              ? "bg-emerald-50 text-emerald-700 ring-emerald-200/70"
              : o.paymentState === "NEEDS_REVIEW"
                ? "bg-amber-50 text-amber-800 ring-amber-200/70"
                : "bg-advo-blue/10 text-advo-blue ring-advo-blue/20"
          }`}
        >
          {customerInitial(o)}
          <span
            aria-hidden="true"
            className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-white ${
              paid
                ? "bg-emerald-500"
                : o.paymentState === "CANCELLED" || o.paymentState === "REFUNDED"
                  ? "bg-rose-400"
                  : "bg-amber-400"
            }`}
          />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-black tracking-tight text-advo-text" title={customerName(o, t)}>
              {customerName(o, t)}
            </h3>
            <StatusChip tone={paymentTone(o.paymentState)}>
              {paymentStateLabel(t, o.paymentState)}
            </StatusChip>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                grantOk ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
              }`}
            >
              {grantLabel}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-advo-muted">
            {o.customer?.phone ? (
              <span className="inline-flex items-center gap-1 font-semibold text-advo-text/80">
                <Phone className="h-3 w-3 text-slate-400" />
                {o.customer.phone}
              </span>
            ) : null}
            <span className="inline-flex min-w-0 items-center gap-1">
              <Package className="h-3 w-3 shrink-0 text-slate-400" />
              <span className="truncate font-semibold">{pkg}</span>
            </span>
            {o.site?.name ? (
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
                <span className="truncate font-semibold">{o.site.name}</span>
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3 text-slate-400" />
              {when}
            </span>
          </div>

          <dl className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-advo-border/70 bg-advo-page px-2 py-1">
              <span className="text-[9px] font-bold tracking-wider text-slate-400 uppercase">
                {t("reseller.col.reference")}
              </span>
              <span className="font-mono text-[10px] font-bold text-advo-text">{o.id.slice(0, 8)}</span>
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
              paid ? "text-emerald-700" : "text-advo-text"
            }`}
          >
            {formatTzs(o.amountTzs)}
          </p>
          <p className="text-[10px] font-semibold text-advo-muted">
            {paid ? t("reseller.orders.row.settled") : t("reseller.orders.row.checkout")}
          </p>
        </div>
      </div>
    </Card>
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
  value: number | string;
  hint: string;
  icon: LucideIcon;
  tone: "blue" | "emerald" | "amber" | "rose";
}) {
  const tones = {
    blue: "bg-blue-50 text-advo-blue",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-advo-gold",
    rose: "bg-rose-50 text-rose-600",
  }[tone];
  const valueTone =
    tone === "emerald"
      ? "text-emerald-600"
      : tone === "amber"
        ? "text-advo-gold"
        : tone === "rose"
          ? "text-rose-600"
          : "text-advo-text";

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
        <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${tones}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className={`mt-2 text-2xl font-bold ${valueTone}`}>{value}</div>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </Card>
  );
}
