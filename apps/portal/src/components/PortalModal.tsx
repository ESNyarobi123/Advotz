"use client";

import { useEffect, type ReactNode } from "react";
import type { PortalTheme } from "@advo/contracts";
import { useLocale } from "@/lib/portal";

/**
 * Shared dialog chrome for the connected-page modals (jobs, promotion,
 * support). Renders an overlay card, closes on Escape or a backdrop click, and
 * locks background scrolling while open.
 */
export function PortalModal({
  open,
  onClose,
  title,
  theme,
  children,
  size = "default",
  contained = false,
  system = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  theme?: PortalTheme;
  children: ReactNode;
  size?: "default" | "wide";
  /** Paint the card with the platform combo, ignoring a reseller theme. */
  system?: boolean;
  /**
   * Draw the dialog inside its parent instead of the browser window.
   * The design board uses this so several portal screens can sit open at once.
   */
  contained?: boolean;
}) {
  const { t } = useLocale();

  useEffect(() => {
    if (!open || contained) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose, contained]);

  if (!open) return null;

  return (
    <div
      aria-modal="true"
      className={`${contained ? "absolute overflow-y-auto" : "fixed"} inset-0 z-50 grid place-items-center bg-[#010c21]/70 p-4 backdrop-blur-sm`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <div
        className={`relative w-full overflow-y-auto p-5 shadow-2xl ${contained ? "max-h-full" : "max-h-[88vh]"}`}
        style={{
          background: system ? "var(--advo-card-brand)" : (theme?.surface ?? "#ffffff"),
          color: system ? "var(--advo-text-brand)" : (theme?.text ?? "#0f172a"),
          borderRadius: system ? 16 : (theme?.radius ?? 20),
          maxWidth: size === "wide" ? 440 : 390,
        }}
      >
        <button
          aria-label={t("portal.close")}
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-lg font-bold text-slate-500 transition hover:bg-black/5"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
        <h2 className="mb-3 pe-8 text-center text-xl font-black tracking-tight">{title}</h2>
        {children}
      </div>
    </div>
  );
}
