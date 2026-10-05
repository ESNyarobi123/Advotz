"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@heroui/react";
import { errorMessage } from "@/lib/api";

/** Advo action semantics mapped onto HeroUI button variants. */
const HEROUI_VARIANT = {
  primary: "primary",
  secondary: "outline",
  ghost: "ghost",
  danger: "danger-soft",
} as const;

/**
 * A button for an audited action. When `reasonPrompt` is set the user must type a reason
 * (sent to the API and recorded in the audit log) before anything is submitted.
 */
export function ActionButton({
  children,
  onRun,
  onDone,
  reasonPrompt,
  reasonError = "A reason of at least 3 characters is required.",
  confirm,
  variant = "secondary",
}: {
  children: ReactNode;
  onRun: (reason: string) => Promise<unknown>;
  onDone?: () => void | Promise<void>;
  reasonPrompt?: string;
  /** Message shown when the typed reason is too short; translated by the caller. */
  reasonError?: string;
  confirm?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function click() {
    let reason = "";
    if (reasonPrompt) {
      const answer = window.prompt(reasonPrompt);
      if (answer === null) return;
      reason = answer.trim();
      if (reason.length < 3) {
        setError(reasonError);
        return;
      }
    } else if (confirm && !window.confirm(confirm)) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onRun(reason);
      await onDone?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="inline-flex flex-col">
      <Button
        className="text-xs"
        isDisabled={pending}
        onPress={() => void click()}
        size="sm"
        type="button"
        variant={HEROUI_VARIANT[variant]}
      >
        {pending ? "…" : children}
      </Button>
      {error ? <span className="mt-1 max-w-56 text-xs text-[var(--advo-danger)]">{error}</span> : null}
    </span>
  );
}
