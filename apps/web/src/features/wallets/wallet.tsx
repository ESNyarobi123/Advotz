"use client";

import { useState } from "react";
import { formatDateTime, formatTzs } from "@advo/api-client";
import { Card, Skeleton } from "@heroui/react";
import { AdvoTable, Notice, StatusChip, statusTone } from "@advo/ui";
import { ActionButton } from "@/features/common/actions";
import { Field, Mono, ResourceView } from "@/features/common/components";
import { api, newIdempotencyKey } from "@/lib/api";
import { formValues, useAction, useResource } from "@/lib/hooks";
import {
  Wallet,
  ArrowDownRight,
  Lock,
  PlusCircle,
  AlertTriangle,
  Smartphone,
  Receipt,
  Send,
  Clock,
} from "lucide-react";

type WalletData = {
  availableTzs: string;
  pendingTzs: string;
  reservedTzs: string;
  history?: Array<{
    id: string;
    at: string;
    account: string;
    debitTzs: string;
    creditTzs: string;
    description: string;
    sourceType: string;
  }>;
};

type Destination = {
  id: string;
  recipientName: string;
  phone: string;
  verifiedAt: string | null;
  createdAt: string;
};

type Quote = {
  destination: { recipientName: string; phone: string };
  amountTzs: string;
  providerFeeTzs: string;
  platformFeeTzs: string;
  totalDebitTzs: string;
  availableTzs: string;
  sufficient: boolean;
  provider: string;
};

type WithdrawalRow = {
  id: string;
  amountTzs: string;
  totalDebitTzs: string;
  state: string;
  reviewReason: string | null;
  failureReason: string | null;
  createdAt: string;
  destinationSnapshot: { recipientName?: string };
};

/** Real WithdrawalState vocabulary (packages/db/prisma/schema.prisma), rendered for humans. */
const WITHDRAWAL_STATE_LABELS: Record<string, string> = {
  REQUESTED: "Requested",
  APPROVED: "Approved",
  PROCESSING: "Processing",
  UNKNOWN: "Unknown",
  COMPLETED: "Completed",
  FAILED: "Failed",
  REVERSED: "Reversed",
  REJECTED: "Rejected",
  NEEDS_REVIEW: "Needs review",
};

function friendlyLabel(labels: Record<string, string>, value: string): string {
  return labels[value] ?? value.replace(/_/g, " ");
}

export function WalletScreen({ base, pendingLabel }: { base: "/reseller" | "/agent"; pendingLabel: string }) {
  const wallet = useResource<WalletData>(`${base}/wallet`);
  const destinations = useResource<Destination[]>(`${base}/payout-destinations`);
  const withdrawals = useResource<WithdrawalRow[]>(`${base}/withdrawals`);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [quote, setQuote] = useState<{ q: Quote; destinationId: string; amount: string; key: string } | null>(null);
  const [destId, setDestId] = useState("");
  const [amount, setAmount] = useState("");
  const [isAddDestOpen, setIsAddDestOpen] = useState(false);

  const addDestination = useAction(async (form: HTMLFormElement) => {
    const res = await api.post<{ devVerificationCode?: string; notificationSimulated: boolean }>(
      `${base}/payout-destinations`,
      formValues(form)
    );
    setDevCode(res.devVerificationCode ? `Development only — SMS code: ${res.devVerificationCode}` : null);
    form.reset();
    setIsAddDestOpen(false);
  }, destinations.reload);

  const getQuote = useAction(async () => {
    const q = await api.post<Quote>(`${base}/withdrawals/quote`, { destinationId: destId, amountTzs: amount });
    setQuote({ q, destinationId: destId, amount, key: newIdempotencyKey("wd") });
  });

  /** Picks the largest amount whose total debit (amount + fees) still fits the balance. */
  const maxQuote = useAction(async () => {
    if (!destId) throw new Error("Choose a destination first.");
    const available = Number(wallet.data?.availableTzs ?? 0);
    if (!(available > 0)) throw new Error("No available balance to withdraw.");
    const probe = await api.post<Quote>(`${base}/withdrawals/quote`, {
      destinationId: destId,
      amountTzs: String(available),
    });
    const fees = Number(probe.totalDebitTzs) - Number(probe.amountTzs);
    const max = Math.floor(available - fees);
    if (max < 1) throw new Error("Available balance does not cover the payout fees.");
    const q = await api.post<Quote>(`${base}/withdrawals/quote`, {
      destinationId: destId,
      amountTzs: String(max),
    });
    setAmount(String(max));
    setQuote({ q, destinationId: destId, amount: String(max), key: newIdempotencyKey("wd") });
  });

  const submit = useAction(
    async () => {
      if (!quote) return;
      await api.post(`${base}/withdrawals`, {
        destinationId: quote.destinationId,
        amountTzs: quote.amount,
        idempotencyKey: quote.key,
      });
      setQuote(null);
      setAmount("");
    },
    async () => {
      await Promise.all([wallet.reload(), withdrawals.reload()]);
    }
  );

  const verified = (destinations.data ?? []).filter((d) => d.verifiedAt);
  const wData = wallet.data;
  const history = wallet.data?.history ?? [];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-advo-blue/10 px-2.5 py-0.5 text-xs font-semibold text-advo-blue">
            <Wallet className="h-3.5 w-3.5" />
            Double-Entry Financial Ledger
          </span>
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs font-medium text-slate-500">Real-Time Mobile Money Payouts</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-advo-text sm:text-3xl">Wallet</h1>
        <p className="mt-1 text-sm text-advo-muted">
          Balances are calculated from the ledger. Requested withdrawals are reserved immediately to guarantee funds.
        </p>
      </div>

      {/* Balance summary */}
      <ResourceView resource={wallet}>
        {(w) => (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Available Balance */}
            <Card className="relative overflow-hidden p-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Available Balance</span>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <ArrowDownRight className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 text-3xl font-extrabold tracking-tight text-emerald-700">
                {formatTzs(w.availableTzs)}
              </div>
              <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Ready for instant mobile withdrawal
              </div>
            </Card>

            {/* Pending Balance */}
            <Card className="relative overflow-hidden p-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{pendingLabel}</span>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-advo-gold">
                  <Clock className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 text-3xl font-extrabold tracking-tight text-advo-text">
                {formatTzs(w.pendingTzs)}
              </div>
              <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                <span className="h-2 w-2 rounded-full bg-advo-gold" />
                Clearing within provider settlement cycle
              </div>
            </Card>

            {/* Reserved Balance */}
            <Card className="relative overflow-hidden p-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Reserved for withdrawals</span>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  <Lock className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 text-3xl font-extrabold tracking-tight text-slate-700">
                {formatTzs(w.reservedTzs)}
              </div>
              <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                <span className="h-2 w-2 rounded-full bg-slate-400" />
                Locked in active payout transit
              </div>
            </Card>
          </div>
        )}
      </ResourceView>

      {/* Request a Withdrawal Section */}
      <Card className="p-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-advo-blue/10 text-advo-blue">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-advo-text">Request a withdrawal</h2>
              <p className="text-xs text-slate-500">Disburse your earnings directly to mobile money</p>
            </div>
          </div>
        </div>

        <div className="mt-6">
          {verified.length === 0 ? (
            <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-6 text-center">
              <AlertTriangle className="mx-auto h-8 w-8 text-advo-gold" />
              <h3 className="mt-2 text-sm font-bold text-advo-text">No verified destination</h3>
              <p className="mt-1 text-xs text-slate-500">
                Please add and verify a mobile money recipient number below before requesting a payout.
              </p>
              <button
                type="button"
                onClick={() => setIsAddDestOpen(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-advo-blue px-4 py-2 text-xs font-semibold text-white shadow hover:bg-advo-blue-hover"
              >
                <PlusCircle className="h-4 w-4" />
                Add Destination Now
              </button>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                maxQuote.setError(null);
                void getQuote.run();
              }}
            >
              <div className="grid gap-5 md:grid-cols-3">
                <div>
                  <label htmlFor="wd-dest" className="block text-xs font-semibold text-slate-700">
                    Destination Mobile Account
                  </label>
                  <select
                    id="wd-dest"
                    value={destId}
                    onChange={(e) => {
                      setDestId(e.target.value);
                      setQuote(null);
                    }}
                    required
                    className="mt-1.5 w-full rounded-field border border-slate-200 bg-[var(--advo-page)] px-3.5 py-2.5 text-sm font-medium text-[var(--advo-text)] transition focus:border-[var(--advo-blue)] focus:bg-white focus:outline-none"
                  >
                    <option value="">Choose a destination…</option>
                    {verified.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.recipientName} ({d.phone})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="wd-amount" className="block text-xs font-semibold text-slate-700">
                    Amount to receive (TZS)
                  </label>
                  <input
                    id="wd-amount"
                    type="number"
                    min={1}
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      setQuote(null);
                    }}
                    placeholder="e.g. 10000"
                    required
                    className="mt-1.5 w-full rounded-field border border-slate-200 bg-[var(--advo-page)] px-3.5 py-2.5 text-sm font-medium text-[var(--advo-text)] transition focus:border-[var(--advo-blue)] focus:bg-white focus:outline-none"
                  />
                  {wData?.availableTzs && Number(wData.availableTzs) > 0 && (
                    <div className="mt-1.5 flex gap-2">
                      <button
                        type="button"
                        disabled={maxQuote.pending}
                        onClick={() => {
                          getQuote.setError(null);
                          void maxQuote.run();
                        }}
                        className="text-[11px] font-semibold text-advo-blue hover:underline disabled:opacity-50"
                      >
                        {maxQuote.pending
                          ? "Calculating max…"
                          : `Max Available (${formatTzs(wData.availableTzs)})`}
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={getQuote.pending}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
                  >
                    <Receipt className="h-4 w-4" />
                    {getQuote.pending ? "Calculating Quote…" : "Get Fee Quote"}
                  </button>
                </div>
              </div>
            </form>
          )}

          {getQuote.error || maxQuote.error ? (
            <div className="mt-3">
              <Notice tone="danger">{getQuote.error ?? maxQuote.error}</Notice>
            </div>
          ) : null}

          {/* Fee Quote Breakdown Card */}
          {quote ? (
            <div className="mt-6 rounded-xl border-2 border-advo-blue/30 bg-blue-50/20 p-5">
              <div className="flex items-center justify-between border-b border-blue-100 pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-advo-blue">Payout Summary Quote</span>
                <span className="text-xs font-semibold text-slate-500">Guaranteed for this transaction</span>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                <div>
                  <span className="text-slate-500">Destination</span>
                  <p className="mt-0.5 font-bold text-advo-text">
                    {quote.q.destination.recipientName} ({quote.q.destination.phone})
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Net Amount to Receive</span>
                  <p className="mt-0.5 font-bold text-emerald-700">{formatTzs(quote.q.amountTzs)}</p>
                </div>
                <div>
                  <span className="text-slate-500">Fees (Provider + Platform)</span>
                  <p className="mt-0.5 font-semibold text-slate-700">
                    {formatTzs(quote.q.providerFeeTzs)} + {formatTzs(quote.q.platformFeeTzs)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Total Deducted from Wallet</span>
                  <p className="mt-0.5 font-extrabold text-advo-text">{formatTzs(quote.q.totalDebitTzs)}</p>
                </div>
              </div>

              {quote.q.provider === "fake" ? (
                <p className="mt-3 text-xs text-advo-gold">
                  ⚠️ Simulated payment provider active — no actual telecom funds will move.
                </p>
              ) : null}

              {!quote.q.sufficient ? (
                <div className="mt-4">
                  <Notice tone="danger">
                    Insufficient available balance ({formatTzs(quote.q.availableTzs)}). Lower the amount to proceed.
                  </Notice>
                </div>
              ) : (
                <div className="mt-5 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void submit.run()}
                    disabled={submit.pending}
                    className="inline-flex items-center gap-2 rounded-xl bg-advo-blue px-6 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-advo-blue-hover active:scale-95 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    {submit.pending ? "Submitting Payout…" : "Confirm Withdrawal Request"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuote(null)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {submit.error ? <div className="mt-3"><Notice tone="danger">{submit.error}</Notice></div> : null}
            </div>
          ) : null}
        </div>
      </Card>

      {/* Payout Destinations & Verification Section */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Destinations List */}
        <Card className="p-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-advo-text">Destinations</h2>
              <p className="text-xs text-slate-500">Verified mobile money accounts for payouts</p>
            </div>
            <button
              type="button"
              onClick={() => setIsAddDestOpen(!isAddDestOpen)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-advo-blue shadow-sm hover:bg-blue-50"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              Add New
            </button>
          </div>

          <div className="mt-4">
            <ResourceView resource={destinations}>
              {(rows) => (
                <AdvoTable label="Payout destinations"
                  rows={rows}
                  rowKey={(d) => d.id}
                  empty="No payout destinations added."
                  columns={[
                    {
                      key: "n",
                      header: "Recipient",
                      render: (d) => (
                        <div>
                          <p className="font-bold text-advo-text">{d.recipientName}</p>
                          <Mono>{d.phone}</Mono>
                        </div>
                      ),
                    },
                    {
                      key: "v",
                      header: "Status",
                    render: (d) => (
                      <StatusChip tone={d.verifiedAt ? "success" : "warning"}>
                        {d.verifiedAt ? "VERIFIED" : "UNVERIFIED"}
                      </StatusChip>
                    ),
                    },
                    {
                      key: "a",
                      header: "",
                      render: (d) => (
                        <div className="flex items-center justify-end gap-2">
                          {!d.verifiedAt ? (
                            <ActionButton
                              variant="primary"
                              onRun={async () => {
                                const code = window.prompt("Enter the 6-digit code sent to this number");
                                if (!code) return;
                                await api.post(`${base}/payout-destinations/${d.id}/verify`, { code: code.trim() });
                              }}
                              onDone={destinations.reload}
                            >
                              Verify
                            </ActionButton>
                          ) : null}
                          <ActionButton
                            variant="danger"
                            confirm="Remove this destination?"
                            onRun={() => api.del(`${base}/payout-destinations/${d.id}`)}
                            onDone={destinations.reload}
                          >
                            Remove
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

        {/* Add Payout Destination Form Card */}
        <Card className="p-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-lg font-bold text-advo-text">Add payout destination</h2>
            <p className="text-xs text-slate-500">
              A 6-digit SMS verification code will be sent to the phone number.
            </p>
          </div>

          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void addDestination.run(e.currentTarget);
            }}
          >
            <Field
              name="recipientName"
              label="Registered Account Name (e.g. John Doe)"
              placeholder="Full name as registered on SIM"
              required
            />
            <Field
              name="phone"
              label="Mobile Money Number (Tanzania)"
              placeholder="0712 345 678"
              required
            />

            {addDestination.error ? <Notice tone="danger">{addDestination.error}</Notice> : null}

            {devCode ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-advo-blue">
                {devCode}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={addDestination.pending}
              className="inline-flex items-center gap-2 rounded-xl bg-advo-blue px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-advo-blue-hover disabled:opacity-50"
            >
              <Smartphone className="h-4 w-4" />
              {addDestination.pending ? "Adding Destination…" : "Add Destination"}
            </button>
          </form>
        </Card>
      </div>

      {/* Withdrawal History Section */}
      <Card className="p-6">
        <div className="border-b border-slate-100 pb-4">
          <h2 className="text-lg font-bold text-advo-text">Withdrawal history</h2>
          <p className="text-xs text-slate-500">Track the status of all requested disbursements</p>
        </div>

        <div className="mt-4">
          <ResourceView resource={withdrawals}>
            {(rows) => (
              <AdvoTable label="Withdrawals"
                rows={rows}
                rowKey={(w) => w.id}
                empty="No withdrawals yet."
                columns={[
                  {
                    key: "d",
                    header: "Requested",
                    render: (w) => <span className="text-xs text-slate-600">{formatDateTime(w.createdAt)}</span>,
                  },
                  {
                    key: "to",
                    header: "Recipient",
                    render: (w) => (
                      <span className="font-bold text-advo-text">{w.destinationSnapshot.recipientName ?? "—"}</span>
                    ),
                  },
                  {
                    key: "a",
                    header: "Amount",
                    render: (w) => <span className="font-bold text-emerald-700">{formatTzs(w.amountTzs)}</span>,
                    className: "text-right",
                  },
                  {
                    key: "t",
                    header: "Total Debit",
                    render: (w) => <span className="text-xs text-slate-500">{formatTzs(w.totalDebitTzs)}</span>,
                    className: "text-right",
                  },
                  {
                    key: "s",
                    header: "Status",
                    render: (w) => (
                      <div>
                        <StatusChip tone={statusTone(w.state)}>
                          {friendlyLabel(WITHDRAWAL_STATE_LABELS, w.state)}
                        </StatusChip>
                        {w.reviewReason || w.failureReason ? (
                          <p className="mt-0.5 text-[10px] text-red-600">{w.failureReason ?? w.reviewReason}</p>
                        ) : null}
                      </div>
                    ),
                  },
                ]}
              />
            )}
          </ResourceView>
        </div>
      </Card>

      {/* Recent Ledger Entries (Required by e2e test with exact heading name) */}
      <Card className="p-6">
        <div className="border-b border-slate-100 pb-4">
          <h2 className="text-lg font-bold text-advo-text">Recent ledger entries</h2>
          <p className="text-xs text-slate-500">Immutable double-entry book entries</p>
        </div>

        <div className="mt-4">
          {wallet.error && wallet.data === undefined ? (
            <Notice tone="danger">Could not load ledger entries: {wallet.error.message}</Notice>
          ) : wallet.data === undefined ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : history.length === 0 ? (
            <Notice tone="default">No ledger entries yet.</Notice>
          ) : (
            <AdvoTable label="Wallet ledger"
              rows={history}
              rowKey={(h) => h.id}
              columns={[
                {
                  key: "d",
                  header: "When",
                  render: (h) => <span className="text-xs text-slate-500">{formatDateTime(h.at)}</span>,
                },
                {
                  key: "j",
                  header: "Description",
                  render: (h) => <span className="font-semibold text-advo-text">{h.description}</span>,
                },
                {
                  key: "a",
                  header: "Account",
                  render: (h) => <Mono>{h.account}</Mono>,
                },
                {
                  key: "dr",
                  header: "Debit",
                  render: (h) =>
                    h.debitTzs !== "0" ? (
                      <span className="font-mono font-bold text-red-600">-{formatTzs(h.debitTzs)}</span>
                    ) : (
                      ""
                    ),
                  className: "text-right",
                },
                {
                  key: "cr",
                  header: "Credit",
                  render: (h) =>
                    h.creditTzs !== "0" ? (
                      <span className="font-mono font-bold text-emerald-600">+{formatTzs(h.creditTzs)}</span>
                    ) : (
                      ""
                    ),
                  className: "text-right",
                },
              ]}
            />
          )}
        </div>
      </Card>
    </div>
  );
}
