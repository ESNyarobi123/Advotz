"use client";

import { useState } from "react";
import { formatDateTime, formatTzs } from "@advo/api-client";
import { Card } from "@heroui/react";
import { AdvoTable, Notice, StatusChip, statusTone } from "@advo/ui";
import { Field, ResourceView } from "@/features/common/components";
import { useSessionUser } from "@/features/shell/DashboardShell";
import { api, newIdempotencyKey } from "@/lib/api";
import { formValues, useAction, useResource } from "@/lib/hooks";
import {
  Crown,
  Sparkles,
  Check,
  Smartphone,
} from "lucide-react";

type Plan = {
  id: string;
  code: string;
  name: string;
  priceTzs: string;
  periodDays: number;
  trialEligible: boolean;
  trialDays: number | null;
  maxSites: number;
  maxDevices: number;
  maxPackages: number;
  isDemo: boolean;
};

type SubscriptionView = {
  state: string;
  plan: Plan | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialUsed: boolean;
  invoices: Array<{
    id: string;
    amountTzs: string;
    status: string;
    plan: { name?: string };
    periodStart: string | null;
    periodEnd: string | null;
    paidAt: string | null;
    createdAt: string;
    payment: { state: string; lastError: string | null } | null;
  }>;
};

/** Real enum vocabularies (packages/db/prisma/schema.prisma), rendered for humans. */
const SUBSCRIPTION_STATE_LABELS: Record<string, string> = {
  NONE: "No plan",
  TRIALING: "Trial",
  ACTIVE: "Active",
  PAST_DUE: "Past due",
  EXPIRED: "Expired",
  SUSPENDED: "Suspended",
  CANCELLED: "Cancelled",
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  PAID: "Paid",
  VOID: "Void",
};

const PAYMENT_ATTEMPT_STATE_LABELS: Record<string, string> = {
  CREATED: "Created",
  DISPATCHING: "Dispatching",
  PENDING: "Pending",
  UNKNOWN: "Unknown",
  COMPLETED: "Completed",
  FAILED: "Failed",
  VOIDED: "Voided",
  EXPIRED: "Expired",
  NEEDS_REVIEW: "Needs review",
};

function friendlyLabel(labels: Record<string, string>, value: string): string {
  return labels[value] ?? value.replace(/_/g, " ");
}

export function ResellerSubscriptionScreen() {
  const user = useSessionUser();
  const sub = useResource<SubscriptionView>("/reseller/subscription");
  const plans = useResource<Plan[]>("/reseller/plans");
  const [selected, setSelected] = useState<Plan | null>(null);
  const [checkoutKey, setCheckoutKey] = useState(() => newIdempotencyKey("sub"));
  const [notice, setNotice] = useState<string | null>(null);

  const trial = useAction(async (planId: string) => {
    await api.post("/reseller/subscription/trial", { planId });
  }, sub.reload);

  const checkout = useAction(async (form: HTMLFormElement) => {
    if (!selected) return;
    const v = formValues(form);
    const res = await api.post<{ payment: { state: string; lastError: string | null } }>(
      "/reseller/subscription/checkout",
      {
        planId: selected.id,
        phone: v.phone,
        firstName: v.firstName,
        lastName: v.lastName,
        email: v.email,
        idempotencyKey: checkoutKey,
      }
    );
    setNotice(
      res.payment.state === "FAILED"
        ? `Payment could not start: ${res.payment.lastError ?? "unknown error"}`
        : "Payment request sent. Approve it on your phone — the subscription activates only after the provider confirms payment."
    );
    setCheckoutKey(newIdempotencyKey("sub"));
  }, sub.reload);

  const [first, ...rest] = user.name.split(" ");
  const currentSub = sub.data;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-advo-blue/10 px-2.5 py-0.5 text-xs font-semibold text-advo-blue">
            <Crown className="h-3.5 w-3.5" />
            Platform Membership & Quotas
          </span>
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs font-medium text-slate-500">Tier Management</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-advo-text sm:text-3xl">Platform subscription</h1>
        <p className="mt-1 text-sm text-advo-muted">
          Your subscription unlocks sites, devices and packages up to the plan limits.
        </p>
      </div>

      {/* Subscription Status Card */}
      <ResourceView resource={sub}>
        {(s) => {
          return (
            <div className="space-y-4">
              {s.state === "PAST_DUE" ? (
                <Notice tone="warning">
                  Your subscription period has ended and is currently in grace period. Please renew your plan below to continue uninterrupted service.
                </Notice>
              ) : null}

              {s.state === "EXPIRED" ? (
                <Notice tone="danger">
                  Your subscription has expired. New customer WiFi purchases are temporarily paused until you renew your plan below.
                </Notice>
              ) : null}

              {/* Hero Status Card */}
              <Card className="relative overflow-hidden p-6">
                <div className="absolute right-0 top-0 h-40 w-40 rounded-bl-full bg-gradient-to-br from-advo-blue/10 via-advo-gold/10 to-transparent pointer-events-none" />

                <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-advo-blue text-white shadow-md">
                      <Crown className="h-7 w-7" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-advo-text">{s.plan?.name ?? "No Active Plan"}</h2>
                        <StatusChip tone={statusTone(s.state)}>
                          {friendlyLabel(SUBSCRIPTION_STATE_LABELS, s.state)}
                        </StatusChip>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {s.plan
                          ? `${s.plan.maxSites} sites · ${s.plan.maxDevices} devices · ${s.plan.maxPackages} packages quota`
                          : "Select a plan below to activate your hotspot capacity"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 border-t border-slate-100 pt-4 md:border-t-0 md:pt-0">
                    <div className="text-left md:text-right">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Current Period</span>
                      <p className="mt-0.5 text-sm font-bold text-advo-text">
                        {s.currentPeriodEnd ? `Expires ${formatDateTime(s.currentPeriodEnd)}` : "Not scheduled"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Quota Highlights */}
                {s.plan && (
                  <div className="mt-6 grid grid-cols-3 gap-3 border-t border-slate-100 pt-5 text-center">
                    <div className="rounded-xl bg-advo-page p-3">
                      <div className="text-lg font-extrabold text-advo-text">{s.plan.maxSites}</div>
                      <span className="text-[11px] font-medium text-slate-500">Max Sites</span>
                    </div>
                    <div className="rounded-xl bg-advo-page p-3">
                      <div className="text-lg font-extrabold text-advo-text">{s.plan.maxDevices}</div>
                      <span className="text-[11px] font-medium text-slate-500">Max Devices</span>
                    </div>
                    <div className="rounded-xl bg-advo-page p-3">
                      <div className="text-lg font-extrabold text-advo-text">{s.plan.maxPackages}</div>
                      <span className="text-[11px] font-medium text-slate-500">WiFi Packages</span>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          );
        }}
      </ResourceView>

      {/* Plans Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-advo-text">Available Plans</h2>
          <p className="text-xs text-slate-500">Upgrade or renew your hotspot operator capacity</p>
        </div>

        <ResourceView resource={plans}>
          {(rows) =>
            rows.length === 0 ? (
              <Notice tone="default">No plans are on offer yet. The Advo team has not published pricing.</Notice>
            ) : (
              <div className="grid gap-6 md:grid-cols-3">
                {rows.map((p) => {
                  const isSelected = selected?.id === p.id;
                  return (
                    <Card
                      key={p.id}
                      className={`group relative flex flex-col justify-between overflow-hidden p-6 hover:-translate-y-1 hover:shadow-xl ${
                        isSelected
                          ? "border-advo-blue ring-4 ring-advo-blue/10"
                          : "border-advo-border hover:border-slate-300"
                      }`}
                    >
                      {/* Top strip */}
                      <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-advo-blue via-advo-gold to-advo-orange" />

                      <div>
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-bold text-advo-text">{p.name}</h3>
                          {p.isDemo ? (
                            <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-advo-gold">
                              DEMO
                            </span>
                          ) : null}
                        </div>

                        {/* Price */}
                        <div className="mt-4 flex items-baseline gap-1">
                          <span className="text-3xl font-extrabold tracking-tight text-advo-text">
                            {formatTzs(p.priceTzs)}
                          </span>
                          <span className="text-xs text-slate-400">/ {p.periodDays} days</span>
                        </div>

                        {/* Features List */}
                        <ul className="mt-6 space-y-3 border-t border-slate-100 pt-4 text-xs">
                          <li className="flex items-center gap-2.5 text-slate-700">
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                              <Check className="h-3 w-3" />
                            </div>
                            <span>Up to <strong>{p.maxSites}</strong> hotspot sites</span>
                          </li>
                          <li className="flex items-center gap-2.5 text-slate-700">
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                              <Check className="h-3 w-3" />
                            </div>
                            <span>Up to <strong>{p.maxDevices}</strong> access points</span>
                          </li>
                          <li className="flex items-center gap-2.5 text-slate-700">
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                              <Check className="h-3 w-3" />
                            </div>
                            <span>Up to <strong>{p.maxPackages}</strong> WiFi packages</span>
                          </li>
                          <li className="flex items-center gap-2.5 text-slate-700">
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                              <Check className="h-3 w-3" />
                            </div>
                            <span>Real-time captive portal & Radius server</span>
                          </li>
                        </ul>
                      </div>

                      {/* Action buttons */}
                      <div className="mt-6 space-y-2 border-t border-slate-100 pt-4">
                        <button
                          type="button"
                          onClick={() => {
                            setSelected(p);
                            setNotice(null);
                          }}
                          className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition shadow-sm ${
                            isSelected
                              ? "bg-[var(--advo-blue)] text-white ring-2 ring-[var(--advo-blue)]/30"
                              : "border border-[var(--advo-blue)] bg-white text-[var(--advo-blue)] hover:bg-[var(--advo-blue)]/10"
                          }`}
                        >
                          {isSelected ? <Check className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}
                          {isSelected ? "Selected — pay with Mobile Money" : "Pay with Mobile Money"}
                        </button>

                        {p.trialEligible && (p.trialDays ?? 0) > 0 && !currentSub?.trialUsed ? (
                          <button
                            type="button"
                            disabled={trial.pending}
                            onClick={() => void trial.run(p.id)}
                            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <Sparkles className="h-3.5 w-3.5 text-advo-gold" />
                            Start {p.trialDays}-day free trial
                          </button>
                        ) : null}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )
          }
        </ResourceView>

        {trial.error ? <div className="mt-3"><Notice tone="danger">{trial.error}</Notice></div> : null}
      </div>

      {/* Checkout Drawer / Card when a Plan is Selected */}
      {selected ? (
        <Card className="p-6 ring-4 ring-advo-blue/5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-advo-blue/10 text-advo-blue">
                <Smartphone className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-advo-text">
                  Pay {formatTzs(selected.priceTzs)} for {selected.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Instant mobile money STK push to your phone (M-Pesa, TigoPesa, Airtel, HaloPesa)
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>

          <form
            className="mt-6 grid gap-5 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void checkout.run(e.currentTarget);
            }}
          >
            <Field
              name="phone"
              label="Mobile Money Number (Tanzania)"
              placeholder="0712 345 678"
              required
            />
            <Field
              name="email"
              label="Invoice & Receipt Email"
              type="email"
              defaultValue={user.email}
              required
            />
            <Field name="firstName" label="First Name" defaultValue={first} required />
            <Field name="lastName" label="Last Name" defaultValue={rest.join(" ") || first} required />

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={checkout.pending}
                className="inline-flex items-center gap-2 rounded-xl bg-advo-blue px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-advo-blue-hover active:scale-95 disabled:opacity-50"
              >
                <Smartphone className="h-4 w-4" />
                {checkout.pending ? "Sending STK Push to Phone…" : "Send Payment Request"}
              </button>
            </div>
          </form>

          {checkout.error ? <div className="mt-3"><Notice tone="danger">{checkout.error}</Notice></div> : null}

          {notice ? (
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-advo-blue">
              {notice}{" "}
              <button type="button" className="font-bold underline" onClick={() => void sub.reload()}>
                Refresh status
              </button>
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* Invoices Section */}
      <Card className="p-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-advo-text">Invoices</h2>
            <p className="text-xs text-slate-500">Subscription billing history and receipts</p>
          </div>
        </div>

        <div className="mt-4">
          <ResourceView resource={sub}>
            {(s) => (
              <AdvoTable label="Subscription invoices"
                rows={s.invoices}
                rowKey={(i) => i.id}
                empty="No subscription invoices yet."
                columns={[
                  {
                    key: "c",
                    header: "Created",
                    render: (i) => (
                      <span className="text-xs font-medium text-slate-600">{formatDateTime(i.createdAt)}</span>
                    ),
                  },
                  {
                    key: "p",
                    header: "Plan",
                    render: (i) => <span className="font-bold text-advo-text">{i.plan?.name ?? "—"}</span>,
                  },
                  {
                    key: "a",
                    header: "Amount",
                    render: (i) => <span className="font-bold text-emerald-700">{formatTzs(i.amountTzs)}</span>,
                    className: "text-right",
                  },
                  {
                    key: "s",
                    header: "Invoice",
                    render: (i) => (
                      <StatusChip tone={i.status === "PAID" ? "success" : "default"}>
                        {friendlyLabel(INVOICE_STATUS_LABELS, i.status)}
                      </StatusChip>
                    ),
                  },
                  {
                    key: "pay",
                    header: "Payment",
                    render: (i) =>
                      i.payment ? (
                        <div>
                          <StatusChip tone={statusTone(i.payment.state)}>
                            {friendlyLabel(PAYMENT_ATTEMPT_STATE_LABELS, i.payment.state)}
                          </StatusChip>
                          {i.payment.lastError ? (
                            <p className="mt-0.5 text-[10px] text-red-600">{i.payment.lastError}</p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      ),
                  },
                  {
                    key: "per",
                    header: "Period",
                    render: (i) =>
                      i.periodStart ? (
                        <span className="text-xs text-slate-500">
                          {formatDateTime(i.periodStart)} → {formatDateTime(i.periodEnd)}
                        </span>
                      ) : (
                        "—"
                      ),
                  },
                ]}
              />
            )}
          </ResourceView>
        </div>
      </Card>
    </div>
  );
}
