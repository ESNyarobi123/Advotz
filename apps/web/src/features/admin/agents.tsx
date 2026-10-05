"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatDateTime, formatTzs } from "@advo/api-client";
import { useOverlayState } from "@heroui/react";
import { Button, Card, Input, Modal } from "@heroui/react";
import { AdvoKpi, Notice, SoftIcon, StatusChip } from "@advo/ui";
import {
  Award,
  Coins,
  ExternalLink,
  Filter,
  LogIn,
  Plus,
  Search,
  ShieldCheck,
  TriangleAlert,
  UserCheck,
  Users,
  UserRound,
} from "lucide-react";
import { Field, PageHero, ResourceView, SectionHeader } from "@/features/common/components";
import { agentOperatorCopy, OperatorDialog, useOperatorActions } from "@/features/admin/operator-dialog";
import { api } from "@/lib/api";
import { formValues, useAction, useResource } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

/** Row shape returned by `GET /admin/agents`, including the server-side rollups. */
export type AgentRow = {
  id: string;
  referralCode: string;
  status: string;
  createdAt: string;
  user: { name: string; email: string; phone: string | null; status: string };
  _count: { attributions: number; leads: number };
  /** Only counts resellers still active, so the card can qualify the referral total. */
  activeReferrals: number;
  commission: { creditedTzs: string; paidTzs: string; accrualCount: number };
};

/** Status buckets the pill filter cycles through. Agents only have the three states. */
const FILTERS = ["all", "active", "suspended"] as const;
type FilterKey = (typeof FILTERS)[number];

/** Static labels keep the translator call fully typed instead of built from a template. */
const FILTER_LABEL: Record<
  FilterKey,
  "admin.agents.filter.all" | "admin.agents.filter.active" | "admin.agents.filter.suspended"
> = {
  all: "admin.agents.filter.all",
  active: "admin.agents.filter.active",
  suspended: "admin.agents.filter.suspended",
};

function bucketOf(status: string): Exclude<FilterKey, "all"> {
  return status === "ACTIVE" ? "active" : "suspended";
}

export function AdminAgentsScreen() {
  const { t } = useI18n();
  const agents = useResource<AgentRow[]>("/admin/agents");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [created, setCreated] = useState<{ id: string; referralCode: string } | null>(null);

  const rows = agents.data ?? [];

  const stats = useMemo(() => {
    const active = rows.filter((r) => r.status === "ACTIVE").length;
    const suspended = rows.length - active;
    const referrals = rows.reduce((sum, r) => sum + r._count.attributions, 0);
    const activeReferrals = rows.reduce((sum, r) => sum + r.activeReferrals, 0);
    const leads = rows.reduce((sum, r) => sum + r._count.leads, 0);
    const earned = rows.reduce((sum, r) => sum + BigInt(r.commission.creditedTzs), 0n);
    const accruals = rows.reduce((sum, r) => sum + r.commission.accrualCount, 0);
    return { total: rows.length, active, suspended, referrals, activeReferrals, leads, earned, accruals };
  }, [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && bucketOf(r.status) !== filter) return false;
      if (!needle) return true;
      return [r.user.name, r.user.email, r.referralCode, r.user.phone ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [rows, query, filter]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-4">
      <PageHero
        actions={<CreateAgentButton onCreated={setCreated} />}
        description={t("admin.agents.description")}
        eyebrow={t("admin.agents.eyebrow")}
        icon={<UserCheck />}
        iconTone="violet"
        meta={
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--advo-border)] bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-advo-muted tabular-nums">
              <Users className="size-3" />
              {t("admin.agents.count", { count: stats.total })}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-advo-gold-soft px-2.5 py-1 text-[11px] font-bold text-[#8a5a00] tabular-nums">
              <Coins className="size-3" />
              {formatTzs(stats.earned)}
            </span>
          </>
        }
        title={t("admin.agents.title")}
      />

      {created ? (
        <Notice tone="success">
          <span className="flex flex-wrap items-center gap-2">
            {t("admin.agents.create.success")}
            <Link className="font-bold underline" href={`/admin/agents/${created.id}`}>
              {t("admin.agents.create.openNew")} — {created.referralCode}
            </Link>
          </span>
        </Notice>
      ) : null}

      {/* ── Summary ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdvoKpi
          hint={t("admin.agents.kpi.totalHint", { suspended: stats.suspended })}
          icon={<UserCheck />}
          iconTone="violet"
          label={t("admin.agents.kpi.total")}
          value={stats.total}
        />
        <AdvoKpi
          hint={t("admin.agents.kpi.activeHint")}
          icon={<ShieldCheck />}
          iconTone="success"
          label={t("admin.agents.kpi.active")}
          value={stats.active}
        />
        <AdvoKpi
          hint={t("admin.agents.kpi.referralsHint", { active: stats.activeReferrals })}
          icon={<Award />}
          iconTone="accent"
          label={t("admin.agents.kpi.referrals")}
          value={stats.referrals}
        />
        <AdvoKpi
          hint={t("admin.agents.kpi.earnedHint", { count: stats.accruals })}
          icon={<Coins />}
          iconTone="gold"
          label={t("admin.agents.kpi.earned")}
          value={formatTzs(stats.earned)}
        />
      </div>

      {/* ── Search & filter ── */}
      <Card className="gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70">
        <SectionHeader
          action={
            <span className="rounded-full bg-advo-surface-soft px-2.5 py-1 text-[11px] font-bold text-advo-muted tabular-nums">
              {visible.length} / {rows.length}
            </span>
          }
          description={t("admin.agents.search.placeholder")}
          icon={<Filter />}
          iconTone="violet"
          title={t("admin.agents.title")}
        />
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-advo-muted" />
            <Input
              aria-label={t("admin.agents.search.label")}
              className="pl-9"
              placeholder={t("admin.agents.search.placeholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group">
            {FILTERS.map((key) => (
              <button
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
                  filter === key
                    ? "bg-advo-blue text-white"
                    : "bg-advo-surface-soft text-advo-muted hover:bg-advo-blue-soft hover:text-advo-blue"
                }`}
                key={key}
                onClick={() => setFilter(key)}
                type="button"
              >
                {t(FILTER_LABEL[key])}
                {key !== "all" ? (
                  <span className="ml-1.5 tabular-nums opacity-70">
                    {key === "active" ? stats.active : stats.suspended}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* ── Cards ── */}
      <ResourceView resource={agents}>
        {() =>
          visible.length === 0 ? (
            <Card className="shadow-advo-card ring-1 ring-advo-border/70">
              <span className="flex flex-col items-center gap-2 py-6">
                <SoftIcon size="lg" tone={rows.length === 0 ? "violet" : "accent"}>
                  <UserCheck />
                </SoftIcon>
                <span className="text-sm font-bold text-advo-text">
                  {rows.length === 0 ? t("admin.agents.emptyNone") : t("admin.agents.empty")}
                </span>
                <span className="max-w-md text-center text-xs text-advo-muted">
                  {rows.length === 0 ? t("admin.agents.emptyNoneHint") : t("admin.agents.emptyHint")}
                </span>
              </span>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {visible.map((row) => (
                <AgentCard key={row.id} onChanged={agents.reload} row={row} />
              ))}
            </div>
          )
        }
      </ResourceView>
    </div>
  );
}

/** One agent, with the actions an operator needs straight from the list. */
function AgentCard({ row, onChanged }: { row: AgentRow; onChanged: () => Promise<void> }) {
  const { t } = useI18n();
  const suspended = row.status !== "ACTIVE";
  const earned = BigInt(row.commission.creditedTzs);

  const operator = useOperatorActions({
    basePath: `/admin/agents/${row.id}`,
    copy: agentOperatorCopy(t, row.user.name),
    onChanged,
    redirectTo: "/agent",
    target: { displayName: row.user.name, suspended },
  });

  return (
    <Card className="group gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-advo-lift">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <SoftIcon size="lg" tone={suspended ? "danger" : "violet"}>
            <UserCheck />
          </SoftIcon>
          <div className="min-w-0">
            <Link
              className="truncate text-base font-black tracking-tight text-advo-text hover:text-advo-blue"
              href={`/admin/agents/${row.id}`}
            >
              {row.user.name}
            </Link>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-advo-muted">
              <UserRound className="size-3" />
              <span className="truncate">{row.user.email}</span>
              {row.user.phone ? <span className="truncate">· {row.user.phone}</span> : null}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusChip>{row.status}</StatusChip>
          <span className="rounded-md bg-advo-gold-soft px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#8a5a00]">
            {row.referralCode}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label={t("admin.agents.col.referrals")}
          value={
            <span className="text-sm font-bold text-advo-text tabular-nums">
              {t("admin.agents.network", { referrals: row._count.attributions, leads: row._count.leads })}
            </span>
          }
        />
        <Stat
          label={t("admin.agents.col.earned")}
          value={
            earned > 0n ? (
              <span className="text-sm font-bold text-advo-text tabular-nums">{formatTzs(earned)}</span>
            ) : (
              <span className="text-xs text-advo-muted italic">{t("admin.agents.earned.none")}</span>
            )
          }
        />
        <Stat
          label={t("admin.agents.col.joined")}
          value={<span className="text-xs font-semibold text-advo-muted">{formatDateTime(row.createdAt)}</span>}
        />
      </div>

      {operator.error ? (
        <p className="rounded-lg bg-advo-danger-soft px-3 py-2 text-[11px] font-semibold text-[#b91c1c]">{operator.error}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--advo-border)] pt-3.5">
        <Link
          className="inline-flex items-center gap-1.5 rounded-lg bg-advo-blue px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-advo-blue-hover"
          href={`/admin/agents/${row.id}`}
        >
          <ExternalLink className="size-3.5" />
          {t("admin.agents.action.open")}
        </Link>
        <Button
          isDisabled={operator.busy !== null}
          onPress={() => operator.open("impersonate")}
          size="sm"
          type="button"
          variant="outline"
        >
          <LogIn className="size-3.5" />
          {operator.busy === "impersonate" ? "…" : t("admin.agents.action.impersonate")}
        </Button>
        <Button
          className={suspended ? undefined : "ml-auto"}
          isDisabled={operator.busy !== null}
          onPress={() => operator.open("status")}
          size="sm"
          type="button"
          variant={suspended ? "outline" : "danger-soft"}
        >
          {suspended ? <ShieldCheck className="size-3.5" /> : <TriangleAlert className="size-3.5" />}
          {operator.busy === "status"
            ? "…"
            : suspended
              ? t("admin.agents.action.reactivate")
              : t("admin.agents.action.suspend")}
        </Button>
      </div>

      <OperatorDialog actions={operator} />
    </Card>
  );
}

/** Small labelled value block used inside the agent card. */
function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold tracking-wider text-advo-muted uppercase">{label}</p>
      <div className="mt-0.5 min-w-0">{value}</div>
    </div>
  );
}

/** Opens a modal that creates an agent and reports the new account back to the list. */
function CreateAgentButton({
  onCreated,
}: {
  onCreated: (created: { id: string; referralCode: string }) => void;
}) {
  const { t } = useI18n();
  const overlay = useOverlayState();
  const [created, setCreated] = useState<{ id: string; referralCode: string } | null>(null);
  const create = useAction(
    async (form: HTMLFormElement) => {
      const values = formValues(form);
      // The contract wants the code in a single canonical case.
      values.referralCode = (values.referralCode ?? "").toUpperCase();
      const result = await api.post<{ agentId: string; referralCode: string }>("/admin/agents", values);
      form.reset();
      const payload = { id: result.agentId, referralCode: result.referralCode };
      setCreated(payload);
      onCreated(payload);
    },
  );

  function close() {
    overlay.close();
    setCreated(null);
    create.setError(null);
  }

  return (
    <>
      <Button
        onPress={() => {
          setCreated(null);
          create.setError(null);
          overlay.open();
        }}
        size="sm"
        type="button"
        variant="primary"
      >
        <Plus className="size-4" />
        {t("admin.agents.action.create")}
      </Button>

      <Modal.Root state={overlay}>
        <Modal.Backdrop>
          <Modal.Container size="lg">
            <Modal.Dialog className="bg-white">
              <Modal.Header>
                <Modal.Heading className="text-base font-black text-advo-text">
                  {t("admin.agents.create.title")}
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                {created ? (
                  <div className="space-y-4">
                    <Notice tone="success">{t("admin.agents.create.success")}</Notice>
                    <Link
                      className="inline-flex items-center gap-1.5 text-sm font-bold text-advo-blue underline"
                      href={`/admin/agents/${created.id}`}
                      onClick={close}
                    >
                      {t("admin.agents.create.openNew")} — {created.referralCode}
                      <ExternalLink className="size-3.5" />
                    </Link>
                    <div className="flex justify-end border-t border-[var(--advo-border)] pt-4">
                      <Button onPress={close} type="button" variant="primary">
                        {t("admin.agents.create.cancel")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void create.run(e.currentTarget);
                    }}
                  >
                    <p className="text-xs text-advo-muted">{t("admin.agents.create.description")}</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={t("admin.agents.create.name")} name="name" required />
                      <Field
                        hint={t("admin.agents.create.referralCodeHint")}
                        label={t("admin.agents.create.referralCode")}
                        name="referralCode"
                        placeholder={t("admin.agents.create.referralCodePlaceholder")}
                        required
                      />
                      <Field label={t("admin.agents.create.email")} name="email" required type="email" />
                      <Field
                        hint={t("admin.agents.create.phoneHint")}
                        label={t("admin.agents.create.phone")}
                        name="phone"
                        placeholder="0712 345 678"
                        required
                      />
                      <Field
                        hint={t("admin.agents.create.passwordHint")}
                        label={t("admin.agents.create.password")}
                        name="password"
                        required
                        type="password"
                      />
                    </div>
                    {create.error ? <Notice tone="danger">{create.error}</Notice> : null}
                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--advo-border)] pt-4">
                      <Button onPress={close} type="button" variant="ghost">
                        {t("admin.agents.create.cancel")}
                      </Button>
                      <Button isDisabled={create.pending} type="submit" variant="primary">
                        <Plus className="size-4" />
                        {create.pending ? "…" : t("admin.agents.create.submit")}
                      </Button>
                    </div>
                  </form>
                )}
              </Modal.Body>
              <Modal.CloseTrigger aria-label={t("admin.agents.create.cancel")} />
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>
    </>
  );
}
