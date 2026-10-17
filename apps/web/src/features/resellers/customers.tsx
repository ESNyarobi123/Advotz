"use client";

import { useMemo, useState } from "react";
import { formatDateTime, formatDuration, formatTzs } from "@advo/api-client";
import { Card } from "@heroui/react";
import { StatusChip, statusTone } from "@advo/ui";
import { PageHero, ResourceView } from "@/features/common/components";
import { deviceStateLabel, grantStateLabel } from "@/features/common/labels";
import { useI18n, type I18n } from "@/lib/i18n";
import { api } from "@/lib/api";
import { useResource } from "@/lib/hooks";
import {
  Users,
  Smartphone,
  Activity,
  Clock,
  Search,
  TrendingUp,
  Wifi,
  WifiOff,
  Ticket,
  CreditCard,
  Ban,
  RefreshCw,
  MapPin,
  X,
  type LucideIcon,
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

type Presence = "online" | "offline" | "expired" | "pending";
type ClientFilter = "all" | Presence | "voucher" | "payment";

const ENDED_GRANT_STATES = new Set(["EXPIRED", "QUOTA_EXHAUSTED", "REVOKED"]);

function remaining(t: I18n["t"], expiresAt: string | null): string {
  if (!expiresAt) return t("reseller.customers.remaining.notStarted");
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return t("reseller.customers.remaining.ended");
  const mins = Math.floor(ms / 60000);
  return mins >= 60
    ? t("reseller.customers.remaining.hours", { hours: Math.floor(mins / 60), minutes: mins % 60 })
    : t("reseller.customers.remaining.minutes", { minutes: mins });
}

/** Online = active grant with at least one authorized device. */
function clientPresence(g: Grant): Presence {
  if (ENDED_GRANT_STATES.has(g.state)) return "expired";
  if (g.state === "PENDING_ACTIVATION" || g.state === "ACTIVATION_FAILED") return "pending";
  if (g.state === "ACTIVE") {
    return g.devices.some((d) => d.authState === "AUTHORIZED") ? "online" : "offline";
  }
  return "offline";
}

function primaryMac(g: Grant): string {
  const authorized = g.devices.find((d) => d.authState === "AUTHORIZED");
  return authorized?.clientMac ?? g.devices[0]?.clientMac ?? "—";
}

export function ResellerCustomersScreen() {
  const { t } = useI18n();
  const grants = useResource<Grant[]>("/reseller/grants");
  const customers = useResource<Customer[]>("/reseller/customers");
  const [filter, setFilter] = useState<ClientFilter>("all");
  const [query, setQuery] = useState("");

  const grantList = grants.data ?? [];
  const customerList = customers.data ?? [];

  const onlineCount = grantList.filter((g) => clientPresence(g) === "online").length;
  const offlineCount = grantList.filter((g) => clientPresence(g) === "offline").length;
  const expiredCount = grantList.filter((g) => clientPresence(g) === "expired").length;
  const totalDevicesOnline = grantList.reduce(
    (acc, g) => acc + g.devices.filter((d) => d.authState === "AUTHORIZED").length,
    0,
  );
  const totalCustomerSpend = customerList.reduce((acc, c) => acc + (Number(c.totalTzs) || 0), 0);

  const term = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      grantList.filter((g) => {
        const presence = clientPresence(g);
        if (filter === "online" && presence !== "online") return false;
        if (filter === "offline" && presence !== "offline") return false;
        if (filter === "expired" && presence !== "expired") return false;
        if (filter === "pending" && presence !== "pending") return false;
        if (filter === "voucher" && !g.voucherId) return false;
        if (filter === "payment" && !g.orderId) return false;
        if (!term) return true;
        const hay = [
          g.packageSnapshot.name ?? "",
          g.site.name,
          g.id,
          ...g.devices.map((d) => d.clientMac),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(term);
      }),
    [grantList, filter, term],
  );

  const filters: Array<{ key: ClientFilter; label: string; count?: number }> = [
    { key: "all", label: t("reseller.customers.filter.all"), count: grantList.length },
    { key: "online", label: t("reseller.customers.filter.online"), count: onlineCount },
    { key: "offline", label: t("reseller.customers.filter.offline"), count: offlineCount },
    { key: "expired", label: t("reseller.customers.filter.expired"), count: expiredCount },
    {
      key: "pending",
      label: t("reseller.customers.filter.pending"),
      count: grantList.filter((g) => clientPresence(g) === "pending").length,
    },
    {
      key: "voucher",
      label: t("reseller.customers.filter.voucher"),
      count: grantList.filter((g) => Boolean(g.voucherId)).length,
    },
    {
      key: "payment",
      label: t("reseller.customers.filter.payment"),
      count: grantList.filter((g) => Boolean(g.orderId)).length,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHero
        eyebrow={t("reseller.customers.badge")}
        title={t("reseller.customers.title")}
        description={t("reseller.customers.subtitle")}
        icon={<Users />}
        iconTone="accent"
        meta={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-advo-border bg-white px-2.5 py-0.5 text-[11px] font-semibold text-advo-muted">
            <Activity className="h-3 w-3 text-advo-blue" />
            {t("reseller.customers.sync")}
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          hint={t("reseller.customers.kpi.activeSessionsHint")}
          icon={Wifi}
          label={t("reseller.customers.kpi.activeSessions")}
          tone="emerald"
          value={onlineCount}
        />
        <KpiCard
          hint={t("reseller.customers.kpi.onlineDevicesHint")}
          icon={Smartphone}
          label={t("reseller.customers.kpi.onlineDevices")}
          tone="blue"
          value={totalDevicesOnline}
        />
        <KpiCard
          hint={t("reseller.customers.kpi.expiredHint")}
          icon={Ban}
          label={t("reseller.customers.kpi.expired")}
          tone="rose"
          value={expiredCount}
        />
        <KpiCard
          hint={t("reseller.customers.kpi.totalSpendHint")}
          icon={TrendingUp}
          label={t("reseller.customers.kpi.totalSpend")}
          tone="amber"
          value={formatTzs(totalCustomerSpend)}
        />
      </div>

      {/* Filters + search */}
      <section className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-black tracking-tight text-advo-text">
              {t("reseller.customers.list.title")}
              <span className="ml-1.5 font-bold text-advo-muted">
                {t("reseller.customers.list.count", { count: visible.length })}
              </span>
            </h2>
          </div>

          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-advo-muted" />
              <input
                aria-label={t("reseller.customers.search.placeholder")}
                className="w-full rounded-xl border border-advo-border bg-white py-2 pl-8 pr-8 text-xs font-medium text-advo-text transition placeholder:text-advo-muted focus:border-advo-blue focus:outline-none"
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("reseller.customers.search.placeholder")}
                type="search"
                value={query}
              />
              {query ? (
                <button
                  aria-label={t("reseller.customers.search.clear")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-advo-muted hover:bg-slate-100"
                  onClick={() => setQuery("")}
                  type="button"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {filters.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(f.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${
                  active
                    ? "border-advo-blue bg-advo-blue text-white shadow-sm"
                    : "border-advo-border bg-white text-advo-muted hover:border-advo-blue/40 hover:text-advo-text"
                }`}
              >
                {f.label}
                {typeof f.count === "number" ? (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                      active ? "bg-white/20 text-white" : "bg-advo-page text-advo-text"
                    }`}
                  >
                    {f.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <ResourceView resource={grants}>
          {(rows) =>
            rows.length === 0 ? (
              <Card className="border-dashed p-12 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50 text-advo-blue">
                  <Users className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-base font-bold text-advo-text">
                  {t("reseller.customers.guestAccess.empty")}
                </h3>
              </Card>
            ) : visible.length === 0 ? (
              <Card className="p-8 text-center text-xs text-advo-muted">
                {term
                  ? t("reseller.customers.search.noMatch", { query })
                  : t("reseller.customers.guestAccess.empty")}
              </Card>
            ) : (
              <div className="flex flex-col gap-2.5">
                {visible.map((g) => (
                  <ClientDetailRow
                    key={g.id}
                    grant={g}
                    onReload={grants.reload}
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

/** Horizontal detail row — client identity + presence left, revoke/retry far right. */
function ClientDetailRow({
  grant: g,
  t,
  onReload,
}: {
  grant: Grant;
  t: I18n["t"];
  onReload: () => void | Promise<void>;
}) {
  const presence = clientPresence(g);
  const mac = primaryMac(g);
  const packageName = g.packageSnapshot.name ?? t("reseller.col.package");
  const isPayment = Boolean(g.orderId);
  const sourceLabel = isPayment
    ? t("reseller.customers.source.mobilePayment")
    : t("reseller.customers.source.voucher");
  const SourceIcon = isPayment ? CreditCard : Ticket;

  const presenceStyle = {
    online: {
      iconWrap: "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/70",
      dot: "bg-emerald-500",
      chip: "success" as const,
    },
    offline: {
      iconWrap: "bg-slate-100 text-slate-500 ring-1 ring-slate-200/80",
      dot: "bg-slate-400",
      chip: "default" as const,
    },
    expired: {
      iconWrap: "bg-rose-50 text-rose-600 ring-1 ring-rose-200/70",
      dot: "bg-rose-400",
      chip: "danger" as const,
    },
    pending: {
      iconWrap: "bg-amber-50 text-amber-700 ring-1 ring-amber-200/70",
      dot: "bg-amber-400",
      chip: "warning" as const,
    },
  }[presence];

  const PresenceIcon = presence === "online" ? Wifi : presence === "expired" ? Ban : WifiOff;

  return (
    <Card className="overflow-hidden p-0 transition-shadow hover:shadow-advo-lift">
      <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${presenceStyle.iconWrap}`}>
            <PresenceIcon className="h-5 w-5" />
            <span
              aria-hidden="true"
              className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-white ${presenceStyle.dot}`}
            />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-black tracking-tight text-advo-text" title={packageName}>
                {packageName}
              </h3>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  isPayment
                    ? "bg-advo-blue/10 text-advo-blue ring-1 ring-advo-blue/20"
                    : "bg-advo-gold-soft text-[#b15f00] ring-1 ring-advo-gold/30"
                }`}
              >
                <SourceIcon className="h-3 w-3" />
                {sourceLabel}
              </span>
              <StatusChip tone={presenceStyle.chip}>
                {t(`reseller.customers.presence.${presence}`)}
              </StatusChip>
              <StatusChip tone={statusTone(g.state)}>{grantStateLabel(t, g.state)}</StatusChip>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-advo-muted">
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
                <span className="truncate font-semibold text-advo-text/80">{g.site.name}</span>
              </span>
              <span className="inline-flex items-center gap-1 font-mono text-advo-text/80">
                <Smartphone className="h-3 w-3 text-slate-400" />
                <span className="select-all">{mac}</span>
              </span>
            </div>

            <dl className="mt-2 flex flex-wrap items-center gap-1.5">
              <FactChip
                icon={Clock}
                label={t("reseller.col.timeRemaining")}
                value={
                  g.state === "ACTIVE"
                    ? remaining(t, g.expiresAt)
                    : formatDuration(g.durationSeconds)
                }
                tone={presence === "online" ? "emerald" : "default"}
              />
              <FactChip
                icon={Smartphone}
                label={t("reseller.col.devices")}
                value={t("reseller.customers.deviceSlots", {
                  used: g.devices.length,
                  total: g.maxDevices,
                })}
              />
              {g.devices.slice(0, 2).map((d) => (
                <span
                  key={d.id}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold ${
                    d.authState === "AUTHORIZED"
                      ? "border-emerald-200/70 bg-emerald-50/60 text-emerald-700"
                      : "border-advo-border/70 bg-advo-page text-advo-muted"
                  }`}
                  title={d.clientMac}
                >
                  {deviceStateLabel(t, d.authState)}
                </span>
              ))}
            </dl>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-1 border-t border-advo-border/60 pt-2.5 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-3">
          {g.devices
            .filter(
              (d) =>
                ["FAILED", "UNKNOWN"].includes(d.authState) &&
                g.state !== "REVOKED" &&
                g.state !== "EXPIRED",
            )
            .slice(0, 1)
            .map((d) => (
              <RowIconButton
                key={d.id}
                icon={RefreshCw}
                label={t("reseller.customers.retry")}
                onPress={() => {
                  void api.post(`/reseller/grant-devices/${d.id}/retry`).then(() => onReload());
                }}
              />
            ))}
          {["ACTIVE", "PENDING_ACTIVATION"].includes(g.state) ? (
            <RowIconButton
              icon={Ban}
              label={t("reseller.customers.revoke")}
              tone="danger"
              onPress={() => {
                const reason = window.prompt(t("reseller.customers.revokeReason"));
                if (!reason || reason.trim().length < 3) return;
                void api
                  .post(`/reseller/grants/${g.id}/revoke`, { reason: reason.trim() })
                  .then(() => onReload());
              }}
            />
          ) : null}
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
  const valueTone = tone === "emerald" ? "text-emerald-600" : tone === "rose" ? "text-rose-600" : "text-advo-text";

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

function FactChip({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: "default" | "emerald";
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 ${
        tone === "emerald"
          ? "border-emerald-200/70 bg-emerald-50/60"
          : "border-advo-border/70 bg-advo-page"
      }`}
    >
      <Icon
        className={`h-3 w-3 shrink-0 ${tone === "emerald" ? "text-emerald-600" : "text-advo-muted"}`}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
      <span
        className={`truncate text-[10px] font-bold ${
          tone === "emerald" ? "text-emerald-700" : "text-advo-text"
        }`}
        title={`${label}: ${value}`}
      >
        {value}
      </span>
    </span>
  );
}

function RowIconButton({
  icon: Icon,
  label,
  onPress,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      aria-label={label}
      className={`grid size-9 place-items-center rounded-xl transition ${
        tone === "danger"
          ? "text-rose-500 hover:bg-rose-50 hover:text-rose-600"
          : "text-advo-muted hover:bg-advo-page hover:text-advo-text"
      }`}
      onClick={onPress}
      title={label}
      type="button"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

