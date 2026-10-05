"use client";

import { useLocale } from "@/lib/portal";

export type PortalStage = 1 | 2 | 3;

/**
 * Three-dot progress rail that mirrors the Kimara journey (Connect → Choose &
 * pay → Go online). It is shared by the portal home and the payment/status
 * pages so a returning guest sees a consistent path.
 */
export function PortalStepper({ stage, onNavigate }: { stage: PortalStage; onNavigate?: (stage: PortalStage) => void }) {
  const { t } = useLocale();
  const labels = [t("portal.stage.connect"), t("portal.stage.choose"), t("portal.stage.connected")] as const;
  const progress = ((stage - 1) / 2) * 100;

  return (
    <div className="relative mb-5 flex items-center justify-between px-1" role="list">
      <span className="absolute left-[11px] right-[11px] top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-black/10" aria-hidden />
      <span
        className="absolute left-[11px] top-1/2 h-[3px] -translate-y-1/2 rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `calc((100% - 22px) * ${progress / 100})`, background: "var(--advo-brand-gradient)" }}
        aria-hidden
      />
      {([1, 2, 3] as const).map((n) => {
        const active = stage >= n;
        const clickable = Boolean(onNavigate) && n <= stage;
        return (
          <button
            aria-current={stage === n ? "step" : undefined}
            aria-label={t("portal.stepAria", { stage: n, label: labels[n - 1] })}
            className={`relative z-10 grid h-6 w-6 place-items-center rounded-full border-[3px] text-[10px] font-black transition ${
              active ? "text-white" : "border-black/10 bg-white text-black/40"
            } ${clickable ? "cursor-pointer" : "cursor-default"}`}
            disabled={!clickable}
            key={n}
            onClick={() => clickable && onNavigate?.(n)}
            style={active ? { borderColor: "var(--advo-blue)", background: "var(--advo-blue)" } : undefined}
            type="button"
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}
