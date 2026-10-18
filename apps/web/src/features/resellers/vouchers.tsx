"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDateTime, formatDuration, formatTzs } from "@advo/api-client";
import { Button, Card, Modal, useOverlayState } from "@heroui/react";
import { Notice, StatusChip, statusTone } from "@advo/ui";
import { Field, ResourceView, SelectField } from "@/features/common/components";
import { useSiteScope } from "@/features/resellers/site-scope";
import { api, errorMessage } from "@/lib/api";
import { formValues, toInt, useAction, useResource } from "@/lib/hooks";
import {
  Ticket,
  Plus,
  Eye,
  CheckCircle2,
  Sparkles,
  Download,
  Layers,
  Pencil,
  Trash2,
  Package,
  Clock,
  type LucideIcon,
} from "lucide-react";
import {
  friendlyVoucherLabel,
  groupLifecycleCounts,
  openPrintableVoucherSheet,
  VOUCHER_GROUP_STATE_LABELS,
  type VoucherGroup,
  type VoucherRow,
} from "./voucher-shared";

type PackageOption = {
  id: string;
  name: string;
  currentRevision: { name: string; priceTzs: string; durationSeconds?: number } | null;
};

const COUNT_PRESETS = [10, 20, 50, 100, 200] as const;

export function ResellerVouchersScreen() {
  const router = useRouter();
  const { scoped } = useSiteScope();
  const groups = useResource<VoucherGroup[]>(scoped("/reseller/voucher-groups"));
  const packages = useResource<PackageOption[]>(scoped("/reseller/packages"));
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);

  const create = useAction(async (form: HTMLFormElement) => {
    const v = formValues(form);
    await api.post("/reseller/voucher-groups", {
      name: v.name,
      packageId: v.packageId,
      count: toInt(v.count),
    });
    form.reset();
    setIsGeneratorOpen(false);
  }, groups.reload);

  async function download(g: VoucherGroup) {
    setDownloadError(null);
    try {
      const vouchers = await api.get<VoucherRow[]>(`/reseller/voucher-groups/${g.id}/vouchers`);
      openPrintableVoucherSheet(g, vouchers);
    } catch (err) {
      setDownloadError(errorMessage(err));
    }
  }

  async function rename(g: VoucherGroup) {
    const name = window.prompt("New batch name", g.name);
    if (!name) return;
    await api.put(`/reseller/voucher-groups/${g.id}`, { name });
    await groups.reload();
  }

  async function deleteUnused(g: VoucherGroup) {
    if (!window.confirm("Delete all unused codes in this batch? Redeemed codes are kept.")) return;
    await api.post(`/reseller/voucher-groups/${g.id}/delete-unused`);
    await groups.reload();
  }

  const groupList = groups.data ?? [];
  const totalBatches = groupList.length;
  const totalUnused = groupList.reduce((acc, g) => acc + (g.counts.UNUSED ?? 0), 0);
  const totalRedeemed = groupList.reduce((acc, g) => acc + (g.counts.REDEEMED ?? 0), 0);
  const totalCodes = totalUnused + totalRedeemed;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-advo-blue/10 px-2.5 py-0.5 text-xs font-semibold text-advo-blue">
              <Ticket className="h-3.5 w-3.5" />
              Prepaid Vouchers & Printing
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs font-medium text-slate-500">6-digit codes</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-advo-text sm:text-3xl">Vouchers</h1>
          <p className="mt-1 text-sm text-advo-muted">
            Generate single-use access codes for front-desk counters, kiosks, or paper distribution.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsGeneratorOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-advo-blue px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-advo-blue-hover active:scale-95"
        >
          <Plus className="h-4 w-4" />
          Generate Batch
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard hint="Batches created" icon={Layers} label="Total Batches" tone="blue" value={totalBatches} />
        <KpiCard hint="Issued across all batches" icon={Ticket} label="Total Codes" tone="indigo" value={totalCodes} />
        <KpiCard hint="Ready for sale" icon={CheckCircle2} label="Available / Unused" tone="emerald" value={totalUnused} />
        <KpiCard hint="Activated by guests" icon={Sparkles} label="Redeemed" tone="amber" value={totalRedeemed} />
      </div>

      <GenerateBatchModal
        error={create.error}
        open={isGeneratorOpen}
        packages={packages.data ?? []}
        packagesError={packages.error?.message ?? null}
        packagesLoading={packages.loading}
        pending={create.pending}
        onClose={() => {
          create.setError(null);
          setIsGeneratorOpen(false);
        }}
        onSubmit={(form) => void create.run(form)}
      />

      {downloadError ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {downloadError}
        </div>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-black tracking-tight text-advo-text">
            Voucher Batches
            <span className="ml-1.5 font-bold text-advo-muted">({totalBatches})</span>
          </h2>
          <p className="text-xs text-slate-500">Open a batch to view codes · Download prints PDF slips</p>
        </div>

        <ResourceView resource={groups}>
          {(rows) =>
            rows.length === 0 ? (
              <Card className="border-dashed p-12 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50 text-advo-blue">
                  <Ticket className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-base font-bold text-advo-text">No voucher batches yet</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Generate a batch to sell single-use 6-digit access codes over the counter.
                </p>
                <button
                  type="button"
                  onClick={() => setIsGeneratorOpen(true)}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-advo-blue px-4 py-2 text-sm font-semibold text-white shadow hover:bg-advo-blue-hover"
                >
                  <Plus className="h-4 w-4" />
                  Generate Batch
                </button>
              </Card>
            ) : (
              <div className="flex flex-col gap-2.5">
                {rows.map((g) => (
                  <VoucherBatchRow
                    key={g.id}
                    group={g}
                    onDeleteUnused={() => void deleteUnused(g)}
                    onDownload={() => void download(g)}
                    onRename={() => void rename(g)}
                    onView={() => router.push(`/reseller/vouchers/${g.id}`)}
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

function GenerateBatchModal({
  open,
  packages,
  packagesLoading,
  packagesError,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  open: boolean;
  packages: PackageOption[];
  packagesLoading: boolean;
  packagesError: string | null;
  pending: boolean;
  error: string | null;
  onSubmit: (form: HTMLFormElement) => void;
  onClose: () => void;
}) {
  const overlay = useOverlayState({
    isOpen: open,
    onOpenChange: (next) => {
      if (!next) onClose();
    },
  });
  const [name, setName] = useState("");
  const [packageId, setPackageId] = useState("");
  const [count, setCount] = useState(20);

  useEffect(() => {
    if (!open) return;
    setName("");
    setPackageId(packages[0]?.id ?? "");
    setCount(20);
  }, [open, packages]);

  const ready = name.trim().length >= 2 && Boolean(packageId) && count >= 1 && count <= 500;

  return (
    <Modal.Root state={overlay}>
      <Modal.Backdrop>
        <Modal.Container size="lg">
          <Modal.Dialog className="overflow-hidden bg-white p-0">
            <div className="relative border-b border-advo-border bg-gradient-to-br from-white via-white to-[var(--advo-blue-soft)] px-6 py-5">
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-advo-blue via-advo-gold to-advo-orange"
              />
              <div className="flex items-start gap-3.5 pr-8">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-advo-blue text-white shadow-advo-card">
                  <Ticket className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold tracking-wider text-advo-blue uppercase">New batch</p>
                  <Modal.Heading className="mt-0.5 text-base font-black text-advo-text">
                    Generate a voucher batch
                  </Modal.Heading>
                  <p className="mt-0.5 text-xs text-advo-muted">
                    Creates single-use <strong className="font-bold text-advo-text">6-digit</strong> codes for the
                    package you pick.
                  </p>
                </div>
              </div>
            </div>

            <Modal.Body className="space-y-5 bg-[var(--advo-page)] px-6 py-5">
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!ready || pending) return;
                  onSubmit(e.currentTarget);
                }}
              >
                <Field
                  name="name"
                  label="Batch name"
                  placeholder="e.g. Counter — Desemba"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />

                {packagesError ? <Notice tone="danger">{packagesError}</Notice> : null}
                {packagesLoading ? (
                  <p className="text-xs text-advo-muted">Loading packages…</p>
                ) : (
                  <SelectField
                    name="packageId"
                    label="WiFi package"
                    required
                    value={packageId}
                    onChange={(e) => setPackageId(e.target.value)}
                    options={packages.map((p) => ({
                      value: p.id,
                      label: `${p.currentRevision?.name ?? p.name} · ${formatTzs(p.currentRevision?.priceTzs)}`,
                    }))}
                  />
                )}

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-advo-text" htmlFor="voucher-count">
                    Number of codes
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {COUNT_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setCount(preset)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                          count === preset
                            ? "bg-advo-blue text-white"
                            : "border border-advo-border bg-white text-advo-muted hover:text-advo-text"
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                  <input
                    id="voucher-count"
                    name="count"
                    type="number"
                    min={1}
                    max={500}
                    required
                    value={count}
                    onChange={(e) => setCount(Math.min(500, Math.max(1, Number(e.target.value) || 1)))}
                    className="mt-2 w-full rounded-xl border border-advo-border bg-white px-3 py-2.5 text-sm font-semibold text-advo-text outline-none focus:border-advo-blue"
                  />
                  <p className="mt-1 text-[11px] text-advo-muted">1–500 codes per batch. Each code is 6 digits.</p>
                </div>

                {error ? <Notice tone="danger">{error}</Notice> : null}

                <div className="flex justify-end gap-2 pt-1">
                  <Button isDisabled={pending} onPress={onClose} type="button" variant="outline">
                    Cancel
                  </Button>
                  <Button isDisabled={!ready || pending} type="submit" variant="primary">
                    {pending ? "Generating…" : `Generate ${count} codes`}
                  </Button>
                </div>
              </form>
            </Modal.Body>
            <Modal.CloseTrigger aria-label="Close" />
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}

/** Horizontal detail row — identity left, actions far right. View opens the batch page. */
function VoucherBatchRow({
  group,
  onView,
  onDownload,
  onRename,
  onDeleteUnused,
}: {
  group: VoucherGroup;
  onView: () => void;
  onDownload: () => void;
  onRename: () => void;
  onDeleteUnused: () => void;
}) {
  const { unused, inUse, used } = groupLifecycleCounts(group);
  const total = unused + inUse + used;
  const soldPct = total > 0 ? Math.round(((inUse + used) / total) * 100) : 0;

  return (
    <Card className="overflow-hidden p-0 transition-shadow hover:shadow-advo-lift">
      <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
        <Link
          href={`/reseller/vouchers/${group.id}`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-advo-blue"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-advo-blue/10 text-advo-blue ring-1 ring-advo-blue/20">
            <Ticket className="h-5 w-5" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-black tracking-tight text-advo-text" title={group.name}>
                {group.name}
              </h3>
              <StatusChip tone={statusTone(group.state)}>
                {friendlyVoucherLabel(VOUCHER_GROUP_STATE_LABELS, group.state)}
              </StatusChip>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-advo-muted">
              <span className="inline-flex min-w-0 items-center gap-1">
                <Package className="h-3 w-3 shrink-0 text-slate-400" />
                <span className="truncate font-semibold text-advo-text/80">{group.packageRevision.name}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3 shrink-0 text-slate-400" />
                <span className="font-semibold">{formatDuration(group.packageRevision.durationSeconds)}</span>
                <span className="text-slate-400">·</span>
                <span className="font-bold text-advo-text">{formatTzs(group.packageRevision.priceTzs)}</span>
              </span>
              <span className="text-slate-400">{formatDateTime(group.createdAt)}</span>
            </div>

            <dl className="mt-2 flex flex-wrap items-center gap-1.5">
              <FactChip icon={CheckCircle2} label="Unused" value={`${unused} unused`} tone="emerald" />
              <FactChip icon={Sparkles} label="In use" value={`${inUse} in use`} tone="amber" />
              <FactChip icon={Ticket} label="Used" value={`${used} used`} />
              {total > 0 ? (
                <span
                  className="inline-flex min-w-[7rem] flex-1 items-center gap-2 rounded-lg border border-advo-border/70 bg-advo-page px-2 py-1 sm:max-w-[12rem] sm:flex-none"
                  title={`${inUse + used} of ${total} sold`}
                >
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                    <span
                      className="block h-full rounded-full bg-gradient-to-r from-advo-blue to-advo-gold"
                      style={{ width: `${soldPct}%` }}
                    />
                  </span>
                  <span className="text-[10px] font-bold text-advo-muted tabular-nums">{soldPct}%</span>
                </span>
              ) : null}
            </dl>
          </div>
        </Link>

        <div className="flex shrink-0 items-center justify-end gap-1 border-t border-advo-border/60 pt-2.5 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-3">
          <RowIconButton icon={Eye} label="View batch" onPress={onView} />
          <RowIconButton icon={Download} label="Download / Print PDF" onPress={onDownload} />
          <RowIconButton icon={Pencil} label="Rename" onPress={onRename} />
          <RowIconButton icon={Trash2} label="Delete unused" onPress={onDeleteUnused} tone="danger" />
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
  value: number;
  hint: string;
  icon: LucideIcon;
  tone: "blue" | "indigo" | "emerald" | "amber";
}) {
  const tones = {
    blue: { icon: "bg-blue-50 text-advo-blue", value: "text-advo-text" },
    indigo: { icon: "bg-indigo-50 text-indigo-600", value: "text-advo-text" },
    emerald: { icon: "bg-emerald-50 text-emerald-600", value: "text-emerald-600" },
    amber: { icon: "bg-amber-50 text-advo-gold", value: "text-advo-text" },
  }[tone];

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</span>
        <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${tones.icon}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className={`mt-2 text-2xl font-bold ${tones.value}`}>{value}</div>
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
  tone?: "default" | "emerald" | "amber";
}) {
  const styles = {
    default: {
      wrap: "border-advo-border/70 bg-advo-page",
      icon: "text-advo-muted",
      text: "text-advo-text",
    },
    emerald: {
      wrap: "border-emerald-200/70 bg-emerald-50/60",
      icon: "text-emerald-600",
      text: "text-emerald-700",
    },
    amber: {
      wrap: "border-amber-200/70 bg-amber-50/60",
      icon: "text-amber-700",
      text: "text-amber-800",
    },
  }[tone];

  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 ${styles.wrap}`}>
      <Icon className={`h-3 w-3 shrink-0 ${styles.icon}`} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <span className={`truncate text-[10px] font-bold ${styles.text}`} title={`${label}: ${value}`}>
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
