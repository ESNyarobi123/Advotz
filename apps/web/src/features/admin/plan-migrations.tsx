"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDateTime } from "@advo/api-client";
import {
  PLAN_MIGRATION_SCOPES,
  type PlanMigrationInput,
  type PlanMigrationScope,
  type PlanMigrationTarget,
  type PlanMigrationView,
} from "@advo/contracts";
import { useOverlayState } from "@heroui/react";
import { Button, Modal } from "@heroui/react";
import { Notice, StatusChip } from "@advo/ui";
import { ArrowRight, CalendarClock, Check, Rocket, TriangleAlert, Users, X } from "lucide-react";
import { Field } from "@/features/common/components";
import { api } from "@/lib/api";
import { useAction, useResource } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

/**
 * Plan version migrations.
 *
 * The screen exists because publishing is deliberately not enough: a published
 * version changes what is *sold*, and moving the people already paying is a
 * separate decision with a scope, a date and an audit trail. Everything here is
 * built to make that decision visible — the preview lists every old → new pair
 * before anything is recorded, and it comes from the same resolver the apply
 * path uses, so what the admin approves is what runs.
 */

/** Static labels keep the translator call fully typed instead of built from a template. */
const SCOPE_LABEL = {
  NEW_ONLY: "admin.plans.migration.scope.NEW_ONLY",
  ON_RENEWAL: "admin.plans.migration.scope.ON_RENEWAL",
  SELECTED: "admin.plans.migration.scope.SELECTED",
  ALL: "admin.plans.migration.scope.ALL",
} as const satisfies Record<PlanMigrationScope, string>;

/** Hint keys are the same union with a `.hint` suffix. */
const SCOPE_HINT = {
  NEW_ONLY: "admin.plans.migration.scope.NEW_ONLY.hint",
  ON_RENEWAL: "admin.plans.migration.scope.ON_RENEWAL.hint",
  SELECTED: "admin.plans.migration.scope.SELECTED.hint",
  ALL: "admin.plans.migration.scope.ALL.hint",
} as const;

type ResellerOption = { id: string; businessName: string };

/** Static labels keep the translator call fully typed instead of built from a template. */
const STATUS_LABEL = {
  SCHEDULED: "admin.plans.migration.status.SCHEDULED",
  PARTIAL: "admin.plans.migration.status.PARTIAL",
  APPLIED: "admin.plans.migration.status.APPLIED",
  CANCELLED: "admin.plans.migration.status.CANCELLED",
} as const;

/** `<input type="datetime-local">` value for an instant, in the browser's own zone. */
function localDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function PlanMigrationModal({
  open,
  planId,
  planLabel,
  onClose,
  onScheduled,
}: {
  open: boolean;
  /** The published version subscriptions move *to*. */
  planId: string | null;
  planLabel: string;
  onClose: () => void;
  onScheduled: (message: string) => void;
}) {
  const { t } = useI18n();
  const overlay = useOverlayState({ isOpen: open, onOpenChange: (next) => (!next ? onClose() : undefined) });
  const resellers = useResource<ResellerOption[]>(open ? "/admin/resellers" : null);
  const [scope, setScope] = useState<PlanMigrationScope>("ON_RENEWAL");
  const [effectiveAt, setEffectiveAt] = useState(() => localDatetimeValue(new Date()));
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<PlanMigrationTarget[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const schedule = useAction(async (payload: PlanMigrationInput) => api.post<PlanMigrationView>("/admin/plans/migrations", payload));

  // Always something previewable: an untouched date field must not disable the dialog.
  const effectiveDate = useMemo(() => {
    const parsed = new Date(effectiveAt);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [effectiveAt]);

  const input = useMemo<PlanMigrationInput | null>(
    () =>
      planId && effectiveDate
        ? { planId, scope, effectiveAt: effectiveDate, resellerIds: scope === "SELECTED" ? selected : [], note }
        : null,
    [planId, scope, effectiveDate, selected, note],
  );

  // Re-preview whenever the decision changes, so the count is never stale.
  useEffect(() => {
    if (!open || !input) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewing(true);
    setPreviewError(null);
    api
      .post<{ targets: PlanMigrationTarget[] }>("/admin/plans/migrations/preview", input)
      .then((res) => {
        if (!cancelled) setPreview(res.targets);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPreview(null);
          setPreviewError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, input]);

  const blocked = !input || (scope === "SELECTED" && selected.length === 0);

  async function submit() {
    if (!input) return;
    const result = await schedule.run(input);
    if (!result) return;
    onScheduled(t("admin.plans.migration.scheduled", { count: result.targets.length }));
    onClose();
  }

  return (
    <Modal.Root state={overlay}>
      <Modal.Backdrop>
        <Modal.Container scroll="inside" size="lg">
          <Modal.Dialog className="bg-white">
            <Modal.Header>
              <Modal.Heading className="text-base font-black text-advo-text">
                {t("admin.plans.migration.title", { plan: planLabel })}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="space-y-4">
              <p className="text-xs text-advo-muted">{t("admin.plans.migration.lead")}</p>

              <div className="space-y-1.5">
                <p className="text-[10px] font-bold tracking-wider text-advo-muted uppercase">
                  {t("admin.plans.migration.scopeLabel")}
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {PLAN_MIGRATION_SCOPES.map((key) => (
                    <button
                      aria-pressed={scope === key}
                      className={`rounded-xl border px-3 py-2.5 text-left transition ${
                        scope === key
                          ? "border-advo-blue bg-advo-blue-soft"
                          : "border-[var(--advo-border)] bg-white hover:border-advo-blue/40"
                      }`}
                      key={key}
                      onClick={() => setScope(key)}
                      type="button"
                    >
                      <span className="block text-xs font-bold text-advo-text">{t(SCOPE_LABEL[key])}</span>
                      <span className="mt-0.5 block text-[11px] text-advo-muted">{t(SCOPE_HINT[key])}</span>
                    </button>
                  ))}
                </div>
              </div>

              {scope === "SELECTED" ? (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold tracking-wider text-advo-muted uppercase">
                    {t("admin.plans.migration.selectResellers")}
                  </p>
                  <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-xl border border-[var(--advo-border)] p-2">
                    {(resellers.data ?? []).map((reseller) => (
                      <label
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-advo-surface-soft"
                        key={reseller.id}
                      >
                        <input
                          checked={selected.includes(reseller.id)}
                          className="size-3.5 accent-[var(--advo-blue)]"
                          onChange={(e) =>
                            setSelected((prev) =>
                              e.target.checked ? [...prev, reseller.id] : prev.filter((id) => id !== reseller.id),
                            )
                          }
                          type="checkbox"
                        />
                        <span className="truncate text-advo-text">{reseller.businessName}</span>
                      </label>
                    ))}
                    {resellers.data?.length === 0 ? (
                      <p className="px-2 py-1.5 text-[11px] text-advo-muted">{t("admin.plans.migration.noResellers")}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  hint={t("admin.plans.migration.effectiveAtHint")}
                  label={t("admin.plans.migration.effectiveAt")}
                  name="effectiveAt"
                  onChange={(e) => setEffectiveAt(e.target.value)}
                  type="datetime-local"
                  value={effectiveAt}
                />
                <Field
                  hint={t("admin.plans.migration.noteHint")}
                  label={t("admin.plans.migration.note")}
                  maxLength={240}
                  name="note"
                  onChange={(e) => setNote(e.target.value)}
                  value={note}
                />
              </div>

              {/* The old → new list the admin is approving. */}
              <div className="rounded-xl border border-[var(--advo-border)] bg-advo-surface-soft/50 p-3">
                <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-advo-muted uppercase">
                  <Users className="size-3" />
                  {t("admin.plans.migration.previewTitle")}
                  {preview ? <span className="tabular-nums">· {preview.length}</span> : null}
                </p>
                {previewError ? (
                  <p className="mt-2 flex items-start gap-1.5 text-[11px] font-semibold text-[#b91c1c]">
                    <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                    {previewError}
                  </p>
                ) : previewing && !preview ? (
                  <p className="mt-2 text-[11px] text-advo-muted">{t("admin.plans.migration.previewLoading")}</p>
                ) : preview && preview.length === 0 ? (
                  <p className="mt-2 text-[11px] text-advo-muted">
                    {scope === "NEW_ONLY" ? t("admin.plans.migration.previewNewOnly") : t("admin.plans.migration.previewEmpty")}
                  </p>
                ) : preview ? (
                  <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                    {preview.slice(0, 100).map((target) => (
                      <li className="flex items-center gap-2 text-[11px] text-advo-text" key={target.resellerId}>
                        <span className="min-w-0 flex-1 truncate font-semibold">{target.businessName}</span>
                        <span className="shrink-0 font-mono text-advo-muted">
                          {target.from ? `${target.from.code} v${target.from.version}` : t("admin.plans.migration.noPlan")}
                        </span>
                        <ArrowRight className="size-3 shrink-0 text-advo-muted" />
                        <span className="shrink-0 font-mono font-bold text-advo-blue">
                          {target.to.code} v{target.to.version}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              {schedule.error ? <Notice tone="danger">{schedule.error}</Notice> : null}

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--advo-border)] pt-4">
                <Button onPress={onClose} type="button" variant="ghost">
                  {t("admin.plans.migration.cancel")}
                </Button>
                <Button isDisabled={blocked || schedule.pending} onPress={() => void submit()} type="button" variant="primary">
                  <Rocket className="size-3.5" />
                  {schedule.pending ? t("admin.plans.migration.scheduling") : t("admin.plans.migration.schedule")}
                </Button>
              </div>
            </Modal.Body>
            <Modal.CloseTrigger aria-label={t("admin.plans.migration.cancel")} />
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}

/**
 * Every migration recorded for one plan code, newest first.
 *
 * A `PARTIAL` row is the interesting one: an `ON_RENEWAL` migration that has moved
 * some subscribers and is waiting for the remaining periods to end.
 */
export function PlanMigrationList({ planId }: { planId: string }) {
  const { t } = useI18n();
  const migrations = useResource<PlanMigrationView[]>(`/admin/plans/migrations?planId=${encodeURIComponent(planId)}`);
  const apply = useAction(async (id: string) => api.post<PlanMigrationView>(`/admin/plans/migrations/${encodeURIComponent(id)}/apply`, {}));
  const cancel = useAction(async (id: string) =>
    api.post<PlanMigrationView>(`/admin/plans/migrations/${encodeURIComponent(id)}/cancel`, {
      reason: "Cancelled from the plans screen",
    }),
  );

  const rows = migrations.data ?? [];
  if (rows.length === 0) return null;
  const busy = apply.pending || cancel.pending;

  return (
    <div className="border-t border-[var(--advo-border)] pt-3">
      <p className="flex items-center gap-1.5 text-[11px] font-bold text-advo-muted">
        <CalendarClock className="size-3.5" />
        {t("admin.plans.migration.historyTitle")}
        <span className="rounded-full bg-advo-surface-soft px-1.5 py-0.5 tabular-nums">{rows.length}</span>
      </p>
      <ul className="mt-2 space-y-1.5">
        {rows.slice(0, 5).map((migration) => (
          <li
            className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-[var(--advo-border)] bg-white px-2.5 py-2 text-[11px]"
            key={migration.id}
          >
            <StatusChip
              tone={
                migration.status === "APPLIED"
                  ? "success"
                  : migration.status === "CANCELLED"
                    ? "default"
                    : migration.status === "PARTIAL"
                      ? "warning"
                      : "accent"
              }
            >
              {t(STATUS_LABEL[migration.status])}
            </StatusChip>
            <span className="font-semibold text-advo-text">{t(SCOPE_LABEL[migration.scope])}</span>
            <span className="text-advo-muted">
              {t("admin.plans.migration.progress", { applied: migration.appliedCount, total: migration.targets.length })}
            </span>
            <span className="inline-flex items-center gap-1 text-advo-muted">
              <CalendarClock className="size-3" />
              {formatDateTime(migration.effectiveAt)}
            </span>
            {migration.status === "APPLIED" || migration.status === "CANCELLED" ? (
              <span className="ml-auto inline-flex items-center gap-1 text-advo-muted">
                {migration.status === "APPLIED" ? <Check className="size-3 text-emerald-700" /> : <X className="size-3" />}
              </span>
            ) : (
              <span className="ml-auto flex items-center gap-1.5">
                <Button
                  isDisabled={busy}
                  onPress={() => void apply.run(migration.id).then(() => migrations.reload())}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {t("admin.plans.migration.applyNow")}
                </Button>
                <Button
                  isDisabled={busy}
                  onPress={() => void cancel.run(migration.id).then(() => migrations.reload())}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {t("admin.plans.migration.stop")}
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {apply.error ?? cancel.error ? <Notice tone="danger">{apply.error ?? cancel.error}</Notice> : null}
    </div>
  );
}
