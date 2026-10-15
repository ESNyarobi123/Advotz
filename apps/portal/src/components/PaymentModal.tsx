"use client";

import { useState } from "react";
import {
  formatBytes,
  formatDuration,
  formatSpeed,
  formatTzs,
} from "@advo/api-client";
import { Notice } from "@advo/ui";
import { FieldInput } from "@/components/FieldInput";
import { PortalModal } from "@/components/PortalModal";
import { MONEY_OPTIONS, detectNetwork } from "@/lib/money";
import { useLocale } from "@/lib/portal";
import { systemActionClass, systemActionStyle } from "@/lib/theme";
import type { PortalPackage, PortalTheme } from "@/lib/portal-types";

/**
 * Why the dialog cannot start an order, if it cannot.
 *
 * A boolean lost the distinction that matters: a guest on the WiFi with no
 * context is being told where to go, while a reseller looking around their own
 * preview is being told nothing is wrong at all. Both used to render the same
 * "connect to this WiFi network" line, which is nonsense inside a preview of a
 * page the reseller is not connected to.
 *
 * - `no-context` — no WiFi context yet, so there is nothing to attach an order to.
 * - `preview`    — the designer's embed. The dialog is real, the Pay button is
 *                  off, and the explanation lives in the designer panel outside
 *                  the phone so this dialog stays indistinguishable from the real
 *                  one a guest sees.
 */
export type PayBlock = "none" | "no-context" | "preview";

/**
 * What the dialog sends to start an order.
 *
 * A phone number is the whole form. A device is authorized by RADIUS, not by an
 * account, so there is no name or email for us to hold — and asking for them was
 * friction on the one screen that has to convert. The payer's real name arrives
 * with the payment from the mobile-money provider instead, and fills the
 * reseller's customer list from there.
 */
export type PayerForm = {
  phone: string;
};

/**
 * The mobile-money dialog, opened by tapping a package.
 *
 * The payment step used to be a block of fields sitting permanently under the
 * package list. That made the landing screen read as a form with a price list
 * above it, and it pushed the second row of packages below the fold on a phone
 * — the guest had to scroll past a checkout they had not chosen to reach the
 * last package. The order is now: see prices, tap one, then pay for it.
 *
 * Within the dialog the columns are deliberate. The package the guest is about
 * to buy comes first and at full weight, because "which package is this?"
 * is the question they are answering when they tap. The number comes next,
 * because it is the only field that decides anything: the network chips below
 * it light up from its prefix as it is typed, and submitting sends the push to
 * that wallet.
 */
export function PaymentModal({
  pkg,
  theme,
  blocked,
  pending,
  error,
  onClose,
  onSubmit,
  contained = false,
}: {
  /** The package being bought. The caller mounts this only while one is chosen. */
  pkg: PortalPackage;
  theme?: PortalTheme;
  /** Why an order cannot be started here; `none` means the guest can pay. */
  blocked: PayBlock;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (packageId: string, form: PayerForm) => void;
  /** Keep the dialog inside a design-board phone instead of the browser window. */
  contained?: boolean;
}) {
  const { locale, t } = useLocale();
  const [phone, setPhone] = useState("");

  const detected = detectNetwork(phone);
  const unlimited = pkg.quotaType === "UNLIMITED";

  // The same facts the card showed, restated where the guest commits to them.
  const summary = [
    formatDuration(pkg.durationSeconds, locale),
    pkg.downloadKbps ? formatSpeed(pkg.downloadKbps) : null,
    unlimited
      ? t("unlimitedData")
      : pkg.quotaBytes
        ? formatBytes(pkg.quotaBytes)
        : null,
    pkg.maxDevices > 0
      ? t(
          pkg.maxDevices === 1
            ? "portal.card.deviceOne"
            : "portal.card.deviceMany",
          { count: pkg.maxDevices },
        )
      : null,
  ].filter((line): line is string => Boolean(line));

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit(pkg.packageId, {
      phone: String(form.get("phone") ?? ""),
    });
  }

  return (
    <PortalModal
      contained={contained}
      onClose={onClose}
      open
      system
      theme={theme}
      title={t("portal.payTitle")}
    >
      <form className="space-y-3" onSubmit={submit}>
        <div
          className="rounded-2xl border p-3"
          style={{
            borderColor: "color-mix(in srgb, var(--advo-orange) 28%, transparent)",
            background: "color-mix(in srgb, var(--advo-gold) 12%, white)",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p
                className="text-[10px] font-bold uppercase tracking-[0.1em]"
                style={{ color: "var(--advo-muted)" }}
              >
                {t("portal.youAreBuying")}
              </p>
              <p
                className="truncate text-base font-black leading-tight"
                style={{ color: "var(--advo-text)" }}
              >
                {pkg.name}
              </p>
            </div>
            <strong
              className="shrink-0 text-lg font-black tabular-nums"
              style={{ color: "var(--advo-orange)" }}
            >
              {formatTzs(pkg.priceTzs)}
            </strong>
          </div>
          {summary.length > 0 ? (
            <ul
              className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]"
              style={{ color: "var(--advo-muted)" }}
            >
              {summary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
        </div>

        <FieldInput
          autoComplete="tel"
          autoFocus
          id="pay-phone"
          inputMode="tel"
          label={t("mobileMoneyNumber")}
          name="phone"
          onChange={(event) => setPhone(event.target.value)}
          placeholder="07XX XXX XXX"
          required
          value={phone}
        />

        {/* The three wallets, with the one the typed prefix belongs to lit up.
            This is the guest's confirmation that the number is going to the
            right place before they press pay. */}
        <div className="grid grid-cols-3 gap-1.5">
          {MONEY_OPTIONS.map((option) => {
            const active = detected?.id === option.id;
            return (
              <div
                className="grid place-items-center gap-0.5 rounded-xl border p-2 text-center transition"
                key={option.id}
                style={{
                  borderColor: active ? option.tint : "transparent",
                  background: active
                    ? `color-mix(in srgb, ${option.tint} 10%, transparent)`
                    : "var(--advo-card)",
                  boxShadow: active
                    ? "0 4px 12px -8px rgba(0,0,0,.4)"
                    : "0 1px 2px rgba(15,23,42,.06)",
                }}
              >
                <span
                  className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-black text-white"
                  style={{ background: option.tint }}
                >
                  {option.name.charAt(0)}
                </span>
                <span
                  className="text-[10px] font-bold leading-tight"
                  style={{ color: "var(--advo-text)" }}
                >
                  {option.name}
                </span>
                <span
                  className="text-[9px]"
                  style={{ color: "var(--advo-muted)" }}
                >
                  {t(option.networkKey)}
                </span>
              </div>
            );
          })}
        </div>
        {detected ? (
          <p className="text-[11px]" style={{ color: "var(--advo-muted)" }}>
            {t("portal.networkDetected", { network: t(detected.networkKey) })}
          </p>
        ) : null}

        {/* One notice, for the guest who is not on the WiFi yet and needs to know
            where to go. The reseller previewing their own portal gets nothing
            here: this dialog is meant to look exactly like the real one, and the
            designer panel beside the phone already says the payment step is off. */}
        {blocked === "no-context" ? (
          <Notice tone="accent">{t("openFromWifi")}</Notice>
        ) : null}

        {error ? <Notice tone="danger">{error}</Notice> : null}

        <button
          className={systemActionClass}
          disabled={pending || blocked !== "none"}
          style={systemActionStyle}
          type="submit"
        >
          {pending ? t("sending") : `${t("pay")} ${formatTzs(pkg.priceTzs)}`}
        </button>

        <button
          className="w-full text-center text-[11px] font-bold underline"
          onClick={onClose}
          style={{ color: "var(--advo-muted)" }}
          type="button"
        >
          {t("portal.changePackage")}
        </button>
      </form>
    </PortalModal>
  );
}
