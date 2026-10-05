"use client";

import { useState } from "react";
import { formatDateTime, formatDuration, formatTzs } from "@advo/api-client";
import { Button, Card } from "@heroui/react";
import { AdvoTable, Notice, StatusChip, statusTone } from "@advo/ui";
import { ActionButton } from "@/features/common/actions";
import { Field, ResourceView, SelectField } from "@/features/common/components";
import { api, errorMessage } from "@/lib/api";
import { formValues, toInt, useAction, useResource } from "@/lib/hooks";
import {
  Ticket,
  Plus,
  Printer,
  Eye,
  EyeOff,
  CheckCircle2,
  Sparkles,
  Download,
  Copy,
  Layers,
} from "lucide-react";

type Group = {
  id: string;
  name: string;
  state: string;
  createdAt: string;
  packageRevision: { name: string; priceTzs: string; durationSeconds: number };
  counts: Record<string, number>;
};
type Voucher = {
  id: string;
  code: string;
  state: string;
  redeemedAt: string | null;
  grant: { state: string; expiresAt: string | null } | null;
};

/** Real enum vocabularies (packages/db/prisma/schema.prisma), rendered for humans. */
const VOUCHER_GROUP_STATE_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

const VOUCHER_STATE_LABELS: Record<string, string> = {
  UNUSED: "Unused",
  REDEEMED: "Redeemed",
  REVOKED: "Revoked",
  EXPIRED: "Expired",
  DELETED: "Deleted",
};

function friendlyLabel(labels: Record<string, string>, value: string): string {
  return labels[value] ?? value.replace(/_/g, " ");
}

export function ResellerVouchersScreen() {
  const groups = useResource<Group[]>("/reseller/voucher-groups");
  const packages = useResource<Array<{ id: string; name: string; currentRevision: { name: string; priceTzs: string } | null }>>("/reseller/packages");
  const [open, setOpen] = useState<Group | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);

  const create = useAction(async (form: HTMLFormElement) => {
    const v = formValues(form);
    await api.post("/reseller/voucher-groups", { name: v.name, packageId: v.packageId, count: toInt(v.count) });
    form.reset();
    setIsGeneratorOpen(false);
  }, groups.reload);

  async function download(g: Group) {
    setDownloadError(null);
    try {
      const res = await api.raw(`/reseller/voucher-groups/${g.id}/export.csv`, { headers: { accept: "text/csv" } });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${g.name.replace(/[^a-z0-9-_]+/gi, "_")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(errorMessage(err));
    }
  }

  const groupList = groups.data ?? [];
  const totalBatches = groupList.length;
  const totalUnused = groupList.reduce((acc, g) => acc + (g.counts.UNUSED ?? 0), 0);
  const totalRedeemed = groupList.reduce((acc, g) => acc + (g.counts.REDEEMED ?? 0), 0);
  const totalCodes = totalUnused + totalRedeemed;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-advo-blue/10 px-2.5 py-0.5 text-xs font-semibold text-advo-blue">
              <Ticket className="h-3.5 w-3.5" />
              Prepaid Vouchers & Printing
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs font-medium text-slate-500">Over-the-counter Sales</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-advo-text sm:text-3xl">Vouchers</h1>
          <p className="mt-1 text-sm text-advo-muted">
            Generate single-use access codes for front-desk counters, kiosks, or paper distribution.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsGeneratorOpen(!isGeneratorOpen)}
            className="inline-flex items-center gap-2 rounded-xl bg-advo-blue px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-advo-blue-hover active:scale-95"
          >
            <Plus className="h-4 w-4" />
            {isGeneratorOpen ? "Close Generator" : "Generate Batch"}
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Batches</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-advo-blue">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-advo-text">{totalBatches}</div>
          <p className="mt-1 text-xs text-slate-500">Batches created</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Codes</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Ticket className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-advo-text">{totalCodes}</div>
          <p className="mt-1 text-xs text-slate-500">Issued across all batches</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Available / Unused</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">{totalUnused}</div>
          <p className="mt-1 text-xs text-slate-500">Ready for sale</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Redeemed</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-advo-gold">
              <Sparkles className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-advo-text">{totalRedeemed}</div>
          <p className="mt-1 text-xs text-slate-500">Activated by guests</p>
        </Card>
      </div>

      {/* Batch Generator Form Card */}
      {isGeneratorOpen && (
        <Card className="border-advo-blue/30 p-6 ring-4 ring-advo-blue/5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-advo-blue/10 text-advo-blue">
                <Plus className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-advo-text">Generate a voucher batch</h3>
                <p className="text-xs text-slate-500">
                  Instantly creates cryptographic single-use tokens mapped to your selected package.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsGeneratorOpen(false)}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>

          <form
            className="mt-6 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              void create.run(e.currentTarget);
            }}
          >
            <div className="grid gap-5 md:grid-cols-3">
              <Field
                name="name"
                label="Batch Name"
                placeholder="e.g. Desemba — Counter Sales"
                required
              />
              <SelectField
                name="packageId"
                label="WiFi Package"
                required
                options={(packages.data ?? []).map((p) => ({
                  value: p.id,
                  label: `${p.currentRevision?.name ?? p.name} · ${formatTzs(p.currentRevision?.priceTzs)}`,
                }))}
              />
              <Field
                name="count"
                label="Number of Codes"
                type="number"
                min={1}
                max={500}
                defaultValue={20}
                required
              />
            </div>

            {create.error ? <Notice tone="danger">{create.error}</Notice> : null}

            <div className="flex items-center gap-3">
              <Button variant="primary" type="submit" isDisabled={create.pending}>
                {create.pending ? "Generating Codes…" : "Generate Batch"}
              </Button>
              <button
                type="button"
                onClick={() => setIsGeneratorOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </Card>
      )}

      {downloadError ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {downloadError}
        </div>
      ) : null}

      {/* Batches Table / Cards Section */}
      <Card className="p-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-advo-text">Voucher Batches</h2>
            <p className="text-xs text-slate-500">All generated batches and export options</p>
          </div>
        </div>

        <div className="mt-4">
          <ResourceView resource={groups}>
            {(rows) => (
              <AdvoTable label="Voucher batches"
                rows={rows}
                rowKey={(g) => g.id}
                empty="No voucher batches generated yet."
                columns={[
                  {
                    key: "n",
                    header: "Batch",
                    render: (g) => (
                      <div>
                        <p className="font-bold text-advo-text">{g.name}</p>
                        <p className="text-xs text-slate-400">{formatDateTime(g.createdAt)}</p>
                      </div>
                    ),
                  },
                  {
                    key: "p",
                    header: "Package",
                    render: (g) => (
                      <div>
                        <span className="font-semibold text-slate-800">{g.packageRevision.name}</span>
                        <div className="text-xs text-slate-400">
                          {formatDuration(g.packageRevision.durationSeconds)} · {formatTzs(g.packageRevision.priceTzs)}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: "c",
                    header: "Usage & Inventory",
                    render: (g) => {
                      const unused = g.counts.UNUSED ?? 0;
                      const redeemed = g.counts.REDEEMED ?? 0;
                      const total = unused + redeemed;
                      const pct = total > 0 ? Math.round((redeemed / total) * 100) : 0;
                      return (
                        <div className="min-w-40">
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span className="text-emerald-700">{unused} available</span>
                            <span className="text-slate-400">{redeemed} used ({pct}%)</span>
                          </div>
                          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-advo-blue to-advo-gold transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    },
                  },
                  {
                    key: "s",
                    header: "Status",
                    render: (g) => (
                      <StatusChip tone={statusTone(g.state)}>
                        {friendlyLabel(VOUCHER_GROUP_STATE_LABELS, g.state)}
                      </StatusChip>
                    ),
                  },
                  {
                    key: "a",
                    header: "",
                    render: (g) => (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setOpen(open?.id === g.id ? null : g)}
                          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-sm transition ${
                            open?.id === g.id
                              ? "border-advo-blue bg-advo-blue text-white"
                              : "border-slate-200 bg-white text-slate-700 hover:border-advo-blue hover:text-advo-blue"
                          }`}
                        >
                          {open?.id === g.id ? (
                            <>
                              <EyeOff className="h-3.5 w-3.5" /> Hide codes
                            </>
                          ) : (
                            <>
                              <Eye className="h-3.5 w-3.5" /> View codes
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => void download(g)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-advo-blue hover:text-advo-blue"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Export CSV
                        </button>

                        <ActionButton
                          onRun={async () => {
                            const name = window.prompt("New batch name", g.name);
                            if (name) await api.put(`/reseller/voucher-groups/${g.id}`, { name });
                          }}
                          onDone={groups.reload}
                        >
                          Rename
                        </ActionButton>

                        <ActionButton
                          variant="danger"
                          confirm="Delete all unused codes in this batch? Redeemed codes are kept."
                          onRun={() => api.post(`/reseller/voucher-groups/${g.id}/delete-unused`)}
                          onDone={groups.reload}
                        >
                          Delete unused
                        </ActionButton>
                      </div>
                    ),
                  },
                ]}
              />
            )}
          </ResourceView>
        </div>
      </Card>

      {/* Voucher Codes Inspection Drawer / Card */}
      {open ? <VoucherCodes group={open} /> : null}
    </div>
  );
}

function VoucherCodes({ group }: { group: Group }) {
  const vouchers = useResource<Voucher[]>(`/reseller/voucher-groups/${group.id}/vouchers`);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  function copyCode(code: string) {
    void navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  return (
    <div className="rounded-xl border-2 border-advo-blue/20 bg-white p-6 shadow-xl transition-all">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-advo-blue">Print & Distribution Sheet</span>
          <h3 className="text-xl font-bold text-advo-text">Codes — {group.name}</h3>
          <p className="text-xs text-slate-500">
            Package: {group.packageRevision.name} · {formatDuration(group.packageRevision.durationSeconds)} · {formatTzs(group.packageRevision.priceTzs)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
        </div>
      </div>

      <div className="mt-6">
        <ResourceView resource={vouchers}>
          {(rows) => (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {rows.map((v) => {
                const isUnused = v.state === "UNUSED";
                return (
                  <div
                    key={v.id}
                    className={`group relative rounded-xl border p-3.5 text-center transition hover:-translate-y-0.5 hover:shadow-md ${
                      isUnused
                        ? "border-advo-border bg-white hover:border-advo-blue"
                        : "border-slate-100 bg-slate-50 opacity-60"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span className="font-semibold text-advo-blue">ADVO WIFI</span>
                      <span
                        className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold ${
                          isUnused ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {friendlyLabel(VOUCHER_STATE_LABELS, v.state)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => copyCode(v.code)}
                      aria-label={`Copy voucher code ${v.code}`}
                      className="my-2 w-full select-all rounded-md font-mono text-sm font-black tracking-widest text-advo-text transition hover:text-advo-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-advo-blue"
                    >
                      {v.code}
                    </button>

                    <div aria-live="polite" className="flex items-center justify-center gap-1 text-[10px] text-slate-400">
                      {copiedCode === v.code ? (
                        <span className="font-semibold text-emerald-600">Copied!</span>
                      ) : (
                        <>
                          <Copy className="h-2.5 w-2.5" />
                          <span>Click code to copy</span>
                        </>
                      )}
                    </div>

                    {v.grant?.expiresAt ? (
                      <p className="mt-1 text-[9px] text-slate-400">exp: {formatDateTime(v.grant.expiresAt)}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </ResourceView>
      </div>
    </div>
  );
}
