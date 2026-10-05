"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button, Label, Modal, TextArea } from "@heroui/react";
import { useOverlayState } from "@heroui/react";
import { Notice } from "@advo/ui";
import { errorMessage } from "@/lib/api";

/** Labels are passed in so each screen keeps its own translated catalog keys. */
export type ReasonDialogLabels = {
  title: string;
  note?: ReactNode;
  reasonLabel: string;
  reasonPlaceholder?: string;
  reasonHint?: string;
  tooShort: string;
  cancel: string;
  confirm: string;
};

/**
 * Collects the mandatory reason behind an audited operator action.
 *
 * Shared by every screen that mutates money or configuration, so the validation, the
 * pending state and the error surface cannot drift between pages. The reason is never
 * sent as less than three characters — the API rejects shorter ones anyway, and failing
 * client-side keeps the user's place in the form.
 *
 * `open` is a plain boolean and the dialog stays mounted, so HeroUI can run its
 * enter/exit transition and reopening always starts from a clean slate.
 */
export function ReasonDialog({
  open,
  onClose,
  labels,
  summary,
  warning,
  tone = "primary",
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  labels: ReasonDialogLabels;
  /** Optional record preview shown above the reason field. */
  summary?: ReactNode;
  /** Optional caution rendered above the reason field, e.g. a side effect of the action. */
  warning?: ReactNode;
  /** `danger` colours the confirm button and is reserved for irreversible actions. */
  tone?: "primary" | "danger";
  /** Must throw to keep the dialog open; the thrown message is rendered inline. */
  onSubmit: (reason: string) => Promise<void>;
}) {
  const overlay = useOverlayState({ isOpen: open, onOpenChange: (next) => (!next ? onClose() : undefined) });
  const [reason, setReason] = useState("");
  const [tooShort, setTooShort] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Reopening must not show the previous attempt's text or error.
  useEffect(() => {
    if (open) {
      setReason("");
      setTooShort(false);
      setError(null);
    }
  }, [open]);

  async function submit() {
    if (reason.trim().length < 3) {
      setTooShort(true);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSubmit(reason.trim());
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal.Root state={overlay}>
      <Modal.Backdrop>
        <Modal.Container size="lg">
          <Modal.Dialog className="bg-white">
            <Modal.Header>
              <Modal.Heading className="text-base font-black text-advo-text">{labels.title}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                {labels.note ? <p className="text-xs text-advo-muted">{labels.note}</p> : null}
                {summary}
                {warning ? <Notice tone="warning">{warning}</Notice> : null}

                <div>
                  <Label htmlFor="reason-dialog-reason">
                    {labels.reasonLabel}
                    <span className="text-[var(--advo-danger)]"> *</span>
                  </Label>
                  <TextArea
                    id="reason-dialog-reason"
                    onChange={(e) => {
                      setReason(e.target.value);
                      if (tooShort && e.target.value.trim().length >= 3) setTooShort(false);
                    }}
                    placeholder={labels.reasonPlaceholder}
                    rows={3}
                    value={reason}
                  />
                  {labels.reasonHint ? <p className="mt-1 text-xs text-advo-muted">{labels.reasonHint}</p> : null}
                </div>

                {tooShort ? <Notice tone="danger">{labels.tooShort}</Notice> : null}
                {error ? <Notice tone="danger">{error}</Notice> : null}

                <div className="flex justify-end gap-2 border-t border-[var(--advo-border)] pt-4">
                  <Button isDisabled={pending} onPress={onClose} type="button" variant="outline">
                    {labels.cancel}
                  </Button>
                  <Button isDisabled={pending} type="submit" variant={tone === "danger" ? "danger-soft" : "primary"}>
                    {pending ? "…" : labels.confirm}
                  </Button>
                </div>
              </form>
            </Modal.Body>
            <Modal.CloseTrigger aria-label={labels.cancel} />
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}
