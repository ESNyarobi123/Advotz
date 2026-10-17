"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDateTime, formatDuration, formatTzs } from "@advo/api-client";
import { Card } from "@heroui/react";
import { Notice, StatusChip, statusTone } from "@advo/ui";
import { PageHero, ResourceView } from "@/features/common/components";
import { api, errorMessage } from "@/lib/api";
import { useResource } from "@/lib/hooks";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Package,
  Pencil,
  Search,
  Sparkles,
  Ticket,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { VoucherBarcode } from "./voucher-barcode";
import {
  formatVoucherDisplay,
  friendlyVoucherLabel,
  groupLifecycleCounts,
  lifecycleChipClass,
  openPrintableVoucherSheet,
  voucherLifecycle,
  VOUCHER_GROUP_STATE_LABELS,
  VOUCHER_LIFECYCLE_LABELS,
  type VoucherGroup,
  type VoucherLifecycle,
  type VoucherRow,
} from "./voucher-shared";

type FilterKey = "all" | VoucherLifecycle;

export function ResellerVoucherGroupDetailScreen({ groupId }: { groupId: string }) {
  const router = useRouter();
  const groups = useResource<VoucherGroup[]>("/reseller/voucher-groups");
  const vouchers = useResource<VoucherRow[]>(`/reseller/voucher-groups/${groupId}/vouchers`);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"print" | "rename" | "delete" | null>(null);

  const group = useMemo(
    () => (groups.data ?? []).find((g) => g.id === groupId) ?? null,
    [groups.data, groupId],
  );

  const lifecycleFromRows = useMemo(() => {
    const rows = vouchers.data ?? [];
    let unused = 0;
    let inUse = 0;
    let used = 0;
    for (const v of rows) {
      const life = voucherLifecycle(v);
      if (life === "unused") unused += 1;
      else if (life === "in_use") inUse += 1;
      else used += 1;
    }
    return { unused, inUse, used };
  }, [vouchers.data]);

  const counts = group
    ? vouchers.data
      ? lifecycleFromRows
      : groupLifecycleCounts(group)
    : { unused: 0, inUse: 0, used: 0 };
  const total = counts.unused + counts.inUse + counts.used;

  const visible = useMemo(() => {
    const rows = vouchers.data ?? [];
    const term = query.trim().toLowerCase();
    return rows.filter((v) => {
      const life = voucherLifecycle(v);
      if (filter !== "all" && life !== filter) return false;
      if (!term) return true;
      return v.code.toLowerCase().includes(term) || formatVoucherDisplay(v.code).toLowerCase().includes(term);
    });
  }, [vouchers.data, filter, query]);

  function copyCode(code: string) {
    void navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  async function printSheet() {
    if (!group) return;
    setActionError(null);
    setBusy("print");
    try {
      const rows = vouchers.data ?? (await api.get<VoucherRow[]>(`/reseller/voucher-groups/${groupId}/vouchers`));
      openPrintableVoucherSheet(group, rows);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function rename() {
    if (!group) return;
    const name = window.prompt("New batch name", group.name);
    if (!name) return;
    setActionError(null);
    setBusy("rename");
    try {
      await api.put(`/reseller/voucher-groups/${group.id}`, { name });
      await groups.reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function deleteUnused() {
    if (!group) return;
    if (!window.confirm("Delete all unused codes in this batch? Redeemed codes are kept.")) return;
    setActionError(null);
    setBusy("delete");
    try {
      await api.post(`/reseller/voucher-groups/${group.id}/delete-unused`);
      await Promise.all([groups.reload(), vouchers.reload()]);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (groups.loading && !group) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="h-28 animate-pulse rounded-card bg-slate-100" />
        <div className="h-40 animate-pulse rounded-card bg-slate-100" />
      </div>
    );
  }

  if (!groups.loading && !group) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <Link
          href="/reseller/vouchers"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-advo-blue hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to vouchers
        </Link>
        <Card className="p-8 text-center">
          <h1 className="text-lg font-bold text-advo-text">Batch not found</h1>
          <p className="mt-1 text-sm text-advo-muted">This voucher group may have been archived or deleted.</p>
          <button
            type="button"
            onClick={() => router.push("/reseller/vouchers")}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-advo-blue px-4 py-2 text-sm font-semibold text-white"
          >
            Return to list
          </button>
        </Card>
      </div>
    );
  }

  if (!group) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <Link
        href="/reseller/vouchers"
        className="inline-flex items-center gap-1.5 text-xs font-bold text-advo-muted transition hover:text-advo-blue"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All voucher batches
      </Link>

      <PageHero
        eyebrow="Voucher batch"
        title={group.name}
        description={`${group.packageRevision.name} · ${formatDuration(group.packageRevision.durationSeconds)} · ${formatTzs(group.packageRevision.priceTzs)}`}
        icon={<Ticket />}
        iconTone="accent"
        meta={
          <>
            <StatusChip tone={statusTone(group.state)}>
              {friendlyVoucherLabel(VOUCHER_GROUP_STATE_LABELS, group.state)}
            </StatusChip>
            <span className="inline-flex items-center gap-1 rounded-full border border-advo-border bg-white px-2.5 py-0.5 text-[11px] font-semibold text-advo-muted">
              <Clock className="h-3 w-3" />
              Created {formatDateTime(group.createdAt)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-advo-border bg-white px-2.5 py-0.5 text-[11px] font-semibold text-advo-muted">
              <Package className="h-3 w-3" />
              {group.packageRevision.name}
            </span>
          </>
        }
        actions={
          <div className="flex items-center gap-1 rounded-2xl border border-advo-border bg-white p-1 shadow-sm">
            <HeroIconButton
              disabled={busy !== null}
              icon={Download}
              label={busy === "print" ? "Opening…" : "Download / Print PDF"}
              onPress={() => void printSheet()}
            />
            <HeroIconButton
              disabled={busy !== null}
              icon={Pencil}
              label="Rename batch"
              onPress={() => void rename()}
            />
            <HeroIconButton
              disabled={busy !== null || counts.unused === 0}
              icon={Trash2}
              label="Delete unused"
              onPress={() => void deleteUnused()}
              tone="danger"
            />
          </div>
        }
      />

      {/* Package + inventory strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DetailStat
          icon={Package}
          label="Package"
          value={group.packageRevision.name}
          hint={`${formatDuration(group.packageRevision.durationSeconds)} · ${formatTzs(group.packageRevision.priceTzs)}`}
        />
        <DetailStat icon={Ticket} label="Total codes" value={String(total)} hint="Issued in this batch" />
        <DetailStat
          icon={CheckCircle2}
          label="Unused"
          value={String(counts.unused)}
          hint="Ready for sale"
          tone="emerald"
        />
        <DetailStat
          icon={Sparkles}
          label="In use / Used"
          value={`${counts.inUse} · ${counts.used}`}
          hint="Live sessions · finished"
          tone="amber"
        />
      </div>

      {actionError ? <Notice tone="danger">{actionError}</Notice> : null}

      {/* Status filters — top of the codes section */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["all", "All", total],
            ["unused", "Unused", counts.unused],
            ["in_use", "In use", counts.inUse],
            ["used", "Used", counts.used],
          ] as const
        ).map(([key, label, count]) => {
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${
                active
                  ? "border-advo-blue bg-advo-blue text-white shadow-sm"
                  : "border-advo-border bg-white text-advo-muted hover:border-advo-blue/40 hover:text-advo-text"
              }`}
            >
              {label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                  active ? "bg-white/20 text-white" : "bg-advo-page text-advo-text"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Codes */}
      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-black tracking-tight text-advo-text">
              Codes
              <span className="ml-1.5 font-bold text-advo-muted">({visible.length})</span>
            </h2>
            <p className="text-xs text-advo-muted">Tap a card to copy · each slip shows a barcode</p>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-advo-muted" />
            <input
              aria-label="Search codes"
              className="w-full rounded-xl border border-advo-border bg-white py-1.5 pl-8 pr-7 text-xs font-medium text-advo-text transition placeholder:text-advo-muted focus:border-advo-blue focus:outline-none sm:w-44"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search code…"
              type="search"
              value={query}
            />
            {query ? (
              <button
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-advo-muted hover:bg-slate-100"
                onClick={() => setQuery("")}
                type="button"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        </div>

        <ResourceView resource={vouchers}>
          {(rows) =>
            rows.length === 0 ? (
              <Card className="p-10 text-center text-sm text-advo-muted">No codes in this batch.</Card>
            ) : visible.length === 0 ? (
              <Card className="p-8 text-center text-xs text-advo-muted">No codes match this filter.</Card>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {visible.map((v) => {
                  const life = voucherLifecycle(v);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => copyCode(v.code)}
                      className={`rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-advo-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-advo-blue ${
                        life === "unused"
                          ? "border-advo-border bg-white hover:border-advo-blue"
                          : life === "in_use"
                            ? "border-amber-200/80 bg-amber-50/30"
                            : "border-slate-100 bg-slate-50/80"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[9px] font-bold tracking-wider text-advo-blue uppercase">
                          Advo WiFi
                        </span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${lifecycleChipClass(life)}`}>
                          {VOUCHER_LIFECYCLE_LABELS[life]}
                        </span>
                      </div>
                      <p className="mt-2 text-center font-mono text-lg font-black tracking-[0.18em] text-advo-text tabular-nums sm:text-xl">
                        {formatVoucherDisplay(v.code)}
                      </p>
                      <div className="mx-auto mt-2 w-full max-w-[140px] rounded-md bg-white px-1 py-1 ring-1 ring-advo-border/60">
                        <VoucherBarcode code={v.code} height={28} />
                      </div>
                      <p className="mt-1.5 flex items-center justify-center gap-1 text-[10px] text-advo-muted">
                        {copiedCode === v.code ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                            <Check className="h-2.5 w-2.5" />
                            Copied
                          </span>
                        ) : (
                          <>
                            <Copy className="h-2.5 w-2.5" />
                            Tap to copy
                          </>
                        )}
                      </p>
                      {v.grant?.expiresAt ? (
                        <p className="mt-1 text-center text-[9px] text-slate-400">
                          exp {formatDateTime(v.grant.expiresAt)}
                        </p>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )
          }
        </ResourceView>
      </section>
    </div>
  );
}

function DetailStat({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "emerald" | "amber";
}) {
  const tones = {
    default: "bg-advo-blue/10 text-advo-blue",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-advo-gold",
  }[tone];

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-wider text-advo-muted uppercase">{label}</p>
          <p className="mt-1 truncate text-lg font-black tracking-tight text-advo-text" title={value}>
            {value}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-advo-muted">{hint}</p>
        </div>
        <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${tones}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </Card>
  );
}

function HeroIconButton({
  icon: Icon,
  label,
  onPress,
  tone = "default",
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={label}
      className={`grid size-10 place-items-center rounded-xl transition disabled:opacity-40 ${
        tone === "danger"
          ? "text-rose-500 hover:bg-rose-50 hover:text-rose-600"
          : "text-advo-muted hover:bg-advo-page hover:text-advo-text"
      }`}
      disabled={disabled}
      onClick={onPress}
      title={label}
      type="button"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
