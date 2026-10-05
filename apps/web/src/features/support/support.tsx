"use client";

import { useState } from "react";
import { formatDateTime } from "@advo/api-client";
import { Card } from "@heroui/react";
import { Notice, StatusChip } from "@advo/ui";
import { ActionButton } from "@/features/common/actions";
import { Field, PageHeader, ResourceView, TextareaField } from "@/features/common/components";
import { api } from "@/lib/api";
import { useI18n, type I18n } from "@/lib/i18n";
import { formValues, useAction, useResource } from "@/lib/hooks";
import {
  LifeBuoy,
  MessageSquare,
  Send,
  CheckCircle2,
  Clock,
  User,
  Shield,
  PlusCircle,
  MessageCircle,
} from "lucide-react";

type Ticket = {
  id: string;
  subject: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  owner?: { name: string; email: string; role: string };
  messages: Array<{ id: string; authorUserId: string; body: string; createdAt: string }>;
};

/** Ticket state → message key, so the chip and the admin actions agree. */
const TICKET_STATE_KEYS: Record<string, string> = {
  open: "ticket.state.open",
  pending: "ticket.state.pending",
  resolved: "ticket.state.resolved",
  closed: "ticket.state.closed",
};

function ticketStateLabel(t: I18n["t"], state: string): string {
  const key = TICKET_STATE_KEYS[state];
  return key ? t(key as "ticket.state.open") : state.toUpperCase();
}

function TicketThread({
  ticket,
  basePath,
  onChange,
  admin,
}: {
  ticket: Ticket;
  basePath: string;
  onChange: () => Promise<void>;
  admin: boolean;
}) {
  const { t } = useI18n();
  const [body, setBody] = useState("");
  const reply = useAction(async () => {
    await api.post(`${basePath}/${ticket.id}/messages`, { body });
    setBody("");
  }, onChange);

  const ownerId = ticket.messages[0]?.authorUserId;
  const isOpen = ticket.state === "open";
  const isResolved = ticket.state === "resolved";

  return (
    <Card className="overflow-hidden p-6 hover:border-advo-blue/30">
      {/* Ticket Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-slate-400">#{ticket.id.slice(0, 8)}</span>
            <h3 className="text-base font-bold text-advo-text">{ticket.subject}</h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {ticket.owner ? `${ticket.owner.name} (${ticket.owner.role.toLowerCase()}) · ` : ""}
            {t("reseller.support.thread.opened", { date: formatDateTime(ticket.createdAt) })}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <StatusChip tone={isOpen ? "warning" : isResolved ? "success" : "default"}>
            {ticketStateLabel(t, ticket.state)}
          </StatusChip>

          {admin
            ? (["pending", "resolved", "closed"] as const)
                .filter((s) => s !== ticket.state)
                .map((s) => (
                  <ActionButton
                    key={s}
                    onRun={() => api.post(`/admin/support/${ticket.id}/state`, { state: s })}
                    onDone={onChange}
                  >
                    {t("reseller.support.thread.mark", { state: ticketStateLabel(t, s) })}
                  </ActionButton>
                ))
            : null}
        </div>
      </div>

      {/* Messages Thread */}
      <ol className="mt-5 space-y-3.5">
        {ticket.messages.map((m) => {
          const isCustomer = m.authorUserId === ownerId;
          return (
            <li
              key={m.id}
              className={`rounded-xl p-4 transition ${
                isCustomer
                  ? "border border-slate-100 bg-advo-page"
                  : "border border-advo-blue/20 bg-blue-50/40"
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                      isCustomer ? "bg-slate-200 text-slate-700" : "bg-advo-blue text-white"
                    }`}
                  >
                    {isCustomer ? <User className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
                  </div>
                  <span className="font-bold text-advo-text">
                    {isCustomer ? t("reseller.support.thread.you") : t("reseller.support.thread.team")}
                  </span>
                </div>
                <span className="text-slate-400">{formatDateTime(m.createdAt)}</span>
              </div>

              <p className="mt-2.5 whitespace-pre-wrap text-sm text-slate-800">{m.body}</p>
            </li>
          );
        })}
      </ol>

      {/* Reply Box */}
      {ticket.state !== "closed" ? (
        <form
          className="mt-5 space-y-3 border-t border-slate-100 pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void reply.run();
          }}
        >
          <textarea
            aria-label={t("reseller.support.thread.replyLabel")}
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("reseller.support.thread.replyPlaceholder")}
            required
            className="w-full rounded-field border border-slate-200 bg-[var(--advo-page)] p-3 text-sm text-[var(--advo-text)] placeholder-slate-400 transition focus:border-[var(--advo-blue)] focus:bg-white focus:outline-none"
          />
          {reply.error ? <Notice tone="danger">{reply.error}</Notice> : null}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={reply.pending || !body.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-advo-blue px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-advo-blue-hover active:scale-95 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              {reply.pending ? t("reseller.support.thread.replying") : t("reseller.support.thread.reply")}
            </button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}

/** Reseller and Agent support: own tickets only. */
export function SupportScreen({ base }: { base: "/reseller" | "/agent" }) {
  const { t } = useI18n();
  const tickets = useResource<Ticket[]>(`${base}/support`);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const create = useAction(async (form: HTMLFormElement) => {
    await api.post(`${base}/support`, formValues(form));
    form.reset();
    setIsFormOpen(false);
  }, tickets.reload);

  const ticketList = tickets.data ?? [];
  const openCount = ticketList.filter((t) => t.state === "open").length;
  const resolvedCount = ticketList.filter((t) => t.state === "resolved").length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-advo-blue/10 px-2.5 py-0.5 text-xs font-semibold text-advo-blue">
              <LifeBuoy className="h-3.5 w-3.5" />
              {t("reseller.support.badge")}
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs font-medium text-slate-500">{t("reseller.support.inbox")}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-advo-text sm:text-3xl">
            {t("nav.support")}
          </h1>
          <p className="mt-1 text-sm text-advo-muted">{t("reseller.support.subtitle")}</p>
        </div>
        <div>
          <button
            type="button"
            onClick={() => setIsFormOpen(!isFormOpen)}
            className="inline-flex items-center gap-2 rounded-xl bg-advo-blue px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-advo-blue-hover active:scale-95"
          >
            <PlusCircle className="h-4 w-4" />
            {isFormOpen ? t("reseller.support.action.closeForm") : t("reseller.support.action.open")}
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t("reseller.support.kpi.open")}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-advo-gold">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-advo-text">{openCount}</div>
          <p className="mt-1 text-xs text-slate-500">{t("reseller.support.kpi.openHint")}</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t("reseller.support.kpi.resolved")}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">{resolvedCount}</div>
          <p className="mt-1 text-xs text-slate-500">{t("reseller.support.kpi.resolvedHint")}</p>
        </Card>

        <Card className="col-span-2 p-4 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t("reseller.support.kpi.total")}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-advo-blue">
              <MessageSquare className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-advo-blue">{ticketList.length}</div>
          <p className="mt-1 text-xs text-slate-500">{t("reseller.support.kpi.totalHint")}</p>
        </Card>
      </div>

      {/* Ticket Creation Card (Collapsible) */}
      {isFormOpen && (
        <Card className="p-6 ring-4 ring-advo-blue/5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-advo-blue/10 text-advo-blue">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-advo-text">{t("reseller.support.form.title")}</h3>
                <p className="text-xs text-slate-500">{t("reseller.support.form.caption")}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              {t("common.cancel")}
            </button>
          </div>

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void create.run(e.currentTarget);
            }}
          >
            <Field
              name="subject"
              label={t("reseller.support.form.subject")}
              placeholder={t("reseller.support.form.subjectPlaceholder")}
              required
            />
            <TextareaField
              name="body"
              label={t("reseller.support.form.body")}
              rows={4}
              required
            />

            {create.error ? <Notice tone="danger">{create.error}</Notice> : null}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={create.pending}
                className="inline-flex items-center gap-2 rounded-xl bg-advo-blue px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-advo-blue-hover active:scale-95 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {create.pending ? t("reseller.support.form.sending") : t("reseller.support.form.send")}
              </button>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                {t("common.cancel")}
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* Ticket List */}
      <div className="space-y-4">
        <ResourceView resource={tickets}>
          {(rows) =>
            rows.length === 0 ? (
              <Card className="border-dashed p-12 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-advo-blue">
                  <MessageCircle className="h-6 w-6" />
                </div>
                <h3 className="mt-3 text-base font-bold text-advo-text">{t("reseller.support.empty.title")}</h3>
                <p className="mt-1 text-xs text-slate-500">{t("reseller.support.empty.body")}</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {rows.map((t) => (
                  <TicketThread
                    key={t.id}
                    ticket={t}
                    basePath={`${base}/support`}
                    onChange={tickets.reload}
                    admin={false}
                  />
                ))}
              </div>
            )
          }
        </ResourceView>
      </div>
    </div>
  );
}

export function AdminSupportScreen() {
  const { t } = useI18n();
  const tickets = useResource<Ticket[]>("/admin/support");
  return (
    <div className="space-y-6">
      <PageHeader
        title={t("reseller.support.admin.title")}
        description={t("reseller.support.admin.description")}
      />
      <ResourceView resource={tickets}>
        {(rows) =>
          rows.length === 0 ? (
            <Notice tone="default">{t("reseller.support.admin.empty")}</Notice>
          ) : (
            <div className="space-y-4">
              {rows.map((t) => (
                <TicketThread
                  key={t.id}
                  ticket={t}
                  basePath="/admin/support"
                  onChange={tickets.reload}
                  admin
                />
              ))}
            </div>
          )
        }
      </ResourceView>
    </div>
  );
}
