"use client";

/**
 * The two edit flows on the Admin resellers screen.
 *
 * `ResellerEditDialog` fixes the account itself — business identity and the
 * owner's contact details. `PlanEditDialog` fixes what the reseller is entitled
 * to: the platform plan, its state and period, and the per-reseller limit
 * override.
 *
 * They are separate dialogs rather than one form because they answer different
 * questions and have different risk: renaming a business is harmless and should
 * not require thinking about money, while shortening a subscription period
 * stops guest sales the moment it is saved.
 */

import { useState } from "react";
import { useOverlayState } from "@heroui/react";
import { Button, Input, Label, Modal, TextArea } from "@heroui/react";
import { AdvoSelect, Notice } from "@advo/ui";
import type { MessageKey } from "@advo/i18n";
import { Pencil, Save } from "lucide-react";
import { api } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

/** The subset of a reseller row both the list card and the detail page can supply. */
export type EditableReseller = {
  id: string;
  businessName: string;
  owner: {
    name: string;
    email: string;
    phone: string | null;
    emailVerifiedAt: string | null;
  };
};

/**
 * `YYYY-MM-DD` for an instant, read as a Dar es Salaam calendar day.
 *
 * A stored period end is the last millisecond of a local day (20:59:59.999Z), so
 * reading it in UTC would show the day before and an operator saving the form
 * unchanged would silently shorten the period by one day.
 */
function toCalendarDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return new Date(at.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}

/* ─────────────────────── Account details ─────────────────────── */

/**
 * Edits the business name and the owner's contact details.
 *
 * `onSaved` reloads whichever screen opened it, so the card and the hero both
 * reflect the change without a page refresh.
 */
export function ResellerEditDialog({
  reseller,
  onSaved,
  variant = "outline",
}: {
  reseller: EditableReseller;
  onSaved: () => void | Promise<void>;
  /** The hero wants an outline button; a card may want plain ghost. */
  variant?: "outline" | "ghost" | "primary";
}) {
  const { t } = useI18n();
  const overlay = useOverlayState();
  const [businessName, setBusinessName] = useState(reseller.businessName);
  const [ownerName, setOwnerName] = useState(reseller.owner.name);
  const [email, setEmail] = useState(reseller.owner.email);
  const [phone, setPhone] = useState(reseller.owner.phone ?? "");
  const [emailVerified, setEmailVerified] = useState(Boolean(reseller.owner.emailVerifiedAt));
  const [reason, setReason] = useState("");
  const [tooShort, setTooShort] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = useAction(
    async (payload: Record<string, unknown>) => {
      const result = await api.put(`/admin/resellers/${reseller.id}`, payload);
      setSaved(true);
      await onSaved();
      return result;
    },
  );

  /**
   * Seeds the form from the record every time the dialog opens.
   *
   * This runs on open rather than in an effect on props: the parent reloads the
   * record after a save, so an effect keyed on it would wipe the success notice
   * the moment it appeared. It also means one dialog can be reused across rows
   * without a previous subject's phone number ever leaking in.
   */
  function seed() {
    setBusinessName(reseller.businessName);
    setOwnerName(reseller.owner.name);
    setEmail(reseller.owner.email);
    setPhone(reseller.owner.phone ?? "");
    setEmailVerified(Boolean(reseller.owner.emailVerifiedAt));
    setReason("");
    setTooShort(false);
    setSaved(false);
    save.setError(null);
  }

  function submit() {
    if (reason.trim().length < 3) {
      setTooShort(true);
      return;
    }
    setTooShort(false);
    void save.run({
      businessName: businessName.trim(),
      ownerName: ownerName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      emailVerified,
      reason: reason.trim(),
    });
  }

  return (
    <>
      <Button
        isDisabled={save.pending}
        onPress={() => {
          seed();
          overlay.open();
        }}
        size="sm"
        type="button"
        variant={variant}
      >
        <Pencil className="size-3.5" />
        {t("admin.resellers.action.edit")}
      </Button>

      <Modal.Root state={overlay}>
        <Modal.Backdrop>
          <Modal.Container size="lg">
            <Modal.Dialog className="bg-white">
              <Modal.Header>
                <Modal.Heading className="text-base font-black text-advo-text">
                  {t("admin.resellers.edit.title")}
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                  }}
                >
                  <p className="text-xs text-advo-muted">{t("admin.resellers.edit.description")}</p>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="reseller-edit-business">{t("admin.resellers.edit.businessName")}</Label>
                      <Input
                        id="reseller-edit-business"
                        onChange={(e) => setBusinessName(e.target.value)}
                        value={businessName}
                      />
                    </div>
                    <div>
                      <Label htmlFor="reseller-edit-owner">{t("admin.resellers.edit.ownerName")}</Label>
                      <Input id="reseller-edit-owner" onChange={(e) => setOwnerName(e.target.value)} value={ownerName} />
                    </div>
                    <div>
                      <Label htmlFor="reseller-edit-email">{t("admin.resellers.edit.email")}</Label>
                      <Input
                        id="reseller-edit-email"
                        onChange={(e) => setEmail(e.target.value)}
                        type="email"
                        value={email}
                      />
                    </div>
                    <div>
                      <Label htmlFor="reseller-edit-phone">{t("admin.resellers.edit.phone")}</Label>
                      <Input
                        id="reseller-edit-phone"
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="0712 345 678"
                        value={phone}
                      />
                      <p className="mt-1 text-xs text-advo-muted">{t("admin.resellers.edit.phoneHint")}</p>
                    </div>
                  </div>

                  <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-advo-surface-soft p-3">
                    <input
                      checked={emailVerified}
                      className="mt-0.5 size-4 accent-advo-blue"
                      onChange={(e) => setEmailVerified(e.target.checked)}
                      type="checkbox"
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-advo-text">
                        {t("admin.resellers.edit.emailVerified")}
                      </span>
                      <span className="block text-[11px] text-advo-muted">
                        {t("admin.resellers.edit.emailVerifiedHint")}
                      </span>
                    </span>
                  </label>

                  <div>
                    <Label htmlFor="reseller-edit-reason">
                      {t("admin.resellers.dialog.reason")}
                      <span className="text-[var(--advo-danger)]"> *</span>
                    </Label>
                    <TextArea
                      id="reseller-edit-reason"
                      onChange={(e) => {
                        setReason(e.target.value);
                        if (tooShort && e.target.value.trim().length >= 3) setTooShort(false);
                      }}
                      placeholder={t("admin.resellers.edit.reasonPlaceholder")}
                      rows={2}
                      value={reason}
                    />
                    <p className="mt-1 text-xs text-advo-muted">{t("admin.resellers.dialog.reasonHint")}</p>
                  </div>

                  {tooShort ? <Notice tone="danger">{t("admin.resellers.dialog.reasonTooShort")}</Notice> : null}
                  {save.error ? <Notice tone="danger">{save.error}</Notice> : null}
                  {saved && !save.error ? <Notice tone="success">{t("admin.resellers.edit.success")}</Notice> : null}

                  <div className="flex justify-end gap-2 border-t border-[var(--advo-border)] pt-4">
                    <Button isDisabled={save.pending} onPress={overlay.close} type="button" variant="outline">
                      {t("admin.resellers.edit.close")}
                    </Button>
                    <Button isDisabled={save.pending} type="submit" variant="primary">
                      <Save className="size-4" />
                      {save.pending ? t("admin.resellers.edit.saving") : t("admin.resellers.edit.save")}
                    </Button>
                  </div>
                </form>
              </Modal.Body>
              <Modal.CloseTrigger aria-label={t("admin.resellers.edit.close")} />
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>
    </>
  );
}

/* ─────────────────────── Platform plan ─────────────────────── */

/** Row shape of `GET /admin/plans` — only the fields the picker reads. */
export type PlanOption = {
  id: string;
  code: string;
  version: number;
  name: string;
  priceTzs: string;
  periodDays: number;
  lifecycle: string;
  active: boolean;
};

export type EditableSubscription = {
  state: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialUsedAt?: string | null;
  suspendedReason: string | null;
  planId: string | null;
  entitlements: {
    maxSites?: number | null;
    maxDevices?: number | null;
    maxPackagesPerSite?: number | null;
  } | null;
};

const STATE_VALUES = ["NONE", "TRIALING", "ACTIVE", "PAST_DUE", "EXPIRED", "SUSPENDED", "CANCELLED"] as const;

/**
 * State labels are spelled out as literal keys rather than built from the value,
 * so the translator stays fully typed and a renamed state fails the build instead
 * of rendering a raw key to an operator.
 */
const STATE_LABEL: Record<(typeof STATE_VALUES)[number], MessageKey> = {
  NONE: "admin.resellers.state.NONE",
  TRIALING: "admin.resellers.state.TRIALING",
  ACTIVE: "admin.resellers.state.ACTIVE",
  PAST_DUE: "admin.resellers.state.PAST_DUE",
  EXPIRED: "admin.resellers.state.EXPIRED",
  SUSPENDED: "admin.resellers.state.SUSPENDED",
  CANCELLED: "admin.resellers.state.CANCELLED",
};

/** Empty input means "follow the plan again", which the API models as `null`. */
const numberOrNull = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/**
 * Moves a reseller onto another platform plan, or corrects the plan it is on.
 *
 * The form is pre-filled from what is stored, because "update" here most often
 * means extending a period or fixing a state, not swapping the plan. Limits start
 * blank so the plan's own caps stay authoritative unless an operator types over
 * them.
 */
export function PlanEditDialog({
  resellerId,
  subscription,
  plans,
  onSaved,
}: {
  resellerId: string;
  subscription: EditableSubscription | null;
  plans: PlanOption[];
  onSaved: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const overlay = useOverlayState();
  const [planId, setPlanId] = useState(subscription?.planId ?? "");
  const [state, setState] = useState(subscription?.state ?? "NONE");
  const [periodStart, setPeriodStart] = useState(toCalendarDay(subscription?.currentPeriodStart));
  const [periodEnd, setPeriodEnd] = useState(toCalendarDay(subscription?.currentPeriodEnd));
  const [trialUsed, setTrialUsed] = useState(Boolean(subscription?.trialUsedAt));
  const [suspendedReason, setSuspendedReason] = useState(subscription?.suspendedReason ?? "");
  // Blank means "no override". The stored entitlements are deliberately not
  // pre-filled: they are the plan's own numbers, and showing them here would make
  // every save look like a manual override.
  const [maxSites, setMaxSites] = useState("");
  const [maxDevices, setMaxDevices] = useState("");
  const [maxPackages, setMaxPackages] = useState("");
  const [reason, setReason] = useState("");
  const [tooShort, setTooShort] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = useAction(
    async (payload: Record<string, unknown>) => {
      await api.put(`/admin/resellers/${resellerId}/subscription`, payload);
      setSaved(true);
      await onSaved();
    },
  );

  /**
   * Pre-fills from the stored subscription on open.
   *
   * The parent passes a fresh object on every reload, so an effect keyed on it
   * would re-seed the form — and clear the success notice — right after a save.
   */
  function seed() {
    setPlanId(subscription?.planId ?? "");
    setState(subscription?.state ?? "NONE");
    setPeriodStart(toCalendarDay(subscription?.currentPeriodStart));
    setPeriodEnd(toCalendarDay(subscription?.currentPeriodEnd));
    setTrialUsed(Boolean(subscription?.trialUsedAt));
    setSuspendedReason(subscription?.suspendedReason ?? "");
    setMaxSites("");
    setMaxDevices("");
    setMaxPackages("");
    setReason("");
    setTooShort(false);
    setSaved(false);
    save.setError(null);
  }

  // A plan that is no longer sellable can still be attached to somebody. Dropping
  // it from the list would make the current value unselectable and quietly move
  // the reseller to the first option on the next save.
  const options = plans.filter(
    (plan) => (plan.active && plan.lifecycle === "PUBLISHED") || plan.id === subscription?.planId,
  );

  function submit() {
    if (reason.trim().length < 3) {
      setTooShort(true);
      return;
    }
    setTooShort(false);
    void save.run({
      planId: planId || null,
      state,
      currentPeriodStart: periodStart || null,
      currentPeriodEnd: periodEnd || null,
      trialUsed,
      suspendedReason: suspendedReason.trim() || null,
      limits: {
        maxSites: numberOrNull(maxSites),
        maxDevices: numberOrNull(maxDevices),
        maxPackagesPerSite: numberOrNull(maxPackages),
      },
      reason: reason.trim(),
    });
  }

  return (
    <>
      <Button
        isDisabled={save.pending}
        onPress={() => {
          seed();
          overlay.open();
        }}
        size="sm"
        type="button"
        variant="primary"
      >
        <Pencil className="size-3.5" />
        {t("admin.resellers.planEdit.action")}
      </Button>

      <Modal.Root state={overlay}>
        <Modal.Backdrop>
          <Modal.Container size="lg">
            <Modal.Dialog className="bg-white">
              <Modal.Header>
                <Modal.Heading className="text-base font-black text-advo-text">
                  {t("admin.resellers.planEdit.title")}
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                  }}
                >
                  <p className="text-xs text-advo-muted">{t("admin.resellers.planEdit.description")}</p>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label htmlFor="plan-edit-plan">{t("admin.resellers.planEdit.plan")}</Label>
                      <AdvoSelect
                        id="plan-edit-plan"
                        onChange={(e) => setPlanId(e.target.value)}
                        value={planId}
                      >
                        <option value="">{t("admin.resellers.planEdit.planNone")}</option>
                        {options.map((plan) => (
                          <option key={plan.id} value={plan.id}>
                            {plan.name} v{plan.version} · {plan.periodDays}d
                            {plan.active && plan.lifecycle === "PUBLISHED" ? "" : ` (${plan.lifecycle})`}
                          </option>
                        ))}
                      </AdvoSelect>
                      <p className="mt-1 text-xs text-advo-muted">{t("admin.resellers.planEdit.planHint")}</p>
                    </div>

                    <div>
                      <Label htmlFor="plan-edit-state">{t("admin.resellers.planEdit.state")}</Label>
                      <AdvoSelect id="plan-edit-state" onChange={(e) => setState(e.target.value)} value={state}>
                        {STATE_VALUES.map((value) => (
                          <option key={value} value={value}>
                            {t(STATE_LABEL[value])}
                          </option>
                        ))}
                      </AdvoSelect>
                      <p className="mt-1 text-xs text-advo-muted">{t("admin.resellers.planEdit.stateHint")}</p>
                    </div>

                    <div>
                      <Label htmlFor="plan-edit-suspended">{t("admin.resellers.planEdit.suspendedReason")}</Label>
                      <Input
                        id="plan-edit-suspended"
                        onChange={(e) => setSuspendedReason(e.target.value)}
                        placeholder={t("admin.resellers.planEdit.suspendedReasonPlaceholder")}
                        value={suspendedReason}
                      />
                    </div>

                    <div>
                      <Label htmlFor="plan-edit-start">{t("admin.resellers.planEdit.periodStart")}</Label>
                      <Input
                        id="plan-edit-start"
                        onChange={(e) => setPeriodStart(e.target.value)}
                        type="date"
                        value={periodStart}
                      />
                    </div>
                    <div>
                      <Label htmlFor="plan-edit-end">{t("admin.resellers.planEdit.periodEnd")}</Label>
                      <Input
                        id="plan-edit-end"
                        onChange={(e) => setPeriodEnd(e.target.value)}
                        type="date"
                        value={periodEnd}
                      />
                    </div>
                  </div>

                  <p className="text-[11px] text-advo-muted">{t("admin.resellers.planEdit.periodHint")}</p>

                  <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-advo-surface-soft p-3">
                    <input
                      checked={trialUsed}
                      className="mt-0.5 size-4 accent-advo-blue"
                      onChange={(e) => setTrialUsed(e.target.checked)}
                      type="checkbox"
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-advo-text">
                        {t("admin.resellers.planEdit.trialUsed")}
                      </span>
                      <span className="block text-[11px] text-advo-muted">
                        {t("admin.resellers.planEdit.trialUsedHint")}
                      </span>
                    </span>
                  </label>

                  <div className="rounded-xl border border-[var(--advo-border)] p-3">
                    <p className="text-xs font-bold text-advo-text">{t("admin.resellers.planEdit.overrides")}</p>
                    <p className="mt-0.5 mb-3 text-[11px] text-advo-muted">
                      {t("admin.resellers.planEdit.overridesHint")}
                    </p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <Label htmlFor="plan-edit-max-sites">{t("admin.resellers.plan.maxSites")}</Label>
                        <Input
                          id="plan-edit-max-sites"
                          min={1}
                          onChange={(e) => setMaxSites(e.target.value)}
                          placeholder={t("admin.resellers.planEdit.overridePlaceholder")}
                          type="number"
                          value={maxSites}
                        />
                      </div>
                      <div>
                        <Label htmlFor="plan-edit-max-devices">{t("admin.resellers.plan.maxDevices")}</Label>
                        <Input
                          id="plan-edit-max-devices"
                          min={1}
                          onChange={(e) => setMaxDevices(e.target.value)}
                          placeholder={t("admin.resellers.planEdit.overridePlaceholder")}
                          type="number"
                          value={maxDevices}
                        />
                      </div>
                      <div>
                        <Label htmlFor="plan-edit-max-packages">{t("admin.resellers.plan.maxPackages")}</Label>
                        <Input
                          id="plan-edit-max-packages"
                          min={1}
                          onChange={(e) => setMaxPackages(e.target.value)}
                          placeholder={t("admin.resellers.planEdit.overridePlaceholder")}
                          type="number"
                          value={maxPackages}
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="plan-edit-reason">
                      {t("admin.resellers.dialog.reason")}
                      <span className="text-[var(--advo-danger)]"> *</span>
                    </Label>
                    <TextArea
                      id="plan-edit-reason"
                      onChange={(e) => {
                        setReason(e.target.value);
                        if (tooShort && e.target.value.trim().length >= 3) setTooShort(false);
                      }}
                      placeholder={t("admin.resellers.planEdit.reasonPlaceholder")}
                      rows={2}
                      value={reason}
                    />
                    <p className="mt-1 text-xs text-advo-muted">{t("admin.resellers.dialog.reasonHint")}</p>
                  </div>

                  {tooShort ? <Notice tone="danger">{t("admin.resellers.dialog.reasonTooShort")}</Notice> : null}
                  {save.error ? <Notice tone="danger">{save.error}</Notice> : null}
                  {saved && !save.error ? (
                    <Notice tone="success">{t("admin.resellers.planEdit.success")}</Notice>
                  ) : null}

                  <div className="flex justify-end gap-2 border-t border-[var(--advo-border)] pt-4">
                    <Button isDisabled={save.pending} onPress={overlay.close} type="button" variant="outline">
                      {t("admin.resellers.planEdit.close")}
                    </Button>
                    <Button isDisabled={save.pending} type="submit" variant="primary">
                      <Save className="size-4" />
                      {save.pending ? t("admin.resellers.planEdit.saving") : t("admin.resellers.planEdit.save")}
                    </Button>
                  </div>
                </form>
              </Modal.Body>
              <Modal.CloseTrigger aria-label={t("admin.resellers.planEdit.close")} />
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>
    </>
  );
}
