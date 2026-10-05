"use client";

import { useState } from "react";
import { Button } from "@heroui/react";
import { formatTzs } from "@advo/api-client";
import { Notice } from "@advo/ui";
import { FieldInput } from "@/components/FieldInput";
import { PortalModal } from "@/components/PortalModal";
import { primaryButton } from "@/lib/theme";
import type { PortalTheme, PromotionPackage } from "@/lib/portal-types";
import { portalApi, useLocale } from "@/lib/portal";

type Panel = "packages" | "details" | "success";

/**
 * "Promote your business" — a local business picks a banner duration and sends
 * its details. The request is stored for the site's reseller (no payment here).
 */
export function PromotionModal({
  open,
  onClose,
  slug,
  packages,
  theme,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  packages: PromotionPackage[];
  theme?: PortalTheme;
}) {
  const { t } = useLocale();
  const buy = primaryButton(theme);
  const [panel, setPanel] = useState<Panel>("packages");
  const [selected, setSelected] = useState<PromotionPackage | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weekly = packages.filter((p) => p.group === "weekly");
  const quarterly = packages.filter((p) => p.group === "quarterly");

  function close() {
    onClose();
    // Reset after the close animation frame so the dialog reopens cleanly.
    setTimeout(() => {
      setPanel("packages");
      setSelected(null);
      setError(null);
      setPending(false);
    }, 150);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await portalApi.post(`/portal/sites/${encodeURIComponent(slug)}/promotions`, {
        packageCode: selected.code,
        fullName: String(form.get("fullName") ?? ""),
        mobile: String(form.get("mobile") ?? ""),
        email: String(form.get("email") ?? "") || undefined,
        business: String(form.get("business") ?? ""),
        location: String(form.get("location") ?? ""),
        description: String(form.get("description") ?? ""),
        offer: String(form.get("offer") ?? ""),
      });
      setPanel("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <PortalModal onClose={close} open={open} theme={theme} title={t("portal.promotionTitle")} size="wide">
      {panel === "packages" ? (
        <div className="space-y-4">
          <p className="text-center text-sm text-[var(--advo-muted)]">{t("portal.promotionLead")}</p>
          <p className="rounded-lg bg-amber-50 p-2 text-center text-[11px] font-semibold text-amber-700">
            {t("portal.promotionPriceNote")}
          </p>
          {[
            { heading: t("portal.promotionWeekly"), rows: weekly },
            { heading: t("portal.promotionQuarterly"), rows: quarterly },
          ].map((group) => (
            <div key={group.heading}>
              <h3 className="mb-2 text-sm font-bold">{group.heading}</h3>
              <div className="grid grid-cols-2 gap-2">
                {group.rows.map((pkg) => (
                  <button
                    aria-label={t("portal.promotionChoose", { duration: pkg.durationLabel, price: formatTzs(pkg.priceTzs) })}
                    className="rounded-xl border border-black/10 p-2.5 text-start transition hover:border-[var(--advo-blue)]"
                    key={pkg.code}
                    onClick={() => {
                      setSelected(pkg);
                      setPanel("details");
                    }}
                    type="button"
                  >
                    <span className="block text-[11px] font-black text-[var(--advo-muted)]">{pkg.code}</span>
                    <span className="block text-sm font-bold">{pkg.durationLabel}</span>
                    <span className="mt-0.5 block text-xs" style={{ color: "var(--advo-blue)" }}>
                      {formatTzs(pkg.priceTzs)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {panel === "details" && selected ? (
        <form className="space-y-3" onSubmit={submit}>
          <div className="flex items-center justify-between rounded-xl bg-black/5 px-3 py-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--advo-muted)]">{t("portal.promotionSelected")}</p>
              <p className="text-sm font-bold">{selected.durationLabel}</p>
            </div>
            <span style={{ color: "var(--advo-blue)" }} className="text-sm font-black">
              {formatTzs(selected.priceTzs)}
            </span>
          </div>
          <button className="text-xs font-bold underline" onClick={() => setPanel("packages")} style={{ color: "var(--advo-blue)" }} type="button">
            ← {t("portal.promotionChange")}
          </button>

          <FieldInput autoComplete="name" id="fullName" label={t("portal.promotionName")} maxLength={100} name="fullName" required />
          <FieldInput autoComplete="tel" id="mobile" inputMode="tel" label={t("portal.promotionMobile")} name="mobile" placeholder="07XX XXX XXX" required />
          <FieldInput autoComplete="email" id="email" label={t("portal.promotionEmail")} name="email" type="email" />
          <FieldInput autoComplete="organization" id="business" label={t("portal.promotionBusiness")} maxLength={150} name="business" required />
          <FieldInput id="location" label={t("portal.promotionLocation")} maxLength={200} name="location" placeholder={t("portal.promotionLocationPlaceholder")} required />

          <label className="block text-xs font-bold text-[var(--advo-text)]" htmlFor="description">
            {t("portal.promotionDescription")}
          </label>
          <textarea
            className="w-full rounded-field border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--advo-blue)]"
            id="description"
            maxLength={1500}
            name="description"
            required
            rows={3}
          />

          <label className="block text-xs font-bold text-[var(--advo-text)]" htmlFor="offer">
            {t("portal.promotionOffer")}
          </label>
          <textarea
            className="w-full rounded-field border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--advo-blue)]"
            id="offer"
            maxLength={1500}
            name="offer"
            required
            rows={3}
          />

          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Button fullWidth isDisabled={pending} size="lg" style={{ ...buy.style, borderRadius: theme?.radius }} type="submit" variant={buy.variant}>
            {pending ? t("portal.promotionSubmitting") : t("portal.promotionSubmit")}
          </Button>
        </form>
      ) : null}

      {panel === "success" ? (
        <div className="space-y-3 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-green-500 text-2xl font-black text-white">✓</div>
          <h3 className="text-lg font-black">{t("portal.promotionSuccessTitle")}</h3>
          <p className="text-sm text-[var(--advo-muted)]">{t("portal.promotionSuccessBody")}</p>
          <Button fullWidth onPress={() => setPanel("packages")} type="button" variant="outline">
            {t("portal.promotionAnother")}
          </Button>
          <Button fullWidth onPress={close} style={{ ...buy.style, borderRadius: theme?.radius }} type="button" variant={buy.variant}>
            {t("portal.promotionBack")}
          </Button>
        </div>
      ) : null}
    </PortalModal>
  );
}
