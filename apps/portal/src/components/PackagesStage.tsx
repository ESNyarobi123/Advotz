"use client";

import { useState } from "react";
import { Button, Card } from "@heroui/react";
import type { PortalTheme } from "@advo/contracts";
import { formatBytes, formatDuration, formatSpeed, formatTzs } from "@advo/api-client";
import { Notice } from "@advo/ui";
import { FieldInput } from "@/components/FieldInput";
import { primaryButton } from "@/lib/theme";
import type { PortalPackage } from "@/lib/portal-types";
import { useLocale } from "@/lib/portal";

const MONEY_OPTIONS = [
  { id: "mpesa", name: "M-Pesa", network: "Vodacom", tint: "#e60000" },
  { id: "airtel", name: "Airtel Money", network: "Airtel", tint: "#e30613" },
  { id: "mixx", name: "Mixx by Yas", network: "Yas", tint: "#0a4ea2" },
] as const;

/**
 * Best-effort mobile-network guess from a Tanzanian number's prefix.
 *
 * The payment provider only takes a phone number (there is no network field on
 * a mobile payment), so this highlights the matching button as a visual guide
 * rather than driving the payment itself.
 */
function detectNetwork(raw: string): (typeof MONEY_OPTIONS)[number] | null {
  const digits = raw.replace(/[^\d]/g, "").replace(/^255/, "0");
  const prefix = digits.startsWith("0") ? digits.slice(1, 3) : digits.slice(0, 2);
  if (!/^\d{2}$/.test(prefix)) return null;
  if (["75", "76", "74"].includes(prefix)) return MONEY_OPTIONS[0];
  if (["78", "68", "69", "67"].includes(prefix)) return MONEY_OPTIONS[1];
  if (["65", "71", "77"].includes(prefix)) return MONEY_OPTIONS[2];
  return null;
}

/**
 * Stage 2 — choose a package, see the selection summary and pay with mobile
 * money. The three money buttons mirror the simulator; the phone field is what
 * actually starts the payment.
 */
export function PackagesStage({
  packages,
  theme,
  disabled,
  pending,
  error,
  onBack,
  onSubmit,
}: {
  packages: PortalPackage[];
  theme?: PortalTheme;
  disabled: boolean;
  pending: boolean;
  error: string | null;
  onBack: () => void;
  onSubmit: (packageId: string, form: { phone: string; firstName: string; lastName: string; email: string }) => void;
}) {
  const { locale, t } = useLocale();
  const buy = primaryButton(theme);
  const [selectedId, setSelectedId] = useState(packages[0]?.packageId ?? "");
  const [phone, setPhone] = useState("");
  const [showPlans, setShowPlans] = useState(false);

  const selected = packages.find((p) => p.packageId === selectedId) ?? packages[0] ?? null;
  const detected = detectNetwork(phone);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    onSubmit(selected.packageId, {
      phone: String(form.get("phone") ?? ""),
      firstName: String(form.get("firstName") ?? ""),
      lastName: String(form.get("lastName") ?? ""),
      email: String(form.get("email") ?? ""),
    });
  }

  return (
    <section aria-label={t("portal.chooseTitle")} className="flex flex-1 flex-col">
      <p className="text-center text-[11px] font-black uppercase tracking-[0.13em]" style={{ color: "var(--advo-blue)" }}>
        {t("portal.stageLabel", { stage: 2, total: 3 })}
      </p>
      <h2 className="mt-1 text-center text-[1.75rem] font-black leading-tight tracking-tight" style={{ color: "var(--advo-text)" }}>
        {t("portal.chooseTitle")}
      </h2>
      <p className="mb-3 mt-1 text-center text-sm" style={{ color: "var(--advo-muted)" }}>
        {t("portal.chooseLead")}
      </p>

      {packages.length === 0 ? <Notice tone="accent">{t("noPackages")}</Notice> : null}

      <div className="space-y-2" role="radiogroup" aria-label={t("portal.chooseTitle")}>
        {packages.map((pkg) => {
          const active = selected?.packageId === pkg.packageId;
          return (
            <button
              aria-checked={active}
              className="flex w-full items-center justify-between gap-3 border-2 p-3 text-start transition"
              key={pkg.packageId}
              onClick={() => setSelectedId(pkg.packageId)}
              role="radio"
              style={{
                borderColor: active ? "var(--advo-blue)" : "transparent",
                background: "var(--advo-card)",
                borderRadius: theme?.radius ?? 16,
                boxShadow: active ? "0 6px 18px -12px var(--advo-blue)" : "0 1px 2px rgba(15,23,42,.06)",
              }}
              type="button"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold" style={{ color: "var(--advo-text)" }}>
                  {pkg.name}
                </span>
                <span className="mt-0.5 block text-[11px]" style={{ color: "var(--advo-muted)" }}>
                  {formatDuration(pkg.durationSeconds, locale)} ·{" "}
                  {pkg.quotaType === "UNLIMITED" ? t("unlimitedData") : formatBytes(pkg.quotaBytes)}
                  {pkg.downloadKbps ? ` · ${t("upTo")} ${formatSpeed(pkg.downloadKbps)}` : ""}
                </span>
              </span>
              <span
                className="shrink-0 whitespace-nowrap px-2 py-1 text-sm font-black text-white"
                style={{ background: "var(--advo-brand-gradient)", borderRadius: Math.min(theme?.radius ?? 12, 12) }}
              >
                {formatTzs(pkg.priceTzs)}
              </span>
            </button>
          );
        })}
      </div>

      {selected ? (
        <div
          className="mt-3 flex items-center justify-between gap-2 px-3 py-2 text-xs"
          style={{ background: "color-mix(in srgb, var(--advo-blue) 8%, transparent)", borderRadius: theme?.radius ?? 12 }}
        >
          <span style={{ color: "var(--advo-muted)" }}>{t("portal.yourSelection")}</span>
          <strong className="truncate" style={{ color: "var(--advo-text)" }}>
            {formatDuration(selected.durationSeconds, locale)} · {formatTzs(selected.priceTzs)}
          </strong>
        </div>
      ) : null}

      <button
        className="mt-2 self-start text-[11px] font-bold underline"
        onClick={() => setShowPlans((prev) => !prev)}
        style={{ color: "var(--advo-blue)" }}
        type="button"
      >
        {t("portal.monthlyPlans")}
      </button>
      {showPlans ? (
        <p className="mt-1 text-[11px]" style={{ color: "var(--advo-muted)" }}>
          {t("portal.monthlyPlansHint")}
        </p>
      ) : null}

      <h3 className="mb-2 mt-4 text-sm font-bold" style={{ color: "var(--advo-text)" }}>
        {t("portal.payWithMobileMoney")}
      </h3>
      <div className="grid grid-cols-3 gap-1.5">
        {MONEY_OPTIONS.map((option) => {
          const active = detected?.id === option.id;
          return (
            <div
              className="grid place-items-center gap-0.5 rounded-xl border p-2 text-center transition"
              key={option.id}
              style={{
                borderColor: active ? option.tint : "transparent",
                background: active ? `color-mix(in srgb, ${option.tint} 10%, transparent)` : "var(--advo-card)",
                boxShadow: active ? "0 4px 12px -8px rgba(0,0,0,.4)" : "0 1px 2px rgba(15,23,42,.06)",
              }}
            >
              <span className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-black text-white" style={{ background: option.tint }}>
                {option.name.charAt(0)}
              </span>
              <span className="text-[10px] font-bold leading-tight" style={{ color: "var(--advo-text)" }}>
                {option.name}
              </span>
              <span className="text-[9px]" style={{ color: "var(--advo-muted)" }}>
                {option.network}
              </span>
            </div>
          );
        })}
      </div>
      {detected ? (
        <p className="mt-1.5 text-[11px]" style={{ color: "var(--advo-muted)" }}>
          {t("portal.networkDetected", { network: detected.network })}
        </p>
      ) : null}

      <form className="mt-4 space-y-3" onSubmit={submit}>
        <FieldInput
          autoComplete="tel"
          id="phone"
          inputMode="tel"
          label={t("mobileMoneyNumber")}
          name="phone"
          onChange={(event) => setPhone(event.target.value)}
          placeholder="07XX XXX XXX"
          required
          value={phone}
        />
        <FieldInput autoComplete="given-name" id="firstName" label={t("firstName")} name="firstName" required />
        <FieldInput autoComplete="family-name" id="lastName" label={t("lastName")} name="lastName" required />
        <FieldInput autoComplete="email" id="email" label={t("receiptEmail")} name="email" required type="email" />
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button
          fullWidth
          isDisabled={pending || disabled || !selected}
          size="lg"
          style={{ ...buy.style, borderRadius: theme?.radius }}
          type="submit"
          variant={buy.variant}
        >
          {pending ? t("sending") : selected ? `${t("pay")} ${formatTzs(selected.priceTzs)}` : t("pay")}
        </Button>
        <Button fullWidth onPress={onBack} size="lg" type="button" variant="outline">
          {t("back")}
        </Button>
      </form>
    </section>
  );
}
