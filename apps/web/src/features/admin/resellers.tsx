"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatDateTime } from "@advo/api-client";
import { useOverlayState } from "@heroui/react";
import { Button, Card, Input, Modal } from "@heroui/react";
import { AdvoKpi, AdvoSelect, Notice, SoftIcon, StatusChip } from "@advo/ui";
import {
  Building2,
  ExternalLink,
  Filter,
  LogIn,
  MapPin,
  Plus,
  Search,
  ShieldOff,
  Store,
  TriangleAlert,
  UserCog,
  UserRound,
  Users,
  Wifi,
} from "lucide-react";
import { Field, PageHero, ResourceView, SectionHeader } from "@/features/common/components";
import { OperatorDialog, resellerOperatorCopy, useOperatorActions } from "@/features/admin/operator-dialog";
import { ResellerEditDialog } from "@/features/admin/reseller-edit";
import { api, errorMessage } from "@/lib/api";
import { formValues, useAction, useResource } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

export type ResellerRow = {
  id: string;
  businessName: string;
  slug: string;
  status: string;
  registrationSource: string;
  onboardingStep: string;
  createdAt: string;
  owner: { email: string; phone: string | null; name: string; emailVerifiedAt: string | null };
  subscription: { state: string; currentPeriodEnd: string | null } | null;
  attribution: { source: string; agent: { referralCode: string } | null } | null;
  _count: { sites: number; devices: number };
};

type AgentOption = { id: string; referralCode: string; status: string; user: { name: string } };

/** Status buckets the pill filter cycles through. */
const FILTERS = ["all", "active", "suspended", "pending"] as const;
type FilterKey = (typeof FILTERS)[number];

/** Static labels keep the translator call fully typed instead of built from a template. */
const FILTER_LABEL: Record<FilterKey, "admin.resellers.filter.all" | "admin.resellers.filter.active" | "admin.resellers.filter.suspended" | "admin.resellers.filter.pending"> = {
  all: "admin.resellers.filter.all",
  active: "admin.resellers.filter.active",
  suspended: "admin.resellers.filter.suspended",
  pending: "admin.resellers.filter.pending",
};

/** Which bucket a reseller falls into; unknown states land in "pending" rather than vanishing. */
function bucketOf(status: string): Exclude<FilterKey, "all"> {
  if (status === "ACTIVE") return "active";
  if (status === "SUSPENDED" || status === "CLOSED") return "suspended";
  return "pending";
}

export function AdminResellersScreen() {
  const { t } = useI18n();
  const resellers = useResource<ResellerRow[]>("/admin/resellers");
  const agents = useResource<AgentOption[]>("/admin/agents");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [created, setCreated] = useState<{ id: string; businessName: string } | null>(null);

  const rows = resellers.data ?? [];

  const stats = useMemo(() => {
    const active = rows.filter((r) => r.status === "ACTIVE").length;
    const suspended = rows.filter((r) => r.status === "SUSPENDED" || r.status === "CLOSED").length;
    const pending = rows.length - active - suspended;
    const devices = rows.reduce((sum, r) => sum + r._count.devices, 0);
    const sites = rows.reduce((sum, r) => sum + r._count.sites, 0);
    return { total: rows.length, active, suspended, pending, devices, sites };
  }, [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && bucketOf(r.status) !== filter) return false;
      if (!needle) return true;
      return [r.businessName, r.owner.name, r.owner.email, r.slug, r.owner.phone ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [rows, query, filter]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-4">
      <PageHero
        actions={<CreateResellerButton agents={agents.data ?? []} onCreated={setCreated} />}
        description={t("admin.resellers.description")}
        eyebrow={t("admin.resellers.eyebrow")}
        icon={<Store />}
        iconTone="accent"
        meta={
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--advo-border)] bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-advo-muted tabular-nums">
              <Users className="size-3" />
              {t("admin.resellers.count", { count: stats.total })}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-advo-success-soft px-2.5 py-1 text-[11px] font-bold text-emerald-700 tabular-nums">
              <Wifi className="size-3" />
              {t("admin.resellers.network", { sites: stats.sites, devices: stats.devices })}
            </span>
          </>
        }
        title={t("admin.resellers.title")}
      />

      {created ? (
        <Notice tone="success">
          <span className="flex flex-wrap items-center gap-2">
            {t("admin.resellers.create.success")}
            <Link className="font-bold underline" href={`/admin/resellers/${created.id}`}>
              {t("admin.resellers.create.openNew")} — {created.businessName}
            </Link>
          </span>
        </Notice>
      ) : null}

      {/* ── Summary ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdvoKpi
          hint={t("admin.resellers.kpi.totalHint", { pending: stats.pending })}
          icon={<Store />}
          iconTone="accent"
          label={t("admin.resellers.kpi.total")}
          value={stats.total}
        />
        <AdvoKpi
          hint={t("admin.resellers.kpi.activeHint")}
          icon={<Wifi />}
          iconTone="success"
          label={t("admin.resellers.kpi.active")}
          value={stats.active}
        />
        <AdvoKpi
          hint={t("admin.resellers.kpi.suspendedHint")}
          icon={<ShieldOff />}
          iconTone="danger"
          label={t("admin.resellers.kpi.suspended")}
          value={stats.suspended}
        />
        <AdvoKpi
          hint={t("admin.resellers.kpi.devicesHint", { sites: stats.sites })}
          icon={<MapPin />}
          iconTone="teal"
          label={t("admin.resellers.kpi.devices")}
          value={stats.devices}
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
          description={t("admin.resellers.search.placeholder")}
          icon={<Filter />}
          iconTone="violet"
          title={t("admin.resellers.title")}
        />
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-advo-muted" />
            <Input
              aria-label={t("admin.resellers.search.label")}
              className="pl-9"
              placeholder={t("admin.resellers.search.placeholder")}
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
                    {key === "active" ? stats.active : key === "suspended" ? stats.suspended : stats.pending}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* ── Cards ── */}
      <ResourceView resource={resellers}>
        {() =>
          visible.length === 0 ? (
            <Card className="shadow-advo-card ring-1 ring-advo-border/70">
              <span className="flex flex-col items-center gap-2 py-6">
                <SoftIcon size="lg" tone={rows.length === 0 ? "accent" : "violet"}>
                  <Store />
                </SoftIcon>
                <span className="text-sm font-bold text-advo-text">
                  {rows.length === 0 ? t("admin.resellers.emptyNone") : t("admin.resellers.empty")}
                </span>
                <span className="max-w-md text-center text-xs text-advo-muted">
                  {rows.length === 0 ? t("admin.resellers.emptyNoneHint") : t("admin.resellers.emptyHint")}
                </span>
              </span>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {visible.map((row) => (
                <ResellerCard key={row.id} onChanged={resellers.reload} row={row} />
              ))}
            </div>
          )
        }
      </ResourceView>
    </div>
  );
}

/** One reseller, with the actions an operator actually needs from the list. */
function ResellerCard({
  row,
  onChanged,
}: {
  row: ResellerRow;
  onChanged: () => Promise<void>;
}) {
  const { t } = useI18n();
  const suspended = row.status === "SUSPENDED" || row.status === "CLOSED";

  const operator = useOperatorActions({
    basePath: `/admin/resellers/${row.id}`,
    copy: resellerOperatorCopy(t, row.businessName),
    onChanged,
    redirectTo: "/reseller",
    // Only resellers carry a referral attribution.
    showAttribution: true,
    target: { displayName: row.businessName, suspended, attributionCode: row.attribution?.agent?.referralCode },
  });

  return (
    <Card className="group gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-advo-lift">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <SoftIcon size="lg" tone={suspended ? "danger" : "accent"}>
            <Building2 />
          </SoftIcon>
          <div className="min-w-0">
            <Link
              className="truncate text-base font-black tracking-tight text-advo-text hover:text-advo-blue"
              href={`/admin/resellers/${row.id}`}
            >
              {row.businessName}
            </Link>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-advo-muted">
              <UserRound className="size-3" />
              <span className="truncate font-semibold text-advo-text">{row.owner.name}</span>
              <span className="truncate">· {row.owner.email}</span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusChip>{row.status}</StatusChip>
          <span className="font-mono text-[10px] text-advo-muted">{row.slug}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label={t("admin.resellers.col.plan")}
          value={
            row.subscription ? (
              <span className="flex flex-wrap items-center gap-1.5">
                <StatusChip>{row.subscription.state}</StatusChip>
                {row.subscription.currentPeriodEnd ? (
                  <span className="text-[10px] text-advo-muted">
                    {t("admin.resellers.sub.until", { when: formatDateTime(row.subscription.currentPeriodEnd) })}
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="text-xs text-advo-muted italic">{t("admin.resellers.sub.none")}</span>
            )
          }
        />
        <Stat
          label={t("admin.resellers.col.network")}
          value={
            <span className="text-sm font-bold text-advo-text tabular-nums">
              {t("admin.resellers.network", { sites: row._count.sites, devices: row._count.devices })}
            </span>
          }
        />
        <Stat
          label={t("admin.resellers.col.referred")}
          value={
            row.attribution?.agent ? (
              <span className="rounded-md bg-advo-gold-soft px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#8a5a00]">
                {row.attribution.agent.referralCode}
              </span>
            ) : (
              <span className="text-xs text-advo-muted italic">{t("admin.resellers.referred.none")}</span>
            )
          }
        />
      </div>

      {operator.error ? (
        <p className="rounded-lg bg-advo-danger-soft px-3 py-2 text-[11px] font-semibold text-[#b91c1c]">{operator.error}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--advo-border)] pt-3.5">
        <Link
          className="inline-flex items-center gap-1.5 rounded-lg bg-advo-blue px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-advo-blue-hover"
          href={`/admin/resellers/${row.id}`}
        >
          <ExternalLink className="size-3.5" />
          {t("admin.resellers.action.open")}
        </Link>
        <ResellerEditDialog onSaved={onChanged} reseller={row} variant="ghost" />
        <Button
          isDisabled={operator.busy !== null}
          onPress={() => operator.open("impersonate")}
          size="sm"
          type="button"
          variant="outline"
        >
          <LogIn className="size-3.5" />
          {operator.busy === "impersonate" ? "…" : t("admin.resellers.action.impersonate")}
        </Button>
        <Button
          isDisabled={operator.busy !== null}
          onPress={() => operator.open("attribution")}
          size="sm"
          type="button"
          variant="ghost"
        >
          <UserCog className="size-3.5" />
          {t("admin.resellers.action.attribution")}
        </Button>
        <Button
          className={suspended ? undefined : "ml-auto"}
          isDisabled={operator.busy !== null}
          onPress={() => operator.open("status")}
          size="sm"
          type="button"
          variant={suspended ? "outline" : "danger-soft"}
        >
          {suspended ? <Wifi className="size-3.5" /> : <TriangleAlert className="size-3.5" />}
          {operator.busy === "status"
            ? "…"
            : suspended
              ? t("admin.resellers.action.reactivate")
              : t("admin.resellers.action.suspend")}
        </Button>
      </div>

      <OperatorDialog actions={operator} />
    </Card>
  );
}

/** Small labelled value block used inside the reseller card. */
function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold tracking-wider text-advo-muted uppercase">{label}</p>
      <div className="mt-0.5 min-w-0">{value}</div>
    </div>
  );
}

/** Opens a modal that creates a reseller and reports the new account back to the list. */
function CreateResellerButton({
  agents,
  onCreated,
}: {
  agents: AgentOption[];
  onCreated: (created: { id: string; businessName: string }) => void;
}) {
  const { t } = useI18n();
  const overlay = useOverlayState();
  const [created, setCreated] = useState<{ id: string; businessName: string } | null>(null);
  const create = useAction(
    async (form: HTMLFormElement) => {
      const values = formValues(form);
      const result = await api.post<{ id: string; businessName: string }>("/admin/resellers", values);
      form.reset();
      setCreated(result);
      onCreated(result);
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
        {t("admin.resellers.action.create")}
      </Button>

      <Modal.Root state={overlay}>
        <Modal.Backdrop>
          <Modal.Container size="lg">
            <Modal.Dialog className="bg-white">
              <Modal.Header>
                <Modal.Heading className="text-base font-black text-advo-text">
                  {t("admin.resellers.create.title")}
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                {created ? (
                  <div className="space-y-4">
                    <Notice tone="success">{t("admin.resellers.create.success")}</Notice>
                    <Link
                      className="inline-flex items-center gap-1.5 text-sm font-bold text-advo-blue underline"
                      href={`/admin/resellers/${created.id}`}
                      onClick={close}
                    >
                      {t("admin.resellers.create.openNew")} — {created.businessName}
                      <ExternalLink className="size-3.5" />
                    </Link>
                    <div className="flex justify-end border-t border-[var(--advo-border)] pt-4">
                      <Button onPress={close} type="button" variant="primary">
                        {t("admin.resellers.create.cancel")}
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
                    <p className="text-xs text-advo-muted">{t("admin.resellers.create.description")}</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        label={t("admin.resellers.create.businessName")}
                        name="businessName"
                        placeholder={t("admin.resellers.create.businessNamePlaceholder")}
                        required
                      />
                      <Field label={t("admin.resellers.create.ownerName")} name="ownerName" required />
                      <Field label={t("admin.resellers.create.email")} name="email" required type="email" />
                      <Field
                        hint={t("admin.resellers.create.phoneHint")}
                        label={t("admin.resellers.create.phone")}
                        name="phone"
                        placeholder="0712 345 678"
                        required
                      />
                      <Field
                        hint={t("admin.resellers.create.passwordHint")}
                        label={t("admin.resellers.create.password")}
                        name="password"
                        required
                        type="password"
                      />
                      <div>
                        <label className="text-xs font-semibold" htmlFor="agent-select">
                          {t("admin.resellers.create.referralCode")}
                        </label>
                        <AdvoSelect id="agent-select" name="referralCode">
                          <option value="">—</option>
                          {agents
                            .filter((a) => a.status === "ACTIVE")
                            .map((a) => (
                              <option key={a.id} value={a.referralCode}>
                                {a.referralCode} — {a.user.name}
                              </option>
                            ))}
                        </AdvoSelect>
                        <p className="mt-1 text-xs text-advo-muted">{t("admin.resellers.create.referralCodeHint")}</p>
                      </div>
                    </div>
                    {create.error ? <Notice tone="danger">{create.error}</Notice> : null}
                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--advo-border)] pt-4">
                      <Button onPress={close} type="button" variant="ghost">
                        {t("admin.resellers.create.cancel")}
                      </Button>
                      <Button isDisabled={create.pending} type="submit" variant="primary">
                        <Plus className="size-4" />
                        {create.pending ? "…" : t("admin.resellers.create.submit")}
                      </Button>
                    </div>
                  </form>
                )}
              </Modal.Body>
              <Modal.CloseTrigger aria-label={t("admin.resellers.create.cancel")} />
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>
    </>
  );
}
