"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, Card, Label, Modal, useOverlayState } from "@heroui/react";
import { Notice } from "@advo/ui";
import {
  Briefcase,
  CalendarClock,
  Check,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  Filter,
  Globe2,
  MapPin,
  Palmtree,
  Pencil,
  Plus,
  Rocket,
  Search,
  Sparkles,
  Ticket,
  Trash2,
  Wallet,
} from "lucide-react";
import { Field, PageHero, ResourceView, SelectField } from "@/features/common/components";
import { ActionButton } from "@/features/common/actions";
import { api, errorMessage } from "@/lib/api";
import { formValues, toInt, useAction, useResource, type Resource } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

type Kind = "JOB" | "OPPORTUNITY" | "LOCAL_EVENT" | "HOLIDAY";
type Source = "MANUAL" | "AI";
type Status = "LIVE" | "DRAFT" | "SCHEDULED" | "EXPIRED";

/**
 * One row of the guest Explore feed. Jobs, opportunities, local events and
 * holidays share this shape; the admin form shows only the fields that matter
 * for the chosen type.
 */
type ListingRow = {
  id: string;
  kind: Kind;
  title: string;
  organization: string;
  location: string;
  employmentType: string;
  summary: string;
  description: string;
  venue: string;
  region: string;
  link: string;
  contactPhone: string;
  priceLabel: string;
  imageUrl: string | null;
  tags: string[];
  startsAt: string | null;
  endsAt: string | null;
  publishedAt: string | null;
  source: Source;
  sourceUrl: string;
  aiModel: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type ListingResponse = {
  items: ListingRow[];
  total: number;
  counts: {
    all: number;
    kinds: Partial<Record<Kind, number>>;
    ai: number;
    manual: number;
    live: number;
    scheduled: number;
    drafts: number;
  };
};

type AiSettings = {
  enabled: boolean;
  assistantName: string;
  model: string;
  analysesPerDay: number;
  postsPerDay: number;
  times: string[];
  timezone: string;
  kinds: Kind[];
  regions: string[];
  autoPublish: boolean;
  publishDelayMinutes: number;
  minScore: number;
};

type AiRun = {
  id: string;
  trigger: "SCHEDULE" | "MANUAL";
  status: "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED";
  model: string;
  analysedCount: number;
  postedCount: number;
  skippedCount: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

type AiOverview = {
  settings: AiSettings;
  runs: AiRun[];
  stats: { aiToday: number; drafts: number; totalAi: number; postedToday: number };
  nextRunAt: string | null;
  apiConfigured: boolean;
};

const KINDS: Kind[] = ["JOB", "OPPORTUNITY", "LOCAL_EVENT", "HOLIDAY"];

const KIND_STYLE: Record<Kind, { icon: typeof Briefcase; className: string }> = {
  JOB: { icon: Briefcase, className: "bg-advo-blue/10 text-advo-blue" },
  OPPORTUNITY: { icon: Rocket, className: "bg-violet-100 text-violet-700" },
  LOCAL_EVENT: { icon: Ticket, className: "bg-fuchsia-100 text-fuchsia-700" },
  HOLIDAY: { icon: Palmtree, className: "bg-emerald-100 text-emerald-700" },
};

const STATUS_STYLE: Record<Status, string> = {
  LIVE: "bg-emerald-50 text-emerald-700",
  SCHEDULED: "bg-amber-50 text-amber-700",
  DRAFT: "bg-slate-100 text-advo-muted",
  EXPIRED: "bg-rose-50 text-rose-700",
};

function statusOf(row: ListingRow): Status {
  const now = Date.now();
  if (!row.active) return "DRAFT";
  if (row.publishedAt && new Date(row.publishedAt).getTime() > now) return "SCHEDULED";
  if (row.endsAt && new Date(row.endsAt).getTime() < now) return "EXPIRED";
  return "LIVE";
}

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function tagsToText(tags: string[]): string {
  return tags.join(", ");
}

export function AdminListingsScreen() {
  const { t } = useI18n();
  const listings = useResource<ListingResponse>("/admin/listings");
  const ai = useResource<AiOverview>("/admin/listing-ai");

  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"ALL" | Kind>("ALL");
  const [source, setSource] = useState<"ALL" | Source>("ALL");
  const [status, setStatus] = useState<"ALL" | Status>("ALL");
  const [sort, setSort] = useState<"newest" | "oldest" | "order" | "soonest">("newest");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [editing, setEditing] = useState<ListingRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const items = listings.data?.items ?? [];
  const counts = listings.data?.counts;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = items.filter((row) => {
      if (kind !== "ALL" && row.kind !== kind) return false;
      if (source !== "ALL" && row.source !== source) return false;
      if (status !== "ALL" && statusOf(row) !== status) return false;
      if (!needle) return true;
      return [row.title, row.organization, row.location, row.venue, row.region, row.summary, row.sourceUrl, ...row.tags]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
    return [...filtered].sort((a, b) => {
      if (sort === "oldest") return +new Date(a.createdAt) - +new Date(b.createdAt);
      if (sort === "order") return a.sortOrder - b.sortOrder;
      if (sort === "soonest") {
        const left = a.startsAt ? +new Date(a.startsAt) : Number.MAX_SAFE_INTEGER;
        const right = b.startsAt ? +new Date(b.startsAt) : Number.MAX_SAFE_INTEGER;
        return left - right;
      }
      return +new Date(b.createdAt) - +new Date(a.createdAt);
    });
  }, [items, q, kind, source, status, sort]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(row: ListingRow) {
    setEditing(row);
    setFormOpen(true);
  }

  function toggleSelect(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function refreshAll() {
    await Promise.all([listings.reload(), ai.reload()]);
  }

  const activeFilterCount = [kind !== "ALL", source !== "ALL", status !== "ALL", q.trim() !== ""].filter(Boolean).length;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHero
        actions={
          <>
            <Button onPress={() => setAiOpen(true)} type="button" variant="outline">
              <Sparkles className="size-3.5" />
              {t("admin.listings.ai.button")}
              {ai.data?.settings.enabled ? (
                <span className="ms-1 inline-flex size-2 rounded-full bg-emerald-500" aria-hidden />
              ) : null}
            </Button>
            <Button onPress={openCreate} type="button" variant="primary">
              <Plus className="size-3.5" />
              {t("admin.listings.new")}
            </Button>
          </>
        }
        description={t("admin.listings.subtitle")}
        eyebrow={t("admin.listings.badge")}
        icon={<Globe2 />}
        iconTone="accent"
        meta={
          counts ? (
            <>
              <Chip tone="emerald">{t("admin.listings.counts.live")}: {counts.live}</Chip>
              <Chip tone="violet">
                <Sparkles className="size-3" />
                {t("admin.listings.counts.ai")}: {counts.ai}
              </Chip>
              <Chip tone="amber">{t("admin.listings.counts.scheduled")}: {counts.scheduled}</Chip>
              <Chip tone="slate">{t("admin.listings.counts.drafts")}: {counts.drafts}</Chip>
            </>
          ) : null
        }
        title={t("admin.listings.title")}
      />

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-56 flex-1">
            <span className="sr-only">{t("admin.listings.searchPlaceholder")}</span>
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-advo-muted" />
            <input
              className="w-full rounded-xl border border-[var(--advo-border)] bg-white py-2.5 pe-9 ps-9 text-sm outline-none focus:border-advo-blue"
              onChange={(event) => setQ(event.target.value)}
              placeholder={t("admin.listings.searchPlaceholder")}
              type="search"
              value={q}
            />
            {q ? (
              <button
                className="absolute end-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-advo-muted hover:bg-slate-100"
                onClick={() => setQ("")}
                type="button"
              >
                ×
              </button>
            ) : null}
          </label>

          <FilterSelect
            label={t("admin.listings.filter.type")}
            onChange={(value) => setKind(value as "ALL" | Kind)}
            options={[
              { value: "ALL", label: t("admin.listings.filter.allTypes") },
              ...KINDS.map((value) => ({ value, label: t(`admin.listings.kind.${value}` as "admin.listings.kind.JOB") })),
            ]}
            value={kind}
          />
          <FilterSelect
            label={t("admin.listings.filter.source")}
            onChange={(value) => setSource(value as "ALL" | Source)}
            options={[
              { value: "ALL", label: t("admin.listings.filter.allSources") },
              { value: "AI", label: t("admin.listings.source.AI") },
              { value: "MANUAL", label: t("admin.listings.source.MANUAL") },
            ]}
            value={source}
          />
          <FilterSelect
            label={t("admin.listings.filter.status")}
            onChange={(value) => setStatus(value as "ALL" | Status)}
            options={[
              { value: "ALL", label: t("admin.listings.filter.allStatuses") },
              { value: "LIVE", label: t("admin.listings.status.LIVE") },
              { value: "SCHEDULED", label: t("admin.listings.status.SCHEDULED") },
              { value: "DRAFT", label: t("admin.listings.status.DRAFT") },
              { value: "EXPIRED", label: t("admin.listings.status.EXPIRED") },
            ]}
            value={status}
          />
          <FilterSelect
            label={t("admin.listings.filter.sort")}
            onChange={(value) => setSort(value as typeof sort)}
            options={[
              { value: "newest", label: t("admin.listings.sort.newest") },
              { value: "oldest", label: t("admin.listings.sort.oldest") },
              { value: "soonest", label: t("admin.listings.sort.soonest") },
              { value: "order", label: t("admin.listings.sort.order") },
            ]}
            value={sort}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-advo-muted">
          <span className="inline-flex items-center gap-1.5">
            <Filter className="size-3.5" />
            {t("admin.listings.resultCount", { count: rows.length })}
            {activeFilterCount > 0 ? ` · ${t("admin.listings.filtersActive", { count: activeFilterCount })}` : ""}
          </span>
          {selected.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-advo-text">{t("admin.listings.selected", { count: selected.size })}</span>
              <ActionButton
                onDone={async () => {
                  setSelected(new Set());
                  await listings.reload();
                }}
                onRun={() => api.post("/admin/listings/bulk", { ids: [...selected], action: "activate" })}
                variant="secondary"
              >
                {t("admin.listings.bulk.activate")}
              </ActionButton>
              <ActionButton
                onDone={async () => {
                  setSelected(new Set());
                  await listings.reload();
                }}
                onRun={() => api.post("/admin/listings/bulk", { ids: [...selected], action: "deactivate" })}
                variant="secondary"
              >
                {t("admin.listings.bulk.deactivate")}
              </ActionButton>
              <ActionButton
                confirm={t("admin.listings.bulk.confirmDelete", { count: selected.size })}
                onDone={async () => {
                  setSelected(new Set());
                  await listings.reload();
                }}
                onRun={() => api.post("/admin/listings/bulk", { ids: [...selected], action: "delete" })}
                variant="danger"
              >
                {t("admin.listings.bulk.delete")}
              </ActionButton>
            </div>
          ) : null}
        </div>
      </Card>

      <ResourceView resource={listings}>
        {() =>
          rows.length === 0 ? (
            <Card className="p-10 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-advo-blue/10 text-advo-blue">
                <Search className="h-6 w-6" />
              </span>
              <p className="mt-3 text-sm text-advo-muted">
                {items.length === 0 ? t("admin.listings.empty") : t("admin.listings.emptyFilter")}
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {rows.map((row) => (
                <ListingCard
                  key={row.id}
                  onDelete={listings.reload}
                  onEdit={() => openEdit(row)}
                  onSelect={() => toggleSelect(row.id)}
                  onToggle={async () => {
                    await api.post(`/admin/listings/${row.id}/active`, { active: !row.active });
                    await listings.reload();
                  }}
                  row={row}
                  selected={selected.has(row.id)}
                />
              ))}
            </div>
          )
        }
      </ResourceView>

      <ListingFormModal
        listing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={refreshAll}
        open={formOpen}
      />

      <AiStudioModal
        ai={ai}
        onClose={() => setAiOpen(false)}
        onChanged={refreshAll}
        open={aiOpen}
      />
    </div>
  );
}

function Chip({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "emerald" | "violet" | "amber" | "slate";
}) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700",
    violet: "bg-violet-50 text-violet-700",
    amber: "bg-amber-50 text-amber-700",
    slate: "bg-slate-100 text-advo-muted",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${tones[tone]}`}>
      {children}
    </span>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        className="appearance-none rounded-xl border border-[var(--advo-border)] bg-white py-2.5 pe-8 ps-3 text-xs font-bold text-advo-text outline-none focus:border-advo-blue"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-[9px] text-advo-muted">▾</span>
    </label>
  );
}

function ListingCard({
  row,
  selected,
  onSelect,
  onEdit,
  onDelete,
  onToggle,
}: {
  row: ListingRow;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => Promise<void> | void;
  onToggle: () => Promise<void> | void;
}) {
  const { t, locale } = useI18n();
  const kind = KIND_STYLE[row.kind];
  const KindIcon = kind.icon;
  const status = statusOf(row);

  const dateText = (value: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(date);
  };

  const range =
    row.startsAt || row.endsAt
      ? [dateText(row.startsAt), dateText(row.endsAt)].filter(Boolean).join(" — ")
      : "";
  const place = [row.venue, row.location, row.region].filter(Boolean).join(", ");

  return (
    <Card className={`relative space-y-3 p-4 transition ${selected ? "ring-2 ring-advo-blue/40" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${kind.className}`}>
            <KindIcon className="size-3" />
            {t(`admin.listings.kind.${row.kind}` as "admin.listings.kind.JOB")}
          </span>
          {row.source === "AI" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-violet-600 to-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">
              <Sparkles className="size-3" />
              AI
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-advo-muted">
              {t("admin.listings.source.MANUAL")}
            </span>
          )}
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[status]}`}>
            {t(`admin.listings.status.${status}` as "admin.listings.status.LIVE")}
          </span>
        </div>
        <input
          aria-label={t("admin.listings.selectOne")}
          checked={selected}
          className="mt-0.5 size-4 accent-advo-blue"
          onChange={onSelect}
          type="checkbox"
        />
      </div>

      <div>
        <p className="text-sm font-black leading-tight text-advo-text">{row.title}</p>
        {row.organization ? <p className="text-xs text-advo-muted">{row.organization}</p> : null}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-advo-muted">
        {place ? (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3 shrink-0" />
            {place}
          </span>
        ) : null}
        {range ? (
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="size-3 shrink-0" />
            {range}
          </span>
        ) : null}
        {row.priceLabel ? (
          <span className="inline-flex items-center gap-1">
            <Wallet className="size-3 shrink-0" />
            {row.priceLabel}
          </span>
        ) : null}
      </div>

      {row.summary ? <p className="line-clamp-2 text-xs leading-relaxed text-advo-muted">{row.summary}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--advo-border)] pt-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] text-advo-muted">
          {status === "SCHEDULED" && row.publishedAt ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {t("admin.listings.goesLive", { date: dateText(row.publishedAt) })}
            </span>
          ) : null}
          {row.source === "AI" && row.aiModel ? <span className="truncate">· {row.aiModel}</span> : null}
          {row.sourceUrl ? (
            <a
              className="inline-flex items-center gap-1 font-bold text-advo-blue hover:underline"
              href={row.sourceUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              <ExternalLink className="size-3" />
              {t("admin.listings.sourceLink")}
            </a>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <Button onPress={() => void onToggle()} size="sm" type="button" variant="ghost">
            {row.active ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {row.active ? t("admin.listings.hide") : t("admin.listings.show")}
          </Button>
          <Button onPress={onEdit} size="sm" type="button" variant="outline">
            <Pencil className="size-3.5" />
            {t("admin.listings.edit")}
          </Button>
          <ActionButton
            confirm={t("admin.listings.confirmDelete")}
            onDone={onDelete}
            onRun={() => api.del(`/admin/listings/${row.id}`)}
            variant="danger"
          >
            <Trash2 className="size-3.5" />
          </ActionButton>
        </div>
      </div>
    </Card>
  );
}

function ListingFormModal({
  open,
  listing,
  onClose,
  onSaved,
}: {
  open: boolean;
  listing: ListingRow | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const overlay = useOverlayState({ isOpen: open, onOpenChange: (next) => (!next ? onClose() : undefined) });
  const [done, setDone] = useState(false);
  const [kind, setKind] = useState<Kind>(listing?.kind ?? "JOB");

  useEffect(() => {
    if (open) {
      setDone(false);
      setKind(listing?.kind ?? "JOB");
    }
  }, [open, listing]);

  const save = useAction(async (form: HTMLFormElement) => {
    const v = formValues(form);
    const payload = {
      kind,
      title: v.title ?? "",
      organization: v.organization ?? "",
      location: v.location ?? "",
      employmentType: v.employmentType ?? "",
      summary: v.summary ?? "",
      description: v.description ?? "",
      venue: v.venue ?? "",
      region: v.region ?? "",
      link: v.link ?? "",
      contactPhone: v.contactPhone ?? "",
      priceLabel: v.priceLabel ?? "",
      imageUrl: v.imageUrl ?? null,
      tags: (v.tags ?? "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 12),
      startsAt: v.startsAt ?? null,
      endsAt: v.endsAt ?? null,
      sortOrder: toInt(v.sortOrder) ?? 0,
      active: v.active === "on",
      source: (listing?.source ?? "MANUAL") as Source,
      sourceUrl: v.sourceUrl ?? listing?.sourceUrl ?? "",
    };
    if (listing) await api.put(`/admin/listings/${listing.id}`, payload);
    else await api.post("/admin/listings", payload);
    form.reset();
    await onSaved();
    setDone(true);
  });

  function close() {
    setDone(false);
    save.setError(null);
    onClose();
  }

  const isJob = kind === "JOB" || kind === "OPPORTUNITY";
  const isEvent = kind === "LOCAL_EVENT";
  const isHoliday = kind === "HOLIDAY";
  const KindIcon = KIND_STYLE[kind].icon;

  return (
    <Modal.Root state={overlay}>
      <Modal.Backdrop>
        <Modal.Container size="lg">
          <Modal.Dialog className="max-h-[92vh] overflow-hidden bg-white">
            <Modal.Header>
              <Modal.Heading className="text-base font-black text-advo-text">
                {listing ? t("admin.listings.edit") : t("admin.listings.new")}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="overflow-y-auto">
              {done ? (
                <div className="space-y-4">
                  <Notice tone="success">{t("admin.listings.saved")}</Notice>
                  <div className="flex justify-end border-t border-[var(--advo-border)] pt-4">
                    <Button onPress={close} type="button" variant="primary">
                      {t("common.close")}
                    </Button>
                  </div>
                </div>
              ) : (
                <form
                  className="space-y-5"
                  key={listing?.id ?? "create"}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void save.run(event.currentTarget);
                  }}
                >
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-advo-muted">{t("admin.listings.kind")}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {KINDS.map((option) => {
                        const Icon = KIND_STYLE[option].icon;
                        const active = kind === option;
                        return (
                          <button
                            className={`flex flex-col items-start gap-1.5 rounded-xl border p-3 text-start transition ${
                              active
                                ? "border-advo-blue bg-advo-blue/5 ring-1 ring-advo-blue/30"
                                : "border-[var(--advo-border)] hover:border-advo-blue/40"
                            }`}
                            key={option}
                            onClick={() => setKind(option)}
                            type="button"
                          >
                            <Icon className={`size-4 ${active ? "text-advo-blue" : "text-advo-muted"}`} />
                            <span className={`text-[11px] font-bold ${active ? "text-advo-blue" : "text-advo-text"}`}>
                              {t(`admin.listings.kind.${option}` as "admin.listings.kind.JOB")}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-advo-muted">
                      <KindIcon className="size-3" />
                      {t(`admin.listings.hint.${kind}` as "admin.listings.hint.JOB")}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <Field defaultValue={listing?.title} label={t("admin.listings.titleField")} name="title" required />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field
                        defaultValue={listing?.organization}
                        label={
                          isEvent
                            ? t("admin.listings.organizationEvent")
                            : isHoliday
                              ? t("admin.listings.organizationHoliday")
                              : t("admin.listings.organization")
                        }
                        name="organization"
                      />
                      <Field
                        defaultValue={listing?.location}
                        label={isHoliday ? t("admin.listings.destination") : t("admin.listings.location")}
                        name="location"
                      />
                    </div>

                    {isJob ? (
                      <Field
                        defaultValue={listing?.employmentType}
                        label={t("admin.listings.employmentType")}
                        name="employmentType"
                        placeholder={t("admin.listings.employmentTypePlaceholder")}
                      />
                    ) : null}

                    {!isJob ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field defaultValue={listing?.venue} label={t("admin.listings.venue")} name="venue" />
                        <Field defaultValue={listing?.region} label={t("admin.listings.region")} name="region" />
                      </div>
                    ) : null}

                    {isJob ? (
                      <Field
                        defaultValue={toLocalInput(listing?.endsAt ?? null)}
                        hint={t("admin.listings.endsAtJobHint")}
                        label={t("admin.listings.endsAtJob")}
                        name="endsAt"
                        type="datetime-local"
                      />
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field
                          defaultValue={toLocalInput(listing?.startsAt ?? null)}
                          label={isEvent ? t("admin.listings.startsAtEvent") : t("admin.listings.startsAtHoliday")}
                          name="startsAt"
                          type="datetime-local"
                        />
                        <Field
                          defaultValue={toLocalInput(listing?.endsAt ?? null)}
                          label={isEvent ? t("admin.listings.endsAtEvent") : t("admin.listings.endsAtHoliday")}
                          name="endsAt"
                          type="datetime-local"
                        />
                      </div>
                    )}

                    {!isJob ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field
                          defaultValue={listing?.priceLabel}
                          label={t("admin.listings.priceLabel")}
                          name="priceLabel"
                          placeholder={t("admin.listings.pricePlaceholder")}
                        />
                        <Field
                          defaultValue={listing?.contactPhone}
                          label={t("admin.listings.contactPhone")}
                          name="contactPhone"
                          placeholder="+255…"
                        />
                      </div>
                    ) : null}

                    <Field
                      defaultValue={listing?.link}
                      hint={t("admin.listings.linkHint")}
                      label={
                        isEvent
                          ? t("admin.listings.linkEvent")
                          : isHoliday
                            ? t("admin.listings.linkHoliday")
                            : t("admin.listings.linkJob")
                      }
                      name="link"
                      placeholder="https://"
                    />

                    <div>
                      <Label htmlFor="f-summary">{t("admin.listings.summary")}</Label>
                      <textarea
                        className="w-full rounded-field border border-[var(--advo-border)] bg-white px-3 py-2 text-sm focus:border-advo-blue focus:outline-none"
                        defaultValue={listing?.summary}
                        id="f-summary"
                        maxLength={300}
                        name="summary"
                        rows={2}
                      />
                    </div>
                    <div>
                      <Label htmlFor="f-description">{t("admin.listings.description")}</Label>
                      <textarea
                        className="w-full rounded-field border border-[var(--advo-border)] bg-white px-3 py-2 text-sm focus:border-advo-blue focus:outline-none"
                        defaultValue={listing?.description}
                        id="f-description"
                        maxLength={2000}
                        name="description"
                        rows={4}
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field
                        defaultValue={tagsToText(listing?.tags ?? [])}
                        hint={t("admin.listings.tagsHint")}
                        label={t("admin.listings.tags")}
                        name="tags"
                        placeholder="Dar es Salaam, Tech"
                      />
                      <Field defaultValue={listing?.sortOrder ?? 0} label={t("admin.listings.sortOrder")} min={0} name="sortOrder" type="number" />
                    </div>

                    <Field
                      defaultValue={listing?.imageUrl ?? ""}
                      label={t("admin.listings.imageUrl")}
                      name="imageUrl"
                      placeholder="https://"
                    />
                    <Field
                      defaultValue={listing?.sourceUrl ?? ""}
                      label={t("admin.listings.sourceUrl")}
                      name="sourceUrl"
                      placeholder="https://"
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm font-bold text-advo-text">
                    <input className="accent-advo-blue" defaultChecked={listing?.active ?? true} name="active" type="checkbox" />
                    {t("admin.listings.active")}
                  </label>

                  {save.error ? <Notice tone="danger">{save.error}</Notice> : null}

                  <div className="flex items-center justify-end gap-2 border-t border-[var(--advo-border)] pt-4">
                    <Button onPress={close} type="button" variant="outline">
                      {t("admin.listings.cancel")}
                    </Button>
                    <Button isDisabled={save.pending} type="submit" variant="primary">
                      {save.pending ? t("admin.listings.saving") : t("admin.listings.save")}
                    </Button>
                  </div>
                </form>
              )}
            </Modal.Body>
            <Modal.CloseTrigger aria-label={t("common.close")} />
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}

function AiStudioModal({
  open,
  ai,
  onClose,
  onChanged,
}: {
  open: boolean;
  ai: Resource<AiOverview>;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const overlay = useOverlayState({ isOpen: open, onOpenChange: (next) => (!next ? onClose() : undefined) });
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [timesText, setTimesText] = useState("");
  const [regionsText, setRegionsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !ai.data) return;
    setSettings(ai.data.settings);
    setTimesText(ai.data.settings.times.join(", "));
    setRegionsText(ai.data.settings.regions.join(", "));
    setError(null);
    setResult(null);
  }, [open, ai.data]);

  function patch(next: Partial<AiSettings>) {
    setSettings((current) => (current ? { ...current, ...next } : current));
  }

  async function save() {
    if (!settings) return;
    const times = timesText
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const regions = regionsText
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      await api.put("/admin/listing-ai", {
        ...settings,
        times: times.length ? times : ["08:00"],
        regions,
      });
      await onChanged();
      setResult(t("admin.listings.ai.saved"));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const response = await api.post<{ status: string; posted: number; message: string }>("/admin/listing-ai/run", {});
      await onChanged();
      setResult(
        response.status === "SUCCEEDED"
          ? t("admin.listings.ai.runDone", { count: response.posted })
          : t("admin.listings.ai.runSkipped", { message: response.message }),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRunning(false);
    }
  }

  const formatWhen = (value: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    return new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  return (
    <Modal.Root state={overlay}>
      <Modal.Backdrop>
        <Modal.Container size="lg">
          <Modal.Dialog className="max-h-[92vh] overflow-hidden bg-white">
            <Modal.Header>
              <Modal.Heading className="flex items-center gap-2 text-base font-black text-advo-text">
                <span className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 text-white">
                  <Sparkles className="size-4" />
                </span>
                {t("admin.listings.ai.title")}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="overflow-y-auto">
              <ResourceView resource={ai}>
                {(data) => (
                  <div className="space-y-4">
                    {!data.apiConfigured ? (
                      <Notice tone="danger">{t("admin.listings.ai.apiKeyMissing")}</Notice>
                    ) : null}

                    <div className="grid gap-2 sm:grid-cols-3">
                      <Stat label={t("admin.listings.ai.statToday")} value={data.stats.aiToday} />
                      <Stat label={t("admin.listings.ai.statDrafts")} value={data.stats.drafts} />
                      <Stat label={t("admin.listings.ai.statTotal")} value={data.stats.totalAi} />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--advo-border)] bg-slate-50 p-3">
                      <div className="text-xs">
                        <p className="font-bold text-advo-text">{t("admin.listings.ai.nextRun")}</p>
                        <p className="text-advo-muted">
                          {data.settings.enabled
                            ? data.nextRunAt
                              ? formatWhen(data.nextRunAt)
                              : t("admin.listings.ai.noNextRun")
                            : t("admin.listings.ai.disabledHint")}
                        </p>
                      </div>
                      <Button isDisabled={running || !data.apiConfigured} onPress={() => void runNow()} size="sm" type="button" variant="outline">
                        <Sparkles className="size-3.5" />
                        {running ? t("admin.listings.ai.running") : t("admin.listings.ai.runNow")}
                      </Button>
                    </div>

                    {settings ? (
                      <div className="space-y-4">
                        <label className="flex items-start justify-between gap-3 rounded-xl border border-[var(--advo-border)] p-3">
                          <span>
                            <span className="block text-sm font-bold text-advo-text">{t("admin.listings.ai.enabled")}</span>
                            <span className="block text-xs text-advo-muted">{t("admin.listings.ai.enabledHint")}</span>
                          </span>
                          <button
                            aria-pressed={settings.enabled}
                            className={`relative h-6 w-11 shrink-0 rounded-full transition ${settings.enabled ? "bg-emerald-500" : "bg-slate-300"}`}
                            onClick={() => patch({ enabled: !settings.enabled })}
                            type="button"
                          >
                            <span
                              className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${settings.enabled ? "start-[22px]" : "start-0.5"}`}
                            />
                          </button>
                        </label>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field
                            label={t("admin.listings.ai.assistantName")}
                            name="assistantName"
                            onChange={(event) => patch({ assistantName: event.target.value })}
                            value={settings.assistantName}
                          />
                          <Field
                            hint={t("admin.listings.ai.modelHint")}
                            label={t("admin.listings.ai.model")}
                            name="model"
                            onChange={(event) => patch({ model: event.target.value })}
                            value={settings.model}
                          />
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field
                            label={t("admin.listings.ai.analysesPerDay")}
                            max={24}
                            min={1}
                            name="analysesPerDay"
                            onChange={(event) => patch({ analysesPerDay: Number(event.target.value) })}
                            type="number"
                            value={settings.analysesPerDay}
                          />
                          <Field
                            label={t("admin.listings.ai.postsPerDay")}
                            max={50}
                            min={1}
                            name="postsPerDay"
                            onChange={(event) => patch({ postsPerDay: Number(event.target.value) })}
                            type="number"
                            value={settings.postsPerDay}
                          />
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field
                            hint={t("admin.listings.ai.timesHint")}
                            label={t("admin.listings.ai.times")}
                            name="times"
                            onChange={(event) => setTimesText(event.target.value)}
                            placeholder="08:00, 13:00, 18:00"
                            value={timesText}
                          />
                          <SelectField
                            label={t("admin.listings.ai.timezone")}
                            name="timezone"
                            onChange={(event) => patch({ timezone: event.target.value })}
                            options={[
                              { value: "Africa/Dar_es_Salaam", label: "Africa/Dar_es_Salaam" },
                              { value: "Africa/Nairobi", label: "Africa/Nairobi" },
                              { value: "UTC", label: "UTC" },
                            ]}
                            required
                            value={settings.timezone}
                          />
                        </div>

                        <div>
                          <p className="text-sm font-bold text-advo-text">{t("admin.listings.ai.kinds")}</p>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            {KINDS.map((option) => {
                              const checked = settings.kinds.includes(option);
                              return (
                                <label
                                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-bold ${
                                    checked ? "border-advo-blue bg-advo-blue/5 text-advo-blue" : "border-[var(--advo-border)] text-advo-muted"
                                  }`}
                                  key={option}
                                >
                                  <input
                                    checked={checked}
                                    className="accent-advo-blue"
                                    onChange={() =>
                                      patch({
                                        kinds: checked
                                          ? settings.kinds.filter((value) => value !== option)
                                          : [...settings.kinds, option],
                                      })
                                    }
                                    type="checkbox"
                                  />
                                  {t(`admin.listings.kind.${option}` as "admin.listings.kind.JOB")}
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        <Field
                          hint={t("admin.listings.ai.regionsHint")}
                          label={t("admin.listings.ai.regions")}
                          name="regions"
                          onChange={(event) => setRegionsText(event.target.value)}
                          placeholder="Dar es Salaam, Arusha, Zanzibar"
                          value={regionsText}
                        />

                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field
                            hint={t("admin.listings.ai.delayHint")}
                            label={t("admin.listings.ai.publishDelay")}
                            max={1440}
                            min={0}
                            name="publishDelayMinutes"
                            onChange={(event) => patch({ publishDelayMinutes: Number(event.target.value) })}
                            type="number"
                            value={settings.publishDelayMinutes}
                          />
                          <Field
                            hint={t("admin.listings.ai.minScoreHint")}
                            label={t("admin.listings.ai.minScore")}
                            max={100}
                            min={0}
                            name="minScore"
                            onChange={(event) => patch({ minScore: Number(event.target.value) })}
                            type="number"
                            value={settings.minScore}
                          />
                        </div>

                        <label className="flex items-start gap-2 rounded-xl border border-[var(--advo-border)] p-3">
                          <input
                            checked={settings.autoPublish}
                            className="mt-0.5 accent-advo-blue"
                            onChange={(event) => patch({ autoPublish: event.target.checked })}
                            type="checkbox"
                          />
                          <span>
                            <span className="block text-xs font-bold text-advo-text">{t("admin.listings.ai.autoPublish")}</span>
                            <span className="block text-[11px] text-advo-muted">{t("admin.listings.ai.autoPublishHint")}</span>
                          </span>
                        </label>

                        <div className="flex items-center justify-end gap-2">
                          <Button isDisabled={saving} onPress={() => void save()} type="button" variant="primary">
                            {saving ? t("admin.listings.saving") : t("admin.listings.ai.save")}
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {result ? <Notice tone="success">{result}</Notice> : null}
                    {error ? <Notice tone="danger">{error}</Notice> : null}

                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-advo-muted">
                        {t("admin.listings.ai.lastRuns")}
                      </p>
                      {data.runs.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-[var(--advo-border)] p-4 text-center text-xs text-advo-muted">
                          {t("admin.listings.ai.noRuns")}
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {data.runs.map((run) => (
                            <li className="rounded-xl border border-[var(--advo-border)] p-2.5 text-xs" key={run.id}>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-1.5 font-bold text-advo-text">
                                  {run.status === "SUCCEEDED" ? (
                                    <Check className="size-3.5 text-emerald-600" />
                                  ) : run.status === "FAILED" ? (
                                    <span className="text-rose-600">!</span>
                                  ) : (
                                    <Clock className="size-3.5 text-amber-600" />
                                  )}
                                  {t(`admin.listings.ai.status.${run.status}` as "admin.listings.ai.status.SUCCEEDED")}
                                  <span className="font-normal text-advo-muted">
                                    · {t(`admin.listings.ai.trigger.${run.trigger}` as "admin.listings.ai.trigger.SCHEDULE")}
                                  </span>
                                </span>
                                <span className="text-advo-muted">{formatWhen(run.startedAt)}</span>
                              </div>
                              <p className="mt-1 text-advo-muted">
                                {t("admin.listings.ai.runCounts", {
                                  posted: run.postedCount,
                                  analysed: run.analysedCount,
                                  skipped: run.skippedCount,
                                })}
                              </p>
                              {run.error ? <p className="mt-1 line-clamp-2 text-rose-600">{run.error}</p> : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </ResourceView>
            </Modal.Body>
            <Modal.CloseTrigger aria-label={t("common.close")} />
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[var(--advo-border)] bg-white p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-advo-muted">{label}</p>
      <p className="mt-0.5 text-xl font-black text-advo-text">{value}</p>
    </div>
  );
}
