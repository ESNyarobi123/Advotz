"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatDateTime, formatTzs } from "@advo/api-client";
import { Button, Card } from "@heroui/react";
import { AdvoKpi, Notice, SoftIcon, StatusChip } from "@advo/ui";
import {
  ArrowLeft,
  Building2,
  CircleDollarSign,
  CreditCard,
  History,
  Landmark,
  LogIn,
  MapPin,
  Receipt,
  ShieldCheck,
  TriangleAlert,
  UserCog,
  UserRound,
  Wallet,
  Wifi,
} from "lucide-react";
import { PageHero, ResourceView, SectionHeader } from "@/features/common/components";
import { OperatorDialog, resellerOperatorCopy, useOperatorActions } from "@/features/admin/operator-dialog";
import { useResource } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

/* ─────────────────────────── Response shape ─────────────────────────── */

type Owner = {
  id: string;
  email: string;
  phone: string | null;
  name: string;
  status: string;
  role: string;
  emailVerifiedAt: string | null;
  mfaEnabled: boolean;
  createdAt: string;
};

type Plan = {
  code: string;
  name: string;
  priceTzs: string;
  periodDays: number;
  maxSites: number;
  maxDevices: number;
  maxPackages: number;
  trialEligible: boolean;
  trialDays: number | null;
} | null;

type Subscription = {
  state: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  suspendedReason: string | null;
  entitlements: unknown;
  plan: Plan;
} | null;

type Site = {
  id: string;
  name: string;
  location: string | null;
  state: string;
  createdAt: string;
  mapping: { remoteName: string; state: string; lastError: string | null; controller: { name: string; mode: string; healthStatus: string } | null } | null;
  _count: { devices: number };
};

type Device = {
  id: string;
  name: string | null;
  mac: string;
  model: string | null;
  firmware: string | null;
  hardwareVersion: string | null;
  observedStatus: string;
  lastSeenAt: string | null;
  site: { name: string };
  controller: { name: string } | null;
};

type Order = {
  id: string;
  purpose: string;
  amountTzs: string;
  paymentState: string;
  fulfillmentState: string;
  paidAt: string | null;
  createdAt: string;
  site: { name: string } | null;
  customer: { phone: string; firstName: string | null; lastName: string | null } | null;
  attempts: Array<{ provider: string; state: string; providerReference: string | null }>;
};

type Invoice = {
  id: string;
  amountTzs: string;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
  paidAt: string | null;
  createdAt: string;
};

type Withdrawal = {
  id: string;
  amountTzs: string;
  totalDebitTzs: string;
  state: string;
  reviewReason: string | null;
  createdAt: string;
  destinationSnapshot: { recipientName?: string; phone?: string } | null;
};

type Activity = {
  id: string;
  action: string;
  targetType: string;
  reason: string | null;
  createdAt: string;
  actor: { email: string; role: string } | null;
};

export type ResellerDetail = {
  reseller: {
    id: string;
    businessName: string;
    slug: string;
    status: string;
    registrationSource: string;
    onboardingStep: string;
    createdAt: string;
    owner: Owner;
    attribution: { source: string; reason: string | null; agent: { referralCode: string; user: { name: string; email: string } } } | null;
    subscription: Subscription;
    sites: Site[];
    devices: Device[];
    _count: { sites: number; devices: number; customers: number; orders: number; packages: number; voucherGroups: number };
  };
  wallet: { availableTzs: string; pendingTzs: string; reservedTzs: string };
  kpis: {
    guestRevenueTzs: string;
    guestOrders: number;
    todayRevenueTzs: string;
    todayOrders: number;
    subscriptionPaidTzs: string;
    subscriptionInvoices: number;
  };
  orders: Order[];
  invoices: Invoice[];
  withdrawals: Withdrawal[];
  activity: Activity[];
};

type TabKey = "profile" | "plan" | "devices" | "payments" | "activity";

const TAB_ORDER = ["profile", "plan", "devices", "payments", "activity"] as const;
const TAB_LABEL = {
  profile: "admin.resellers.tab.profile",
  plan: "admin.resellers.tab.plan",
  devices: "admin.resellers.tab.devices",
  payments: "admin.resellers.tab.payments",
  activity: "admin.resellers.tab.activity",
} as const;

export function AdminResellerDetailScreen({ resellerId }: { resellerId: string }) {
  const { t } = useI18n();
  const resource = useResource<ResellerDetail | null>(`/admin/resellers/${resellerId}`);
  const [tab, setTab] = useState<TabKey>("profile");

  const detail = resource.data;
  const reseller = detail?.reseller;
  const suspended = reseller?.status === "SUSPENDED" || reseller?.status === "CLOSED";

  const operator = useOperatorActions({
    basePath: `/admin/resellers/${resellerId}`,
    copy: resellerOperatorCopy(t, reseller?.businessName ?? ""),
    onChanged: () => resource.reload(),
    redirectTo: "/reseller",
    showAttribution: true,
    target: { displayName: reseller?.businessName ?? "", suspended, attributionCode: reseller?.attribution?.agent?.referralCode },
  });

  const tabCounts = useMemo<Record<TabKey, number | undefined>>(() => {
    if (!detail) return { profile: undefined, plan: undefined, devices: undefined, payments: undefined, activity: undefined };
    return {
      profile: undefined,
      plan: detail.invoices.length,
      devices: detail.reseller._count.devices,
      payments: detail.orders.length,
      activity: detail.activity.length,
    };
  }, [detail]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-4">
      <Link
        className="inline-flex items-center gap-1.5 text-xs font-bold text-advo-muted hover:text-advo-blue"
        href="/admin/resellers"
      >
        <ArrowLeft className="size-3.5" />
        {t("admin.resellers.detail.back")}
      </Link>

      <ResourceView resource={resource}>
        {() =>
          !reseller ? (
            <Notice tone="danger">{t("admin.resellers.detail.notFound")}</Notice>
          ) : (
            <>
              <PageHero
                actions={
                  <>
                    <Button
                      isDisabled={operator.busy !== null}
                      onPress={() => operator.open("impersonate")}
                      size="sm"
                      type="button"
                      variant="primary"
                    >
                      <LogIn className="size-4" />
                      {operator.busy === "impersonate" ? "…" : t("admin.resellers.action.impersonate")}
                    </Button>
                    <Button
                      isDisabled={operator.busy !== null}
                      onPress={() => operator.open("attribution")}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <UserCog className="size-4" />
                      {t("admin.resellers.action.attribution")}
                    </Button>
                    <Button
                      isDisabled={operator.busy !== null}
                      onPress={() => operator.open("status")}
                      size="sm"
                      type="button"
                      variant={suspended ? "outline" : "danger-soft"}
                    >
                      {suspended ? <Wifi className="size-4" /> : <TriangleAlert className="size-4" />}
                      {operator.busy === "status"
                        ? "…"
                        : suspended
                          ? t("admin.resellers.action.reactivate")
                          : t("admin.resellers.action.suspend")}
                    </Button>
                  </>
                }
                description={
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <UserRound className="size-3.5" />
                    <span className="font-semibold text-advo-text">{reseller.owner.name}</span>
                    <span>{reseller.owner.email}</span>
                    {reseller.owner.phone ? <span>· {reseller.owner.phone}</span> : null}
                  </span>
                }
                eyebrow={t("admin.resellers.eyebrow")}
                icon={<Building2 />}
                iconTone={suspended ? "danger" : "accent"}
                meta={
                  <>
                    <StatusChip size="md">{reseller.status}</StatusChip>
                    {reseller.subscription ? <StatusChip size="md">{reseller.subscription.state}</StatusChip> : null}
                    <span className="rounded-full border border-[var(--advo-border)] bg-white/70 px-2.5 py-1 font-mono text-[11px] text-advo-muted">
                      {reseller.slug}
                    </span>
                  </>
                }
                title={reseller.businessName}
              />

              {operator.error ? <Notice tone="danger">{operator.error}</Notice> : null}

              {/* ── Money at a glance ── */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <AdvoKpi
                  hint={t("admin.resellers.detail.kpi.guestRevenueHint", { count: detail.kpis.guestOrders })}
                  icon={<CircleDollarSign />}
                  iconTone="success"
                  label={t("admin.resellers.detail.kpi.guestRevenue")}
                  value={formatTzs(detail.kpis.guestRevenueTzs)}
                />
                <AdvoKpi
                  hint={t("admin.resellers.detail.kpi.todayHint", { count: detail.kpis.todayOrders })}
                  icon={<Receipt />}
                  iconTone="gold"
                  label={t("admin.resellers.detail.kpi.today")}
                  value={formatTzs(detail.kpis.todayRevenueTzs)}
                />
                <AdvoKpi
                  hint={t("admin.resellers.detail.kpi.subscriptionHint", { count: detail.kpis.subscriptionInvoices })}
                  icon={<CreditCard />}
                  iconTone="violet"
                  label={t("admin.resellers.detail.kpi.subscription")}
                  value={formatTzs(detail.kpis.subscriptionPaidTzs)}
                />
                <AdvoKpi
                  hint={t("admin.resellers.detail.kpi.walletHint", {
                    pending: formatTzs(detail.wallet.pendingTzs),
                    reserved: formatTzs(detail.wallet.reservedTzs),
                  })}
                  icon={<Wallet />}
                  iconTone="teal"
                  label={t("admin.resellers.detail.kpi.wallet")}
                  value={formatTzs(detail.wallet.availableTzs)}
                />
              </div>

              {/* ── Tabs ── */}
              <div
                aria-label={reseller.businessName}
                className="flex gap-1 overflow-x-auto rounded-card border border-[var(--advo-border)] bg-white p-1.5 shadow-advo-card"
                role="tablist"
              >
                {TAB_ORDER.map((key) => (
                  <button
                    aria-selected={tab === key}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-[9px] px-3.5 py-2 text-xs font-bold transition-colors ${
                      tab === key ? "bg-advo-blue text-white" : "text-advo-muted hover:bg-advo-blue-soft hover:text-advo-blue"
                    }`}
                    key={key}
                    onClick={() => setTab(key)}
                    role="tab"
                    type="button"
                  >
                    {TAB_ICONS[key]}
                    {t(TAB_LABEL[key])}
                    {tabCounts[key] !== undefined ? (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                          tab === key ? "bg-white/25" : "bg-advo-surface-soft"
                        }`}
                      >
                        {tabCounts[key]}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>

              {tab === "profile" ? <ProfileTab detail={detail} /> : null}
              {tab === "plan" ? <PlanTab detail={detail} /> : null}
              {tab === "devices" ? <DevicesTab detail={detail} /> : null}
              {tab === "payments" ? <PaymentsTab detail={detail} /> : null}
              {tab === "activity" ? <ActivityTab detail={detail} /> : null}
            </>
          )
        }
      </ResourceView>

      {reseller ? <OperatorDialog actions={operator} /> : null}
    </div>
  );
}

const TAB_ICONS: Record<TabKey, React.ReactNode> = {
  profile: <UserRound className="size-3.5" />,
  plan: <CreditCard className="size-3.5" />,
  devices: <Wifi className="size-3.5" />,
  payments: <CircleDollarSign className="size-3.5" />,
  activity: <History className="size-3.5" />,
};

/** Panel wrapper: one heading, one white card, consistent rhythm across tabs. */
function Panel({
  title,
  description,
  icon,
  iconTone,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon: React.ReactNode;
  iconTone: "accent" | "gold" | "success" | "warning" | "danger" | "violet" | "teal";
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70">
      <SectionHeader description={description} icon={icon} iconTone={iconTone} title={title} />
      {children}
    </Card>
  );
}

/** Definition-list row used by the profile and plan tabs. */
function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--advo-border)] py-2.5 last:border-b-0">
      <span className="text-xs font-semibold text-advo-muted">{label}</span>
      <span className="min-w-0 text-right text-sm text-advo-text">{children}</span>
    </div>
  );
}

/* ─────────────────────────────── Tabs ─────────────────────────────── */

function ProfileTab({ detail }: { detail: ResellerDetail }) {
  const { t } = useI18n();
  const r = detail.reseller;
  const owner = r.owner;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Panel
          description={t("admin.resellers.profile.description")}
          icon={<UserRound />}
          iconTone="accent"
          title={t("admin.resellers.profile.title")}
        >
          <div>
            <Row label={t("admin.resellers.col.business")}>
              <span className="font-bold">{r.businessName}</span>
            </Row>
            <Row label={t("admin.resellers.detail.owner")}>
              <span className="font-semibold">{owner.name}</span>
            </Row>
            <Row label={t("admin.resellers.create.email")}>
              <span className="flex flex-wrap items-center justify-end gap-1.5">
                {owner.email}
                {owner.emailVerifiedAt ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-advo-success-soft px-2 py-0.5 text-[10px] font-bold text-[#166534]">
                    <ShieldCheck className="size-3" />
                    {t("admin.resellers.profile.verified")}
                  </span>
                ) : (
                  <span className="rounded-full bg-advo-warning-soft px-2 py-0.5 text-[10px] font-bold text-[#b45309]">
                    {t("admin.resellers.profile.unverified")}
                  </span>
                )}
              </span>
            </Row>
            <Row label={t("admin.resellers.create.phone")}>{owner.phone ?? "—"}</Row>
            <Row label={t("admin.resellers.detail.slug")}>
              <span className="font-mono text-xs">{r.slug}</span>
            </Row>
            <Row label={t("admin.resellers.detail.source")}>
              <span className="rounded-md bg-advo-surface-soft px-1.5 py-0.5 text-[11px] font-bold text-advo-muted">
                {r.registrationSource.replace(/_/g, " ")}
              </span>
            </Row>
            <Row label={t("admin.resellers.detail.onboarding")}>
              <StatusChip>{r.onboardingStep}</StatusChip>
            </Row>
            <Row label={t("admin.resellers.col.status")}>
              <StatusChip>{r.status}</StatusChip>
            </Row>
            <Row label={t("admin.resellers.profile.mfa")}>
              <span className="text-xs font-semibold">
                {owner.mfaEnabled ? t("admin.resellers.profile.mfaOn") : t("admin.resellers.profile.mfaOff")}
              </span>
            </Row>
            <Row label={t("admin.resellers.detail.joined")}>{formatDateTime(r.createdAt)}</Row>
          </div>
        </Panel>
      </div>

      <div className="space-y-5">
        <Panel
          description={t("admin.resellers.col.referred")}
          icon={<UserCog />}
          iconTone="gold"
          title={t("admin.resellers.profile.attribution")}
        >
          {r.attribution?.agent ? (
            <div className="flex items-center gap-3 rounded-xl bg-advo-gold-soft p-4">
              <SoftIcon tone="gold">
                <UserCog />
              </SoftIcon>
              <div className="min-w-0">
                <p className="font-mono text-sm font-black text-[#8a5a00]">{r.attribution.agent.referralCode}</p>
                <p className="truncate text-xs text-[#8a5a00]/80">{r.attribution.agent.user.name}</p>
                <p className="truncate text-[11px] text-[#8a5a00]/70">{r.attribution.agent.user.email}</p>
              </div>
            </div>
          ) : (
            <p className="rounded-xl bg-advo-surface-soft p-4 text-xs text-advo-muted">
              {t("admin.resellers.profile.attributionNone")}
            </p>
          )}
        </Panel>

        <Panel
          description={t("admin.resellers.profile.limits")}
          icon={<MapPin />}
          iconTone="teal"
          title={t("admin.resellers.profile.limits")}
        >
          <div className="grid grid-cols-2 gap-3">
            <Mini label={t("admin.resellers.col.network")} value={t("admin.resellers.network", { sites: r._count.sites, devices: r._count.devices })} />
            <Mini label={t("admin.resellers.col.plan")} value={r.subscription?.plan?.name ?? "—"} />
            <Mini label={t("admin.resellers.profile.customers")} value={String(r._count.customers)} />
            <Mini label={t("admin.resellers.profile.orders")} value={String(r._count.orders)} />
            <Mini label={t("admin.resellers.profile.packages")} value={String(r._count.packages)} />
            <Mini label={t("admin.resellers.plan.maxDevices")} value={r.subscription?.plan ? String(r.subscription.plan.maxDevices) : "—"} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function PlanTab({ detail }: { detail: ResellerDetail }) {
  const { t } = useI18n();
  const sub = detail.reseller.subscription;

  if (!sub) {
    return (
      <Panel
        description={t("admin.resellers.plan.description")}
        icon={<CreditCard />}
        iconTone="violet"
        title={t("admin.resellers.plan.title")}
      >
        <p className="rounded-xl bg-advo-surface-soft p-4 text-xs text-advo-muted">{t("admin.resellers.plan.none")}</p>
      </Panel>
    );
  }

  const plan = sub.plan;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel
          description={t("admin.resellers.plan.description")}
          icon={<CreditCard />}
          iconTone="violet"
          title={t("admin.resellers.plan.title")}
        >
          <div className="flex items-start justify-between gap-3 rounded-xl bg-advo-violet-soft p-4">
            <div>
              <p className="text-lg font-black text-advo-violet">{plan?.name ?? "—"}</p>
              <p className="font-mono text-[11px] text-advo-violet/70">{plan?.code ?? ""}</p>
            </div>
            <StatusChip size="md">{sub.state}</StatusChip>
          </div>
          <div className="mt-2">
            <Row label={t("admin.resellers.plan.price")}>
              <span className="font-bold tabular-nums">{plan ? formatTzs(plan.priceTzs) : "—"}</span>
            </Row>
            <Row label={t("admin.resellers.plan.billingCycle")}>
              {plan ? t("admin.resellers.plan.period_days", { days: plan.periodDays }) : "—"}
            </Row>
            <Row label={t("admin.resellers.plan.period")}>
              {sub.currentPeriodStart || sub.currentPeriodEnd
                ? t("admin.resellers.plan.periodValue", {
                    start: formatDateTime(sub.currentPeriodStart),
                    end: formatDateTime(sub.currentPeriodEnd),
                  })
                : "—"}
            </Row>
            {sub.suspendedReason ? (
              <Row label={t("admin.resellers.plan.suspendedReason")}>
                <span className="text-[#b91c1c]">{sub.suspendedReason}</span>
              </Row>
            ) : null}
          </div>
        </Panel>

        <Panel
          description={t("admin.resellers.profile.limits")}
          icon={<MapPin />}
          iconTone="teal"
          title={t("admin.resellers.profile.limits")}
        >
          <div className="grid grid-cols-2 gap-3">
            <Mini label={t("admin.resellers.plan.maxSites")} value={plan ? String(plan.maxSites) : "—"} />
            <Mini label={t("admin.resellers.plan.maxDevices")} value={plan ? String(plan.maxDevices) : "—"} />
            <Mini label={t("admin.resellers.plan.maxPackages")} value={plan ? String(plan.maxPackages) : "—"} />
            <Mini label={t("admin.resellers.plan.trial")} value={plan?.trialEligible ? "Yes" : "No"} />
          </div>
        </Panel>

        <Panel
          description={t("admin.resellers.detail.kpi.subscriptionHint", { count: detail.kpis.subscriptionInvoices })}
          icon={<Landmark />}
          iconTone="success"
          title={t("admin.resellers.detail.kpi.subscription")}
        >
          <p className="text-2xl font-black tabular-nums text-advo-text">{formatTzs(detail.kpis.subscriptionPaidTzs)}</p>
          <p className="text-xs text-advo-muted">
            {detail.reseller._count.sites} / {plan ? plan.maxSites : "—"} sites · {detail.reseller._count.devices} /{" "}
            {plan ? plan.maxDevices : "—"} devices
          </p>
        </Panel>
      </div>

      <Panel
        description={t("admin.resellers.plan.invoicesDescription")}
        icon={<Receipt />}
        iconTone="accent"
        title={t("admin.resellers.plan.invoices")}
      >
        {detail.invoices.length === 0 ? (
          <p className="rounded-xl bg-advo-surface-soft p-4 text-xs text-advo-muted">{t("admin.resellers.plan.invoicesEmpty")}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--advo-border)] text-left text-[10px] font-bold tracking-wider text-advo-muted uppercase">
                  <th className="py-2 pr-3">{t("admin.resellers.col.invoice")}</th>
                  <th className="py-2 pr-3">{t("admin.resellers.col.amount")}</th>
                  <th className="py-2 pr-3">{t("admin.resellers.col.status")}</th>
                  <th className="py-2 pr-3">{t("admin.resellers.col.period")}</th>
                  <th className="py-2">{t("admin.resellers.col.paidAt")}</th>
                </tr>
              </thead>
              <tbody>
                {detail.invoices.map((invoice) => (
                  <tr className="border-b border-[var(--advo-border)]/60 last:border-b-0" key={invoice.id}>
                    <td className="py-2.5 pr-3 font-mono text-[11px] text-advo-muted">{invoice.id.slice(0, 8)}</td>
                    <td className="py-2.5 pr-3 font-bold tabular-nums">{formatTzs(invoice.amountTzs)}</td>
                    <td className="py-2.5 pr-3">
                      <StatusChip>{invoice.status}</StatusChip>
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-advo-muted">
                      {invoice.periodStart && invoice.periodEnd
                        ? `${formatDateTime(invoice.periodStart)} → ${formatDateTime(invoice.periodEnd)}`
                        : "—"}
                    </td>
                    <td className="py-2.5 text-xs text-advo-muted">{formatDateTime(invoice.paidAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function DevicesTab({ detail }: { detail: ResellerDetail }) {
  const { t } = useI18n();
  const { sites, devices } = detail.reseller;

  return (
    <div className="space-y-5">
      <Panel
        description={t("admin.resellers.devices.description", { sites: sites.length, devices: devices.length })}
        icon={<MapPin />}
        iconTone="teal"
        title={t("admin.resellers.devices.sites")}
      >
        {sites.length === 0 ? (
          <p className="rounded-xl bg-advo-surface-soft p-4 text-xs text-advo-muted">{t("admin.resellers.devices.sitesEmpty")}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--advo-border)] text-left text-[10px] font-bold tracking-wider text-advo-muted uppercase">
                  <th className="py-2 pr-3">{t("admin.resellers.col.site")}</th>
                  <th className="py-2 pr-3">{t("admin.resellers.col.location")}</th>
                  <th className="py-2 pr-3">{t("admin.resellers.col.status")}</th>
                  <th className="py-2 pr-3">{t("admin.resellers.col.controller")}</th>
                  <th className="py-2 text-right">{t("admin.resellers.col.devices")}</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => (
                  <tr className="border-b border-[var(--advo-border)]/60 last:border-b-0" key={site.id}>
                    <td className="py-2.5 pr-3 font-semibold text-advo-text">{site.name}</td>
                    <td className="py-2.5 pr-3 text-xs text-advo-muted">{site.location ?? "—"}</td>
                    <td className="py-2.5 pr-3">
                      <StatusChip>{site.state}</StatusChip>
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-advo-muted">
                      {site.mapping?.controller ? (
                        <span className="flex flex-col">
                          <span className="font-semibold text-advo-text">{site.mapping.controller.name}</span>
                          <span className="flex items-center gap-1.5">
                            <StatusChip>{site.mapping.state}</StatusChip>
                            <span className="text-[10px]">{site.mapping.controller.mode}</span>
                          </span>
                        </span>
                      ) : (
                        <span className="italic">{t("admin.resellers.devices.unmapped")}</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right font-bold tabular-nums">{site._count.devices}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        description={t("admin.resellers.devices.description", { sites: sites.length, devices: devices.length })}
        icon={<Wifi />}
        iconTone="accent"
        title={t("admin.resellers.devices.list")}
      >
        {devices.length === 0 ? (
          <p className="rounded-xl bg-advo-surface-soft p-4 text-xs text-advo-muted">{t("admin.resellers.devices.empty")}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--advo-border)] text-left text-[10px] font-bold tracking-wider text-advo-muted uppercase">
                  <th className="py-2 pr-3">{t("admin.resellers.col.mac")}</th>
                  <th className="py-2 pr-3">{t("admin.resellers.col.model")}</th>
                  <th className="py-2 pr-3">{t("admin.resellers.col.site")}</th>
                  <th className="py-2 pr-3">{t("admin.resellers.col.status")}</th>
                  <th className="py-2 pr-3">{t("admin.resellers.col.firmware")}</th>
                  <th className="py-2">{t("admin.resellers.col.lastSeen")}</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <tr className="border-b border-[var(--advo-border)]/60 last:border-b-0" key={device.id}>
                    <td className="py-2.5 pr-3 font-mono text-[11px]">{device.mac}</td>
                    <td className="py-2.5 pr-3 font-semibold text-advo-text">{device.name ?? device.model ?? "—"}</td>
                    <td className="py-2.5 pr-3 text-xs text-advo-muted">{device.site.name}</td>
                    <td className="py-2.5 pr-3">
                      <StatusChip>{device.observedStatus.toUpperCase()}</StatusChip>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-[11px] text-advo-muted">{device.firmware ?? "—"}</td>
                    <td className="py-2.5 text-xs text-advo-muted">
                      {device.lastSeenAt ? formatDateTime(device.lastSeenAt) : t("admin.resellers.devices.never")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function PaymentsTab({ detail }: { detail: ResellerDetail }) {
  const { t } = useI18n();

  return (
    <div className="space-y-5">
      <Panel
        description={t("admin.resellers.payments.description")}
        icon={<CircleDollarSign />}
        iconTone="success"
        title={t("admin.resellers.payments.orders")}
      >        {detail.orders.length === 0 ? (
          <p className="rounded-xl bg-advo-surface-soft p-4 text-xs text-advo-muted">{t("admin.resellers.payments.ordersEmpty")}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--advo-border)] text-left text-[10px] font-bold tracking-wider text-advo-muted uppercase">
                  <th className="py-2 pr-3">{t("admin.resellers.col.order")}</th>
                  <th className="py-2 pr-3">{t("admin.resellers.col.purpose")}</th>
                  <th className="py-2 pr-3">{t("admin.resellers.col.customer")}</th>
                  <th className="py-2 pr-3">{t("admin.resellers.col.amount")}</th>
                  <th className="py-2 pr-3">{t("admin.resellers.col.payment")}</th>
                  <th className="py-2 pr-3">{t("admin.resellers.col.fulfillment")}</th>
                  <th className="py-2">{t("admin.resellers.col.created")}</th>
                </tr>
              </thead>
              <tbody>
                {detail.orders.map((order) => (
                  <tr className="border-b border-[var(--advo-border)]/60 last:border-b-0" key={order.id}>
                    <td className="py-2.5 pr-3 font-mono text-[11px] text-advo-muted">{order.id.slice(0, 8)}</td>
                    <td className="py-2.5 pr-3 text-xs font-semibold text-advo-text">{order.purpose.replace(/_/g, " ")}</td>
                    <td className="py-2.5 pr-3 text-xs text-advo-muted">
                      {order.customer
                        ? [order.customer.firstName, order.customer.lastName].filter(Boolean).join(" ") || order.customer.phone
                        : t("admin.resellers.payments.walkIn")}
                    </td>
                    <td className="py-2.5 pr-3 font-bold tabular-nums">{formatTzs(order.amountTzs)}</td>
                    <td className="py-2.5 pr-3">
                      <StatusChip>{order.paymentState}</StatusChip>
                    </td>
                    <td className="py-2.5 pr-3">
                      <StatusChip>{order.fulfillmentState}</StatusChip>
                    </td>
                    <td className="py-2.5 text-xs text-advo-muted">{formatDateTime(order.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        icon={<Landmark />}
        iconTone="gold"
        title={t("admin.resellers.payments.withdrawals")}
      >
        {detail.withdrawals.length === 0 ? (
          <p className="rounded-xl bg-advo-surface-soft p-4 text-xs text-advo-muted">
            {t("admin.resellers.payments.withdrawalsEmpty")}
          </p>
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--advo-border)] text-left text-[10px] font-bold tracking-wider text-advo-muted uppercase">
                  <th className="py-2 pr-3">{t("admin.resellers.col.withdrawal")}</th>
                  <th className="py-2 pr-3">{t("admin.resellers.col.amount")}</th>
                  <th className="py-2 pr-3">{t("admin.resellers.col.status")}</th>
                  <th className="py-2 pr-3">{t("admin.resellers.col.destination")}</th>
                  <th className="py-2">{t("admin.resellers.col.created")}</th>
                </tr>
              </thead>
              <tbody>
                {detail.withdrawals.map((withdrawal) => (
                  <tr className="border-b border-[var(--advo-border)]/60 last:border-b-0" key={withdrawal.id}>
                    <td className="py-2.5 pr-3 font-mono text-[11px] text-advo-muted">{withdrawal.id.slice(0, 8)}</td>
                    <td className="py-2.5 pr-3 font-bold tabular-nums">{formatTzs(withdrawal.amountTzs)}</td>
                    <td className="py-2.5 pr-3">
                      <StatusChip>{withdrawal.state}</StatusChip>
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-advo-muted">
                      {withdrawal.destinationSnapshot?.recipientName ?? "—"}
                      {withdrawal.destinationSnapshot?.phone ? ` · ${withdrawal.destinationSnapshot.phone}` : ""}
                    </td>
                    <td className="py-2.5 text-xs text-advo-muted">{formatDateTime(withdrawal.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function ActivityTab({ detail }: { detail: ResellerDetail }) {
  const { t } = useI18n();

  return (
    <Panel
      description={t("admin.resellers.activity.description")}
      icon={<History />}
      iconTone="violet"
      title={t("admin.resellers.activity.title")}
    >
      {detail.activity.length === 0 ? (
        <p className="rounded-xl bg-advo-surface-soft p-4 text-xs text-advo-muted">{t("admin.resellers.activity.empty")}</p>
      ) : (
        <ol className="relative space-y-0 border-l border-[var(--advo-border)] pl-5">
          {detail.activity.map((event) => (
            <li className="relative py-3" key={event.id}>
              <span
                aria-hidden="true"
                className="absolute top-4 -left-[26px] size-2.5 rounded-full bg-advo-blue ring-4 ring-white"
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-advo-blue-soft px-2 py-0.5 font-mono text-[11px] font-bold text-advo-blue">
                  {event.action}
                </span>
                <span className="text-[11px] font-semibold text-advo-muted">
                  {event.actor?.email ?? t("admin.resellers.activity.system")}
                </span>
                <span className="text-[11px] text-advo-muted tabular-nums">{formatDateTime(event.createdAt)}</span>
              </div>
              {event.reason ? <p className="mt-1 text-xs text-advo-muted italic">“{event.reason}”</p> : null}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

/** Compact metric used inside panels. */
function Mini({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-advo-surface-soft px-3 py-2.5">
      <p className="text-[10px] font-bold tracking-wider text-advo-muted uppercase">{label}</p>
      <p className="mt-0.5 truncate text-sm font-bold text-advo-text tabular-nums">{value}</p>
    </div>
  );
}
