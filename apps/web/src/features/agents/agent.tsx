"use client";

import { useState } from "react";
import { formatDateTime, formatTzs } from "@advo/api-client";
import { Button, Card } from "@heroui/react";
import { AdvoKpi, AdvoTable, StatusChip } from "@advo/ui";
import { Building2, Check, Copy, UserPlus, Wallet } from "lucide-react";
import {
  CheckboxField,
  Field,
  FormCard,
  PageHeader,
  PageHero,
  ResourceView,
  SectionHeader,
} from "@/features/common/components";
import {
  accountStatusLabel,
  commissionStateLabel,
  commissionTriggerLabel,
  leadStateLabel,
  subscriptionStateLabel,
} from "@/features/common/labels";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formValues, useAction, useResource } from "@/lib/hooks";

type AgentOverview = {
  agent: { name: string; email: string; referralCode: string; status: string };
  leads: Record<string, number>;
  referredResellers: Array<{ businessName: string; status: string; subscriptionState: string; source: string; since: string }>;
  wallet: { availableTzs: string; pendingTzs: string; reservedTzs: string };
  commissions: Array<{ state: string; count: number; amountTzs: string }>;
};

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? (typeof window !== "undefined" ? window.location.origin : "");

export function AgentOverviewScreen() {
  const { t } = useI18n();
  const overview = useResource<AgentOverview>("/agent/overview");
  const [copied, setCopied] = useState(false);

  function copyLink(link: string) {
    void navigator.clipboard?.writeText(link).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <ResourceView resource={overview}>
      {(o) => {
        const referralLink = `${WEB_URL}/register?ref=${encodeURIComponent(o.agent.referralCode)}`;
        return (
          <div className="mx-auto max-w-[1400px] space-y-6 pb-4">
            <PageHero
              description={t("agent.overview.description")}
              eyebrow={t("nav.overview")}
              icon={<UserPlus />}
              iconTone="violet"
              meta={<StatusChip>{accountStatusLabel(t, o.agent.status)}</StatusChip>}
              title={t("agent.overview.welcome", { name: o.agent.name })}
            />

            {/* ── Referral link ── */}
            <Card className="relative overflow-hidden p-5 shadow-advo-card ring-1 ring-advo-border/70">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -top-20 -right-16 size-52 rounded-full bg-[radial-gradient(circle_at_center,rgba(109,91,208,0.2),transparent_70%)]"
              />
              <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold tracking-wider text-advo-muted uppercase">
                    {t("agent.overview.referralCode")}
                  </p>
                  <p className="mt-1 text-3xl font-black tracking-[0.22em] text-advo-text">{o.agent.referralCode}</p>
                  <p className="mt-2 text-xs text-advo-muted">{t("agent.overview.registrationLink")}</p>
                  <code className="mt-1.5 block max-w-full truncate rounded-lg bg-advo-surface-soft px-2.5 py-1.5 text-[11px] text-advo-text">
                    {referralLink}
                  </code>
                </div>
                <Button className="shrink-0" onPress={() => copyLink(referralLink)} size="sm" variant="outline">
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copied ? t("common.copied") : t("common.copy")}
                </Button>
              </div>
            </Card>

            {/* ── KPI row ── */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <AdvoKpi
                hint={t("agent.overview.kpi.invitationsHint", { count: o.leads.ACCEPTED ?? 0 })}
                icon={<UserPlus />}
                iconTone="accent"
                label={t("agent.overview.kpi.invitations")}
                value={Object.values(o.leads).reduce((a, b) => a + b, 0)}
              />
              <AdvoKpi
                hint={t("agent.overview.kpi.referredHint", {
                  count: o.referredResellers.filter((r) => r.subscriptionState === "ACTIVE").length,
                })}
                icon={<Building2 />}
                iconTone="violet"
                label={t("agent.overview.kpi.referred")}
                value={o.referredResellers.length}
              />
              <AdvoKpi
                hint={t("agent.overview.kpi.pendingHint")}
                icon={<Wallet />}
                iconTone="gold"
                label={t("agent.overview.kpi.pending")}
                value={formatTzs(o.wallet.pendingTzs)}
              />
              <AdvoKpi
                icon={<Check />}
                iconTone="teal"
                label={t("agent.overview.kpi.available")}
                value={formatTzs(o.wallet.availableTzs)}
              />
            </div>

            {/* ── Referred resellers ── */}
            <Card className="gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70">
              <SectionHeader
                icon={<Building2 />}
                iconTone="accent"
                title={t("agent.overview.referred.title")}
              />
              <AdvoTable
                label={t("agent.overview.referred.tableLabel")}
                rows={o.referredResellers}
                rowKey={(r) => `${r.businessName}-${r.since}`}
                empty={t("agent.overview.referred.empty")}
                columns={[
                  { key: "b", header: t("agent.overview.col.business"), render: (r) => r.businessName },
                  { key: "s", header: t("agent.overview.col.account"), render: (r) => <StatusChip>{accountStatusLabel(t, r.status)}</StatusChip> },
                  { key: "sub", header: t("agent.overview.col.subscription"), render: (r) => <StatusChip>{subscriptionStateLabel(t, r.subscriptionState)}</StatusChip> },
                  { key: "src", header: t("agent.overview.col.attribution"), render: (r) => r.source.replace(/_/g, " ").toLowerCase() },
                  { key: "d", header: t("agent.overview.col.since"), render: (r) => formatDateTime(r.since) },
                ]}
              />
            </Card>
          </div>
        );
      }}
    </ResourceView>
  );
}

type Lead = {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  status: string;
  createdAt: string;
  invitation: { expiresAt: string; acceptedAt: string | null } | null;
};

export function AgentLeadsScreen() {
  const { t } = useI18n();
  const leads = useResource<Lead[]>("/agent/leads");
  const [devLink, setDevLink] = useState<string | null>(null);
  const invite = useAction(async (form: HTMLFormElement) => {
    const v = formValues(form);
    const res = await api.post<{ devInvitationToken?: string; notificationSimulated: boolean }>("/agent/invitations", {
      businessName: v.businessName,
      contactName: v.contactName,
      email: v.email,
      phone: v.phone,
      consentConfirmed: v.consentConfirmed === "true",
    });
    setDevLink(
      res.devInvitationToken
        ? t("agent.leads.simulated", { url: `${WEB_URL}/invite/${res.devInvitationToken}` })
        : t("agent.leads.created"),
    );
    form.reset();
  }, leads.reload);

  return (
    <>
      <PageHeader title={t("agent.leads.title")} description={t("agent.leads.description")} />
      <FormCard title={t("agent.leads.form.title")} onSubmit={(f) => void invite.run(f)} pending={invite.pending} error={invite.error} success={devLink} submitLabel={t("agent.leads.form.submit")}>
        <Field name="businessName" label={t("agent.leads.form.businessName")} required />
        <Field name="contactName" label={t("agent.leads.form.contactName")} required />
        <Field name="email" label={t("agent.leads.form.email")} type="email" required />
        <Field name="phone" label={t("agent.leads.form.phone")} placeholder={t("agent.leads.form.phonePlaceholder")} pattern="\+255[0-9]{9}" required />
        <CheckboxField name="consentConfirmed" label={t("agent.leads.form.consent")} />
      </FormCard>
      <ResourceView resource={leads}>
        {(rows) => (
          <AdvoTable label={t("agent.leads.tableLabel")}
            rows={rows}
            rowKey={(l) => l.id}
            empty={t("agent.leads.empty")}
            columns={[
              { key: "b", header: t("agent.leads.col.business"), render: (l) => <>{l.businessName}<p className="text-xs text-[var(--advo-muted)]">{l.contactName}</p></> },
              { key: "s", header: t("agent.leads.col.status"), render: (l) => <StatusChip>{leadStateLabel(t, l.status)}</StatusChip> },
              {
                key: "e",
                header: t("agent.leads.col.invitation"),
                render: (l) =>
                  l.invitation?.acceptedAt
                    ? t("agent.leads.invitation.accepted", { date: formatDateTime(l.invitation.acceptedAt) })
                    : l.invitation
                    ? t("agent.leads.invitation.expires", { date: formatDateTime(l.invitation.expiresAt) })
                    : "—",
              },
              { key: "c", header: t("agent.leads.col.created"), render: (l) => formatDateTime(l.createdAt) },
            ]}
          />
        )}
      </ResourceView>
    </>
  );
}

type Accrual = {
  id: string;
  trigger: string;
  state: string;
  eligibleBaseTzs: string;
  amountTzs: string;
  reversedTzs: string;
  availableAt: string | null;
  reason: string | null;
  createdAt: string;
  policySnapshot: { name?: string; mode?: string; basisPoints?: number | null; fixedTzs?: string | null; holdDays?: number };
  reseller: { businessName: string };
};

export function AgentCommissionsScreen() {
  const { t } = useI18n();
  const accruals = useResource<Accrual[]>("/agent/commissions");
  return (
    <>
      <PageHeader title={t("agent.commissions.title")} description={t("agent.commissions.description")} />
      <ResourceView resource={accruals}>
        {(rows) => (
          <AdvoTable label={t("agent.commissions.tableLabel")}
            rows={rows}
            rowKey={(a) => a.id}
            empty={t("agent.commissions.empty")}
            columns={[
              { key: "r", header: t("agent.commissions.col.reseller"), render: (a) => a.reseller.businessName },
              { key: "t", header: t("agent.commissions.col.trigger"), render: (a) => commissionTriggerLabel(t, a.trigger) },
              {
                key: "p",
                header: t("agent.commissions.col.policy"),
                render: (a) => (
                  <span className="text-xs">
                    {a.policySnapshot.name ?? "—"} ·{" "}
                    {t("agent.commissions.shareOf", {
                      rate:
                        a.policySnapshot.mode === "FIXED"
                          ? formatTzs(a.policySnapshot.fixedTzs)
                          : `${(a.policySnapshot.basisPoints ?? 0) / 100}%`,
                      base: formatTzs(a.eligibleBaseTzs),
                    })}
                  </span>
                ),
              },
              { key: "a", header: t("agent.commissions.col.amount"), render: (a) => formatTzs(a.amountTzs) },
              { key: "s", header: t("agent.commissions.col.state"), render: (a) => <><StatusChip>{commissionStateLabel(t, a.state)}</StatusChip>{a.reason ? <p className="max-w-56 text-xs">{a.reason}</p> : null}</> },
              { key: "av", header: t("agent.commissions.col.availableFrom"), render: (a) => formatDateTime(a.availableAt) },
            ]}
          />
        )}
      </ResourceView>
    </>
  );
}
