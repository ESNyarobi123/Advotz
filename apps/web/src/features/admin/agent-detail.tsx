"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatDateTime, formatTzs } from "@advo/api-client";
import { Button, Card } from "@heroui/react";
import { AdvoKpi, Notice, SoftIcon, StatusChip } from "@advo/ui";
import {
  ArrowLeft,
  BadgeCheck,
  Coins,
  Filter,
  Gift,
  History,
  LogIn,
  ShieldCheck,
  TriangleAlert,
  UserCheck,
  UserCog,
  UserRound,
  Wallet,
} from "lucide-react";
import { PageHero, ResourceView, SectionHeader } from "@/features/common/components";
import { agentOperatorCopy, OperatorDialog, useOperatorActions } from "@/features/admin/operator-dialog";
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

type Referral = {
  id: string;
  source: string;
  reason: string | null;
  effectiveAt: string;
  reseller: {
    id: string;
    businessName: string;
    slug: string;
    status: string;
    createdAt: string;
    subscription: { state: string; currentPeriodEnd: string | null } | null;
    _count: { orders: number };
  };
};

type Lead = {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  status: string;
  createdAt: string;
  invitation: { expiresAt: string | null; acceptedAt: string | null } | null;
};

type Accrual = {
  id: string;
  trigger: string;
  state: string;
  eligibleBaseTzs: string;
  amountTzs: string;
  reservedTzs: string;
  paidTzs: string;
  availableAt: string;
  reason: string | null;
  createdAt: string;
  reseller: { businessName: string };
};

type Policy = {
  id: string;
  name: string;
  agentId: string | null;
  trigger: string;
  mode: string;
  fixedTzs: string | null;
  basisPoints: number | null;
  holdDays: number;
  effectiveFrom: string;
  effectiveTo: string | null;
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

export type AgentDetail = {
  agent: {
    id: string;
    referralCode: string;
    status: string;
    createdAt: string;
    user: Owner;
    _count: { attributions: number; leads: number; invitations: number; policies: number };
  };
  wallet: { availableTzs: string; pendingTzs: string; reservedTzs: string };
  kpis: {
    creditedTzs: string;
    creditedCount: number;
    paidTzs: string;
    paidCount: number;
    referrals: number;
    activeReferrals: number;
    leadsTotal: number;
    leadsConverted: number;
  };
  referrals: Referral[];
  leads: Lead[];
  accruals: Accrual[];
  policies: Policy[];
  withdrawals: Withdrawal[];
  activity: Activity[];
};

type TabKey = "profile" | "referrals" | "commissions" | "leads" | "activity";

const TAB_ORDER = ["profile", "referrals", "commissions", "leads", "activity"] as const;
const TAB_LABEL = {
  profile: "admin.agents.tab.profile",
  referrals: "admin.agents.tab.referrals",
  commissions: "admin.agents.tab.commissions",
  leads: "admin.agents.tab.leads",
  activity: "admin.agents.tab.activity",
} as const;

export function AdminAgentDetailScreen({ agentId }: { agentId: string }) {
  const { t } = useI18n();
  const resource = useResource<AgentDetail | null>(`/admin/agents/${agentId}`);
  const [tab, setTab] = useState<TabKey>("profile");

  const detail = resource.data;
  const agent = detail?.agent;
  const suspended = agent ? agent.status !== "ACTIVE" : false;

  const operator = useOperatorActions({
    basePath: `/admin/agents/${agentId}`,
    copy: agentOperatorCopy(t, agent?.user.name ?? ""),
    onChanged: () => resource.reload(),
    redirectTo: "/agent",
    target: { displayName: agent?.user.name ?? "", suspended },
  });

  const tabCounts = useMemo<Record<TabKey, number | undefined>>(() => {
    if (!detail) {
      return { profile: undefined, referrals: undefined, commissions: undefined, leads: undefined, activity: undefined };
    }
    return {
      profile: undefined,
      referrals: detail.referrals.length,
      commissions: detail.accruals.length,
      leads: detail.leads.length,
      activity: detail.activity.length,
    };
  }, [detail]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-4">
      <Link
        className="inline-flex items-center gap-1.5 text-xs font-bold text-advo-muted hover:text-advo-blue"
        href="/admin/agents"
      >
        <ArrowLeft className="size-3.5" />
        {t("admin.agents.detail.back")}
      </Link>

      <ResourceView resource={resource}>
        {() =>
          !agent || !detail ? (
            <Notice tone="danger">{t("admin.agents.detail.notFound")}</Notice>
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
                      {operator.busy === "impersonate" ? "…" : t("admin.agents.action.impersonate")}
                    </Button>
                    <Button
                      isDisabled={operator.busy !== null}
                      onPress={() => operator.open("status")}
                      size="sm"
                      type="button"
                      variant={suspended ? "outline" : "danger-soft"}
                    >
                      {suspended ? <ShieldCheck className="size-4" /> : <TriangleAlert className="size-4" />}
                      {operator.busy === "status"
                        ? "…"
                        : suspended
                          ? t("admin.agents.action.reactivate")
                          : t("admin.agents.action.suspend")}
                    </Button>
                  </>
                }
                description={
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <UserRound className="size-3.5" />
                    <span className="font-semibold text-advo-text">{agent.user.email}</span>
                    {agent.user.phone ? <span>· {agent.user.phone}</span> : null}
                  </span>
                }
                eyebrow={t("admin.agents.eyebrow")}
                icon={<UserCheck />}
                iconTone={suspended ? "danger" : "violet"}
                meta={
                  <>
                    <StatusChip size="md">{agent.status}</StatusChip>
                    <span className="rounded-full border border-[var(--advo-border)] bg-white/70 px-2.5 py-1 font-mono text-[11px] font-bold text-[#8a5a00]">
                      {agent.referralCode}
                    </span>
                  </>
                }
                title={agent.user.name}
              />

              {operator.error ? <Notice tone="danger">{operator.error}</Notice> : null}

              {/* ── Money at a glance ── */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <AdvoKpi
                  hint={t("admin.agents.detail.kpi.creditedHint", { count: detail.kpis.creditedCount })}
                  icon={<Coins />}
                  iconTone="gold"
                  label={t("admin.agents.detail.kpi.credited")}
                  value={formatTzs(detail.kpis.creditedTzs)}
                />
                <AdvoKpi
                  hint={t("admin.agents.detail.kpi.paidHint", { count: detail.kpis.paidCount })}
                  icon={<BadgeCheck />}
                  iconTone="success"
                  label={t("admin.agents.detail.kpi.paid")}
                  value={formatTzs(detail.kpis.paidTzs)}
                />
                <AdvoKpi
                  hint={t("admin.agents.detail.kpi.walletHint", {
                    pending: formatTzs(detail.wallet.pendingTzs),
                    reserved: formatTzs(detail.wallet.reservedTzs),
                  })}
                  icon={<Wallet />}
                  iconTone="accent"
                  label={t("admin.agents.detail.kpi.wallet")}
                  value={formatTzs(detail.wallet.availableTzs)}
                />
                <AdvoKpi
                  hint={t("admin.agents.detail.kpi.referralsHint", { active: detail.kpis.activeReferrals })}
                  icon={<Gift />}
                  iconTone="violet"
                  label={t("admin.agents.detail.kpi.referrals")}
                  value={detail.kpis.referrals}
                />
              </div>

              {/* ── Tabs ── */}
              <div
                className="flex flex-wrap gap-1 rounded-2xl border border-[var(--advo-border)] bg-white/70 p-1.5 shadow-advo-card"
                role="tablist"
              >
                {TAB_ORDER.map((key) => (
                  <button
                    aria-selected={tab === key}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors ${
                      tab === key
                        ? "bg-advo-blue text-white shadow-advo-card"
                        : "text-advo-muted hover:bg-advo-blue-soft hover:text-advo-blue"
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
              {tab === "referrals" ? <ReferralsTab detail={detail} /> : null}
              {tab === "commissions" ? <CommissionsTab detail={detail} /> : null}
              {tab === "leads" ? <LeadsTab detail={detail} /> : null}
              {tab === "activity" ? <ActivityTab detail={detail} /> : null}
            </>
          )
        }
      </ResourceView>

      {agent ? <OperatorDialog actions={operator} /> : null}
    </div>
  );
}

const TAB_ICONS: Record<TabKey, React.ReactNode> = {
  profile: <UserRound className="size-3.5" />,
  referrals: <Gift className="size-3.5" />,
  commissions: <Coins className="size-3.5" />,
  leads: <Filter className="size-3.5" />,
  activity: <History className="size-3.5" />,
};

/* ─────────────────────────────── Tabs ─────────────────────────────── */

/** Panel wrapper: one heading, one white card, consistent rhythm across tabs. */
function Panel({
  title,
  description,
  icon,
  iconTone = "violet",
  children,
}: {
  title: string;
  description?: React.ReactNode;
  icon: React.ReactNode;
  iconTone?: "accent" | "gold" | "success" | "warning" | "danger" | "violet" | "teal";
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70">
      <SectionHeader description={description} icon={icon} iconTone={iconTone} title={title} />
      {children}
    </Card>
  );
}

/** Definition-list row used by the profile panel. */
function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--advo-border)] py-2.5 last:border-b-0">
      <span className="text-xs font-semibold text-advo-muted">{label}</span>
      <span className="min-w-0 text-right text-sm text-advo-text">{children}</span>
    </div>
  );
}

/** Small labelled value used inside money cards. */
function Mini({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--advo-border)] bg-advo-surface-soft/60 px-3 py-2">
      <p className="text-[10px] font-bold tracking-wider text-advo-muted uppercase">{label}</p>
      <p className="mt-0.5 text-sm font-black text-advo-text tabular-nums">{value}</p>
    </div>
  );
}

function ProfileTab({ detail }: { detail: AgentDetail }) {
  const { t } = useI18n();
  const { agent, kpis, wallet } = detail;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <Panel
          description={t("admin.agents.profile.description")}
          icon={<UserRound />}
          iconTone="violet"
          title={t("admin.agents.profile.title")}
        >
          <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <div>
              <Row label={t("admin.agents.profile.contact")}>
                <span className="flex flex-col items-end gap-0.5">
                  <span className="font-semibold">{agent.user.name}</span>
                  <span className="text-xs text-advo-muted">{agent.user.email}</span>
                  {agent.user.phone ? <span className="text-xs text-advo-muted">{agent.user.phone}</span> : null}
                </span>
              </Row>
              <Row label={t("admin.agents.profile.referralCode")}>
                <span className="rounded-md bg-advo-gold-soft px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#8a5a00]">
                  {agent.referralCode}
                </span>
              </Row>
              <Row label={t("admin.agents.profile.joined")}>{formatDateTime(agent.createdAt)}</Row>
            </div>
            <div>
              <Row label={t("admin.agents.profile.verified")}>
                {agent.user.emailVerifiedAt ? (
                  <span className="font-semibold text-emerald-700">
                    {formatDateTime(agent.user.emailVerifiedAt)}
                  </span>
                ) : (
                  <span className="text-advo-muted">{t("admin.agents.profile.unverified")}</span>
                )}
              </Row>
              <Row label={t("admin.agents.profile.mfa")}>
                {agent.user.mfaEnabled ? t("admin.agents.profile.mfaOn") : t("admin.agents.profile.mfaOff")}
              </Row>
              <Row label={t("admin.agents.col.status")}>
                <StatusChip>{agent.status}</StatusChip>
              </Row>
            </div>
          </div>
        </Panel>

        <Panel
          icon={<Gift />}
          iconTone="accent"
          title={t("admin.agents.profile.counts")}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini label={t("admin.agents.col.referrals")} value={kpis.referrals} />
            <Mini label={t("admin.agents.col.leads")} value={kpis.leadsTotal} />
            <Mini label={t("admin.agents.profile.invitations")} value={agent._count.invitations} />
            <Mini label={t("admin.agents.profile.policies")} value={agent._count.policies} />
          </div>
        </Panel>
      </div>

      <div className="space-y-4">
        <Panel
          description={`${formatTzs(wallet.availableTzs)} ${t("admin.agents.profile.walletAvailable").toLowerCase()}`}
          icon={<Wallet />}
          iconTone="gold"
          title={t("admin.agents.profile.wallet")}
        >
          <div className="space-y-2">
            <Row label={t("admin.agents.profile.walletAvailable")}>{formatTzs(wallet.availableTzs)}</Row>
            <Row label={t("admin.agents.profile.walletPending")}>{formatTzs(wallet.pendingTzs)}</Row>
            <Row label={t("admin.agents.profile.walletReserved")}>{formatTzs(wallet.reservedTzs)}</Row>
          </div>
        </Panel>

        <Panel
          description={t("admin.agents.commissions.description")}
          icon={<Coins />}
          iconTone="success"
          title={t("admin.agents.commissions.title")}
        >
          <div className="space-y-2">
            <Row label={t("admin.agents.detail.kpi.credited")}>{formatTzs(kpis.creditedTzs)}</Row>
            <Row label={t("admin.agents.detail.kpi.paid")}>{formatTzs(kpis.paidTzs)}</Row>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function ReferralsTab({ detail }: { detail: AgentDetail }) {
  const { t } = useI18n();

  return (
    <Panel
      description={t("admin.agents.referrals.description")}
      icon={<Gift />}
      iconTone="accent"
      title={t("admin.agents.referrals.title")}
    >
      {detail.referrals.length === 0 ? (
        <p className="py-2 text-sm text-advo-muted">{t("admin.agents.referrals.empty")}</p>
      ) : (
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-y border-[var(--advo-border)] bg-advo-surface-soft/60 text-left">
                <Th>{t("admin.agents.col.business")}</Th>
                <Th>{t("admin.agents.col.status")}</Th>
                <Th>{t("admin.agents.col.subscription")}</Th>
                <Th>{t("admin.agents.col.orders")}</Th>
                <Th>{t("admin.agents.referrals.source")}</Th>
                <Th>{t("admin.agents.col.since")}</Th>
              </tr>
            </thead>
            <tbody>
              {detail.referrals.map((ref) => (
                <tr className="border-b border-[var(--advo-border)] last:border-b-0" key={ref.id}>
                  <Td>
                    <Link
                      className="font-bold text-advo-text hover:text-advo-blue"
                      href={`/admin/resellers/${ref.reseller.id}`}
                    >
                      {ref.reseller.businessName}
                    </Link>
                    <p className="font-mono text-[10px] text-advo-muted">{ref.reseller.slug}</p>
                  </Td>
                  <Td>
                    <StatusChip>{ref.reseller.status}</StatusChip>
                  </Td>
                  <Td>
                    {ref.reseller.subscription ? (
                      <StatusChip>{ref.reseller.subscription.state}</StatusChip>
                    ) : (
                      <span className="text-xs text-advo-muted italic">{t("admin.resellers.sub.none")}</span>
                    )}
                  </Td>
                  <Td className="tabular-nums">{ref.reseller._count.orders}</Td>
                  <Td>
                    <span className="font-mono text-[11px] text-advo-muted">{ref.source}</span>
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-advo-muted">{formatDateTime(ref.effectiveAt)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function CommissionsTab({ detail }: { detail: AgentDetail }) {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      <Panel
        description={t("admin.agents.commissions.description")}
        icon={<Coins />}
        iconTone="gold"
        title={t("admin.agents.commissions.title")}
      >
        {detail.accruals.length === 0 ? (
          <p className="py-2 text-sm text-advo-muted">{t("admin.agents.commissions.empty")}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="border-y border-[var(--advo-border)] bg-advo-surface-soft/60 text-left">
                  <Th>{t("admin.agents.col.reseller")}</Th>
                  <Th>{t("admin.agents.col.trigger")}</Th>
                  <Th>{t("admin.agents.col.base")}</Th>
                  <Th>{t("admin.agents.col.commission")}</Th>
                  <Th>{t("admin.agents.col.state")}</Th>
                  <Th>{t("admin.agents.col.availableAt")}</Th>
                </tr>
              </thead>
              <tbody>
                {detail.accruals.map((accrual) => (
                  <tr className="border-b border-[var(--advo-border)] last:border-b-0" key={accrual.id}>
                    <Td className="font-semibold">{accrual.reseller.businessName}</Td>
                    <Td>
                      <span className="font-mono text-[11px] text-advo-muted">{accrual.trigger}</span>
                    </Td>
                    <Td className="whitespace-nowrap tabular-nums">{formatTzs(accrual.eligibleBaseTzs)}</Td>
                    <Td className="whitespace-nowrap font-bold tabular-nums">{formatTzs(accrual.amountTzs)}</Td>
                    <Td>
                      <StatusChip>{accrual.state}</StatusChip>
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-advo-muted">{formatDateTime(accrual.availableAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        description={t("admin.agents.commissions.policyGlobal")}
        icon={<Coins />}
        iconTone="violet"
        title={t("admin.agents.commissions.policies")}
      >
        {detail.policies.length === 0 ? (
          <p className="py-2 text-sm text-advo-muted">{t("admin.agents.commissions.policiesEmpty")}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-y border-[var(--advo-border)] bg-advo-surface-soft/60 text-left">
                  <Th>{t("admin.agents.col.policy")}</Th>
                  <Th>{t("admin.agents.col.trigger")}</Th>
                  <Th>{t("admin.agents.col.mode")}</Th>
                  <Th>{t("admin.agents.col.rate")}</Th>
                  <Th>{t("admin.agents.col.effective")}</Th>
                </tr>
              </thead>
              <tbody>
                {detail.policies.map((policy) => (
                  <tr className="border-b border-[var(--advo-border)] last:border-b-0" key={policy.id}>
                    <Td>
                      <span className="font-semibold">{policy.name}</span>
                      <p className="text-[10px] text-advo-muted">
                        {policy.agentId ? `#${policy.agentId.slice(0, 8)}` : t("admin.agents.commissions.policyGlobal")}
                      </p>
                    </Td>
                    <Td>
                      <span className="font-mono text-[11px] text-advo-muted">{policy.trigger}</span>
                    </Td>
                    <Td>
                      {policy.mode === "FIXED"
                        ? t("admin.agents.mode.FIXED")
                        : t("admin.agents.mode.PERCENTAGE")}
                    </Td>
                    <Td className="whitespace-nowrap font-bold tabular-nums">
                      {policy.mode === "FIXED"
                        ? formatTzs(policy.fixedTzs ?? "0")
                        : `${((policy.basisPoints ?? 0) / 100).toFixed(2)}%`}
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-advo-muted">
                      {formatDateTime(policy.effectiveFrom)}
                    </Td>
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

function LeadsTab({ detail }: { detail: AgentDetail }) {
  const { t } = useI18n();

  return (
    <Panel
      description={t("admin.agents.leads.description")}
      icon={<Filter />}
      iconTone="teal"
      title={t("admin.agents.leads.title")}
    >
      {detail.leads.length === 0 ? (
        <p className="py-2 text-sm text-advo-muted">{t("admin.agents.leads.empty")}</p>
      ) : (
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead>
              <tr className="border-y border-[var(--advo-border)] bg-advo-surface-soft/60 text-left">
                <Th>{t("admin.agents.col.business")}</Th>
                <Th>{t("admin.agents.col.contact")}</Th>
                <Th>{t("admin.agents.col.status")}</Th>
                <Th>{t("admin.agents.col.invitedAt")}</Th>
                <Th>{t("admin.agents.col.expires")}</Th>
              </tr>
            </thead>
            <tbody>
              {detail.leads.map((lead) => (
                <tr className="border-b border-[var(--advo-border)] last:border-b-0" key={lead.id}>
                  <Td className="font-semibold">{lead.businessName}</Td>
                  <Td>
                    <span className="block text-xs font-semibold">{lead.contactName}</span>
                    <span className="block text-[11px] text-advo-muted">{lead.email}</span>
                    <span className="block text-[11px] text-advo-muted">{lead.phone}</span>
                  </Td>
                  <Td>
                    <StatusChip>{lead.status}</StatusChip>
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-advo-muted">{formatDateTime(lead.createdAt)}</Td>
                  <Td className="whitespace-nowrap text-xs text-advo-muted">
                    {lead.invitation?.acceptedAt
                      ? t("admin.agents.leads.accepted", { when: formatDateTime(lead.invitation.acceptedAt) })
                      : lead.invitation?.expiresAt
                        ? formatDateTime(lead.invitation.expiresAt)
                        : t("admin.agents.leads.expired")}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function ActivityTab({ detail }: { detail: AgentDetail }) {
  const { t } = useI18n();

  return (
    <Panel
      description={t("admin.agents.activity.description")}
      icon={<History />}
      iconTone="violet"
      title={t("admin.agents.activity.title")}
    >
      {detail.activity.length === 0 ? (
        <p className="py-2 text-sm text-advo-muted">{t("admin.agents.activity.empty")}</p>
      ) : (
        <ul className="space-y-2.5">
          {detail.activity.map((event) => (
            <li
              className="flex flex-wrap items-start gap-3 rounded-xl border border-[var(--advo-border)] bg-advo-surface-soft/50 px-3.5 py-2.5"
              key={event.id}
            >
              <SoftIcon size="sm" tone="violet">
                <History />
              </SoftIcon>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[11px] font-bold text-advo-text">{event.action}</p>
                <p className="text-[11px] text-advo-muted">
                  {event.actor?.email ?? t("admin.resellers.activity.system")} · {formatDateTime(event.createdAt)}
                </p>
                {event.reason ? <p className="mt-1 text-xs text-advo-muted italic">“{event.reason}”</p> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ─────────────────────────── Table primitives ─────────────────────────── */

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-5 py-2.5 text-[10px] font-bold tracking-wider text-advo-muted uppercase" scope="col">
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-5 py-2.5 text-advo-text ${className}`}>{children}</td>;
}
