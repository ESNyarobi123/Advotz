"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  type DeliveredAdCampaign,
  type EffectivePortalConfig,
  type PortalContent,
  type PortalTheme,
} from "@advo/contracts";
import {
  ApiError,
  formatBytes,
  formatDuration,
  formatSpeed,
  formatTzs,
} from "@advo/api-client";
import {
  Notice,
  PortalPackageCard,
  PortalPackageList,
  type PortalCardLayout,
  type PortalCardStyle,
  type PortalIconName,
  type PortalPackageView,
} from "@advo/ui";
import { PaymentModal, type PayBlock, type PayerForm } from "@/components/PaymentModal";
import { usePortalPreviewAppearance } from "@/lib/portal-preview";
import type { PortalPackage } from "@/lib/portal-types";
import { portalApi, useLocale } from "@/lib/portal";
import { primaryButton } from "@/lib/theme";

/** The portal icon that best reads as this access length. */
function durationIcon(durationSeconds: number): PortalIconName {
  if (durationSeconds <= 24 * 3600) return "clock";
  if (durationSeconds <= 7 * 86_400) return "sun";
  if (durationSeconds <= 31 * 86_400) return "calendar";
  return "bolt";
}

/**
 * Stage 1 — the guest's landing screen.
 *
 * This screen sells, and nothing on it is a form. Tapping a package opens the
 * mobile-money dialog from `PaymentModal`; the fields to pay live there, so the
 * package list is the whole screen and the second row of cards is never pushed
 * below the fold by a checkout the guest has not chosen yet.
 *
 * Package cards come from the portal design system so the guest sees exactly
 * the look the reseller's plan allows: the `style` on each card is
 * plan-resolved server-side and never changes what the guest pays.
 */
export function PackagesStage({
  packages,
  theme,
  packageCardStyle,
  packageCardLayout = "grid-2",
  campaigns = [],
  content,
  message,
  payBlock,
  pending,
  error,
  onSubmit,
  config,
  slug,
  contextToken,
  isPreview,
}: {
  packages: PortalPackage[];
  theme?: PortalTheme;
  /** Plan default, used for a package that arrives without a stamped style. */
  packageCardStyle: PortalCardStyle;
  /** Plan-resolved arrangement: one column, or two or three per row. */
  packageCardLayout?: PortalCardLayout;
  /** Campaigns already filtered for this site and the banner placement. */
  campaigns?: DeliveredAdCampaign[];
  /** The site's portal content, for the reseller's own advert banners. */
  content?: PortalContent;
  /** The site's one-line description, shown under the promotional surfaces. */
  message?: string | null;
  /** Why an order cannot be started; `none` means the guest can pay. */
  payBlock: PayBlock;
  pending: boolean;
  error: string | null;
  onSubmit: (packageId: string, form: PayerForm) => void;
  config?: EffectivePortalConfig | null;
  slug?: string;
  contextToken?: string | null;
  isPreview?: boolean;
}) {
  const { locale, t } = useLocale();
  const previewAppearance = usePortalPreviewAppearance();
  const cardLayout = previewAppearance?.cardLayout ?? packageCardLayout;

  /** The package whose payment dialog is open, if any. */
  const [payingId, setPayingId] = useState<string | null>(null);

  const paying = packages.find((pkg) => pkg.packageId === payingId) ?? null;

  function packageView(pkg: PortalPackage): PortalPackageView {
    const unlimited = pkg.quotaType === "UNLIMITED";
    return {
      id: pkg.packageId,
      name: pkg.name,
      duration: formatDuration(pkg.durationSeconds, locale),
      price: formatTzs(pkg.priceTzs).replace(/^[^\d]*/, ""),
      // No measured speed means no speed line: "Up to —" reads as a defect.
      speed: pkg.downloadKbps ? formatSpeed(pkg.downloadKbps) : "",
      // The whole allowance line is composed here, in the guest's language,
      // because the unit belongs to the language and not to the card.
      data: unlimited
        ? t("unlimitedData")
        : t("portal.card.allowance", { data: formatBytes(pkg.quotaBytes) }),
      devices: pkg.maxDevices,
      icon: unlimited ? "infinity" : durationIcon(pkg.durationSeconds),
    };
  }

  return (
    <section
      aria-label={t("portal.chooseTitle")}
      className="flex flex-1 flex-col"
    >
      {message ? (
        <p
          className="mx-auto mb-3 mt-0 max-w-[340px] text-center text-sm font-medium leading-snug"
          style={{ color: "var(--advo-muted)" }}
        >
          {message}
        </p>
      ) : null}
      <h2
        className="mt-1 text-center text-[1.75rem] font-black leading-tight tracking-tight"
        style={{ color: "var(--advo-text)" }}
      >
        {t("portal.chooseTitle")}
      </h2>
      <p
        className="mb-3 mt-1 text-center text-sm"
        style={{ color: "var(--advo-muted)" }}
      >
        {t("portal.chooseLead")}
      </p>

      {packages.length === 0 ? (
        <Notice tone="accent">{t("noPackages")}</Notice>
      ) : null}

      {/* Not a radiogroup: tapping a card does not select an option in place, it
          opens the payment dialog for that package. The cards carry their own
          full text as each button's accessible name. */}
      <div>
        <PortalPackageList layout={cardLayout}>
          {packages.map((pkg, index) => (
            <PortalPackageCard
              isFirst={index === 0}
              key={pkg.packageId}
              labels={{
                upTo: t("portal.card.upTo"),
                deviceOne: t("portal.card.deviceOne"),
                deviceMany: t("portal.card.deviceMany"),
              }}
              layout={cardLayout}
              onSelect={setPayingId}
              package={packageView(pkg)}
              selectLabel={t("portal.selectPackage")}
              selected={pkg.packageId === payingId}
              style={previewAppearance?.cardStyle ?? pkg.cardStyle ?? packageCardStyle}
            />
          ))}
        </PortalPackageList>
      </div>

      {/* ── Voucher Redemption Option (At bottom of packages) ── */}
      {config?.voucherEnabled !== false ? (
        <VoucherSection
          contextToken={contextToken}
          isPreview={isPreview}
          slug={slug}
          theme={theme}
        />
      ) : null}

      {/* An order cannot be started without a WiFi context, and the designer's
          preview cannot start one by design. `PaymentModal` states the reason
          inside the dialog rather than the stage carrying a banner above it, so
          the landing screen is the price list the guest came for and the
          explanation appears exactly where someone tries to pay. */}

      {/* Remounted per package so a cancelled dialog never reopens holding the
          previous guest's number. */}
      {paying ? (
        <PaymentModal
          blocked={payBlock}
          error={error}
          key={paying.packageId}
          onClose={() => setPayingId(null)}
          onSubmit={onSubmit}
          pending={pending}
          pkg={paying}
          theme={theme}
        />
      ) : null}
    </section>
  );
}

/**
 * Voucher redemption block rendered at the bottom of the packages list.
 * Allows guests with printed or electronic vouchers to authenticate
 * their device via TP-Link Omada / RADIUS without online payment.
 */
function VoucherSection({
  slug,
  contextToken,
  isPreview,
  theme,
}: {
  slug?: string;
  contextToken?: string | null;
  isPreview?: boolean;
  theme?: PortalTheme;
}) {
  const router = useRouter();
  const { t } = useLocale();
  const previewAppearance = usePortalPreviewAppearance();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Dynamically adopt reseller's theme / customization (live & preview)
  const primaryColor = previewAppearance?.colors?.primary ?? theme?.primary ?? "#2563eb";
  const accentColor = previewAppearance?.colors?.accent ?? theme?.accent ?? primaryColor;
  const radiusVal = theme?.radius ?? 12;
  const buttonStyle = theme?.buttonStyle ?? "gradient";

  const buttonBg =
    buttonStyle === "gradient"
      ? `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)`
      : primaryColor;

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) return;

    if (isPreview) {
      setError(
        t("openFromWifi") ||
          "Hali ya uhakiki: Huwezi kutumia vocha bila kuunganishwa kwenye mtandao halisi wa WiFi."
      );
      return;
    }

    if (!contextToken) {
      setError(t("openFromWifi"));
      return;
    }

    setPending(true);
    setError(null);
    try {
      const res = await portalApi.post<{ recoveryToken: string; grantDeviceState: string }>(
        "/portal/vouchers/redeem",
        { contextToken, code: cleanCode }
      );
      if (slug) {
        localStorage.setItem(`advo:last-order:${slug}`, res.recoveryToken);
        router.push(`/${slug}/status?token=${encodeURIComponent(res.recoveryToken)}`);
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === "DEVICE_LIMIT_REACHED") {
        setError(t("deviceLimit"));
      } else if (err instanceof ApiError && err.code === "PORTAL_CONTEXT_EXPIRED") {
        setError(t("contextExpired"));
      } else if (err instanceof ApiError && err.code === "FEATURE_LOCKED_BY_PLAN") {
        setError(t("portal.voucherUnavailable"));
      } else if (err instanceof ApiError && err.status === 400) {
        setError(t("voucherUsedOrExpired"));
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-8 border-t border-[var(--advo-border)]/70 pt-6">
      {/* Sleek divider badge */}
      <div className="relative mb-5 text-center">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-slate-200/80 dark:border-white/10" />
        </div>
        <div className="relative flex justify-center">
          <span
            className="rounded-full border px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider shadow-2xs transition-colors"
            style={{
              borderColor: `color-mix(in srgb, ${primaryColor} 22%, rgba(148, 163, 184, 0.25))`,
              backgroundColor: "var(--advo-portal-card, var(--surface, #ffffff))",
              color: "var(--advo-text, #475569)",
            }}
          >
            🎫 {t("portal.voucherOr")}
          </span>
        </div>
      </div>

      {/* Main Voucher Card adopting reseller customization */}
      <div
        className="overflow-hidden border p-3.5 shadow-xs backdrop-blur-sm transition-all"
        style={{
          borderRadius: radiusVal,
          borderColor: `color-mix(in srgb, ${primaryColor} 24%, var(--advo-border, rgba(148, 163, 184, 0.2)))`,
          background: `color-mix(in srgb, ${primaryColor} 4%, var(--advo-portal-card, var(--surface, #ffffff)))`,
        }}
      >
        {error ? (
          <div className="mb-3">
            <Notice tone="danger">{error}</Notice>
          </div>
        ) : null}

        <form className="space-y-2.5" onSubmit={handleRedeem}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <input
                autoCapitalize="characters"
                autoComplete="off"
                className="w-full border bg-white px-3.5 py-2.5 font-mono text-sm font-bold uppercase tracking-wider text-slate-900 placeholder:normal-case placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 focus:outline-none dark:border-slate-700/80 dark:bg-slate-900 dark:text-white"
                onBlur={() => setIsFocused(false)}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onFocus={() => setIsFocused(true)}
                placeholder={t("portal.voucherPlaceholder")}
                required
                spellCheck={false}
                style={{
                  borderRadius: Math.max(8, radiusVal - 2),
                  borderColor: isFocused ? primaryColor : undefined,
                  boxShadow: isFocused ? `0 0 0 3px color-mix(in srgb, ${primaryColor} 20%, transparent)` : undefined,
                }}
                type="text"
                value={code}
              />
            </div>
            <button
              className="inline-flex shrink-0 items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:brightness-105 active:scale-[0.98] disabled:opacity-60"
              disabled={pending || !code.trim()}
              style={{
                borderRadius: Math.max(8, radiusVal - 2),
                background: buttonBg,
              }}
              type="submit"
            >
              {pending ? (
                <>
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>{t("portal.voucherSubmitting")}</span>
                </>
              ) : (
                <>
                  <span>⚡</span>
                  <span>{t("portal.voucherSubmit")}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
