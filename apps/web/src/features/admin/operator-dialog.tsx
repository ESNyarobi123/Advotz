"use client";

import { useCallback, useEffect, useState } from "react";
import { useOverlayState } from "@heroui/react";
import { Button, Label, Modal, TextArea } from "@heroui/react";
import { AdvoSelect, Notice } from "@advo/ui";
import type { MessageKey, TranslateVars } from "@advo/i18n";
import { api, errorMessage } from "@/lib/api";

/** The app's bound translator, as returned by `useI18n().t`. */
type Translator = (key: MessageKey, vars?: TranslateVars) => string;

/**
 * The operator actions that require a written justification. Every one of them is
 * audited, so the dialog is the single place that collects the reason and talks to
 * the API — the reseller and agent screens only open it.
 */
export type OperatorAction = "status" | "attribution" | "impersonate";

export type AgentOption = { id: string; referralCode: string; status: string; user: { name: string } };

/** Who the operator is acting on. `attributionCode` is reseller-only. */
export type OperatorTarget = {
  /** Display name used in the dialog title, e.g. the business or agent name. */
  displayName: string;
  suspended: boolean;
  /** Referral code currently credited — pre-selected in the attribution dialog. */
  attributionCode?: string;
};

/** Every string the dialog needs, so the same component serves resellers and agents. */
export type OperatorCopy = {
  reason: string;
  reasonHint: string;
  reasonPlaceholder: string;
  reasonTooShort: string;
  agent: string;
  agentNone: string;
  statusTitleSuspend: string;
  statusTitleReactivate: string;
  statusNoteSuspend: string;
  statusNoteReactivate: string;
  attributionTitle: string;
  attributionNote: string;
  impersonateTitle: string;
  impersonateNote: string;
  confirm: string;
  cancel: string;
};

/**
 * Owns the dialog state plus the mutations behind it.
 *
 * `basePath` is the account's admin endpoint (`/admin/resellers/{id}` or
 * `/admin/agents/{id}`) so the same hook drives both screens; `redirectTo` is the
 * dashboard to land on after impersonation.
 */
export function useOperatorActions({
  basePath,
  copy,
  onChanged,
  redirectTo,
  showAttribution = false,
  target,
}: {
  basePath: string;
  copy: OperatorCopy;
  onChanged: () => void | Promise<void>;
  redirectTo: string;
  showAttribution?: boolean;
  target: OperatorTarget;
}) {
  const [action, setAction] = useState<OperatorAction | null>(null);
  const [busy, setBusy] = useState<OperatorAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentOption[] | null>(null);

  const dialog = useOverlayState({
    isOpen: action !== null,
    onOpenChange: (open) => {
      if (!open && busy === null) setAction(null);
    },
  });

  const open = useCallback(
    (kind: OperatorAction) => {
      if (kind === "attribution" && !showAttribution) return;
      setError(null);
      setAction(kind);
    },
    [showAttribution],
  );

  const close = useCallback(() => {
    if (busy !== null) return;
    setAction(null);
  }, [busy]);

  // The agent list is only needed by the attribution picker, so it is fetched on demand.
  useEffect(() => {
    if (action !== "attribution" || agents !== null) return;
    let cancelled = false;
    api
      .get<AgentOption[]>("/admin/agents")
      .then((rows) => {
        if (!cancelled) setAgents(rows);
      })
      .catch(() => {
        if (!cancelled) setAgents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [action, agents]);

  async function submit(payload: { reason: string; referralCode?: string }) {
    if (action === "status") {
      setBusy("status");
      setError(null);
      try {
        await api.post(`${basePath}/status`, {
          status: target.suspended ? "ACTIVE" : "SUSPENDED",
          reason: payload.reason,
        });
        await onChanged();
        setAction(null);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusy(null);
      }
      return;
    }

    if (action === "attribution") {
      setBusy("attribution");
      setError(null);
      try {
        // The API takes an agent id, so resolve the referral code the operator picked.
        const code = (payload.referralCode ?? "").trim();
        let agentId: string | null = null;
        if (code) {
          const rows = agents ?? (await api.get<AgentOption[]>("/admin/agents"));
          const agent = rows.find((a) => a.referralCode.toLowerCase() === code.toLowerCase());
          if (!agent) {
            setError(`No agent with referral code ${code}`);
            return;
          }
          agentId = agent.id;
        }
        await api.post(`${basePath}/attribution`, { agentId, reason: payload.reason });
        await onChanged();
        setAction(null);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusy(null);
      }
      return;
    }

    if (action === "impersonate") {
      setBusy("impersonate");
      setError(null);
      try {
        await api.post(`${basePath}/impersonate`, { reason: payload.reason });
        // Full reload so every provider re-bootstraps against the new session.
        window.location.assign(redirectTo);
      } catch (err) {
        setError(errorMessage(err));
        setBusy(null);
      }
    }
  }

  return { action, agents, busy, close, copy, dialog, error, open, setError, showAttribution, submit, target };
}

export type OperatorActions = ReturnType<typeof useOperatorActions>;

/** Reason-collecting dialog shared by the reseller and agent screens. */
export function OperatorDialog({ actions }: { actions: OperatorActions }) {
  const { action, agents, busy, close, copy, dialog, error, showAttribution, submit, target } = actions;
  const [reason, setReason] = useState("");
  const [referralCode, setReferralCode] = useState(target.attributionCode ?? "");
  const [tooShort, setTooShort] = useState(false);

  // Reset the fields whenever a new action opens so no stale reason leaks between flows.
  useEffect(() => {
    setReason("");
    setReferralCode(target.attributionCode ?? "");
    setTooShort(false);
  }, [action, target.attributionCode]);

  const title =
    action === "attribution"
      ? copy.attributionTitle
      : action === "impersonate"
        ? copy.impersonateTitle
        : target.suspended
          ? copy.statusTitleReactivate
          : copy.statusTitleSuspend;
  const note =
    action === "attribution"
      ? copy.attributionNote
      : action === "impersonate"
        ? copy.impersonateNote
        : target.suspended
          ? copy.statusNoteReactivate
          : copy.statusNoteSuspend;

  function submitForm() {
    if (reason.trim().length < 3) {
      setTooShort(true);
      return;
    }
    setTooShort(false);
    void submit({ reason: reason.trim(), referralCode: action === "attribution" ? referralCode : undefined });
  }

  const pending = busy !== null;

  return (
    <Modal.Root state={dialog}>
      <Modal.Backdrop>
        <Modal.Container size="lg">
          <Modal.Dialog className="bg-white">
            <Modal.Header>
              <Modal.Heading className="text-base font-black text-advo-text">{title}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitForm();
                }}
              >
                <p className="text-xs text-advo-muted">{note}</p>

                {action === "attribution" && showAttribution ? (
                  <div>
                    <Label htmlFor="operator-attribution-agent">{copy.agent}</Label>
                    <AdvoSelect
                      id="operator-attribution-agent"
                      onChange={(e) => setReferralCode(e.target.value)}
                      value={referralCode}
                    >
                      <option value="">{copy.agentNone}</option>
                      {(agents ?? [])
                        .filter((a) => a.status === "ACTIVE")
                        .map((a) => (
                          <option key={a.id} value={a.referralCode}>
                            {a.referralCode} — {a.user.name}
                          </option>
                        ))}
                    </AdvoSelect>
                  </div>
                ) : null}

                <div>
                  <Label htmlFor="operator-reason">
                    {copy.reason}
                    <span className="text-[var(--advo-danger)]"> *</span>
                  </Label>
                  <TextArea
                    id="operator-reason"
                    onChange={(e) => {
                      setReason(e.target.value);
                      if (tooShort && e.target.value.trim().length >= 3) setTooShort(false);
                    }}
                    placeholder={copy.reasonPlaceholder}
                    rows={3}
                    value={reason}
                  />
                  <p className="mt-1 text-xs text-advo-muted">{copy.reasonHint}</p>
                </div>

                {tooShort ? <Notice tone="danger">{copy.reasonTooShort}</Notice> : null}
                {error ? <Notice tone="danger">{error}</Notice> : null}

                <div className="flex justify-end gap-2 border-t border-[var(--advo-border)] pt-4">
                  <Button isDisabled={pending} onPress={close} type="button" variant="outline">
                    {copy.cancel}
                  </Button>
                  <Button
                    isDisabled={pending}
                    type="submit"
                    variant={action === "status" && !target.suspended ? "danger-soft" : "primary"}
                  >
                    {pending ? "…" : copy.confirm}
                  </Button>
                </div>
              </form>
            </Modal.Body>
            <Modal.CloseTrigger aria-label={copy.cancel} />
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}

/**
 * Builds the dialog copy for a reseller from the shared `admin.resellers.dialog.*`
 * keys. Lives here (not in the screen) so reseller and agent stay in lockstep.
 */
export function resellerOperatorCopy(t: Translator, resellerName: string): OperatorCopy {
  return {
    reason: t("admin.resellers.dialog.reason"),
    reasonHint: t("admin.resellers.dialog.reasonHint"),
    reasonPlaceholder: t("admin.resellers.dialog.reasonPlaceholder"),
    reasonTooShort: t("admin.resellers.dialog.reasonTooShort"),
    agent: t("admin.resellers.dialog.agent"),
    agentNone: t("admin.resellers.dialog.agentNone"),
    statusTitleSuspend: t("admin.resellers.dialog.statusTitleSuspend", { name: resellerName }),
    statusTitleReactivate: t("admin.resellers.dialog.statusTitleReactivate", { name: resellerName }),
    statusNoteSuspend: t("admin.resellers.dialog.statusNoteSuspend"),
    statusNoteReactivate: t("admin.resellers.dialog.statusNoteReactivate"),
    attributionTitle: t("admin.resellers.dialog.attributionTitle", { name: resellerName }),
    attributionNote: t("admin.resellers.dialog.attributionNote"),
    impersonateTitle: t("admin.resellers.dialog.impersonateTitle", { name: resellerName }),
    impersonateNote: t("admin.resellers.dialog.impersonateNote"),
    confirm: t("admin.resellers.dialog.confirm"),
    cancel: t("admin.resellers.dialog.cancel"),
  };
}

/**
 * Agent counterpart. The wording that has to differ (suspend/impersonate) comes from
 * `admin.agents.dialog.*`; the shared reason-and-confirm chrome reuses the reseller keys.
 */
export function agentOperatorCopy(t: Translator, agentName: string): OperatorCopy {
  return {
    reason: t("admin.resellers.dialog.reason"),
    reasonHint: t("admin.resellers.dialog.reasonHint"),
    reasonPlaceholder: t("admin.resellers.dialog.reasonPlaceholder"),
    reasonTooShort: t("admin.resellers.dialog.reasonTooShort"),
    agent: t("admin.resellers.dialog.agent"),
    agentNone: t("admin.resellers.dialog.agentNone"),
    statusTitleSuspend: t("admin.agents.dialog.statusTitleSuspend", { name: agentName }),
    statusTitleReactivate: t("admin.agents.dialog.statusTitleReactivate", { name: agentName }),
    statusNoteSuspend: t("admin.agents.dialog.statusNoteSuspend"),
    statusNoteReactivate: t("admin.agents.dialog.statusNoteReactivate"),
    attributionTitle: t("admin.resellers.dialog.attributionTitle", { name: agentName }),
    attributionNote: t("admin.resellers.dialog.attributionNote"),
    impersonateTitle: t("admin.agents.dialog.impersonateTitle", { name: agentName }),
    impersonateNote: t("admin.agents.dialog.impersonateNote"),
    confirm: t("admin.resellers.dialog.confirm"),
    cancel: t("admin.resellers.dialog.cancel"),
  };
}
