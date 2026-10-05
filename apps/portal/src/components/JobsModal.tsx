"use client";

import { useEffect, useMemo, useState } from "react";
import { PortalModal } from "@/components/PortalModal";
import type { PortalListing, PortalListingKind, PortalTheme } from "@/lib/portal-types";
import { useLocale } from "@/lib/portal";

/**
 * "Jobs & Opportunities" feed shown to a connected guest. Platform-managed by
 * Admin; the guest can switch between the two kinds and open a listing.
 */
export function JobsModal({
  open,
  onClose,
  listings,
  theme,
}: {
  open: boolean;
  onClose: () => void;
  listings: PortalListing[];
  theme?: PortalTheme;
}) {
  const { t } = useLocale();
  const [kind, setKind] = useState<PortalListingKind>("JOB");
  const [detailId, setDetailId] = useState<string | null>(null);

  // Returning to the list whenever the dialog closes keeps state predictable.
  useEffect(() => {
    if (!open) setDetailId(null);
  }, [open]);

  const visible = useMemo(() => listings.filter((listing) => listing.kind === kind), [listings, kind]);
  const detail = visible.find((listing) => listing.id === detailId) ?? null;

  const tabs: Array<{ id: PortalListingKind; label: string }> = [
    { id: "JOB", label: t("portal.jobs") },
    { id: "OPPORTUNITY", label: t("portal.opportunities") },
  ];

  return (
    <PortalModal onClose={onClose} open={open} theme={theme} title={kind === "JOB" ? t("portal.jobs") : t("portal.opportunities")} size="wide">
      {detail ? (
        <div className="space-y-3">
          <button className="text-xs font-bold underline" onClick={() => setDetailId(null)} style={{ color: "var(--advo-blue)" }} type="button">
            ← {t("portal.jobBack")}
          </button>
          <div>
            <h3 className="text-lg font-black leading-tight">{detail.title}</h3>
            {detail.organization ? <p className="text-sm text-[var(--advo-muted)]">{detail.organization}</p> : null}
          </div>
          <dl className="space-y-1 text-sm">
            {detail.location ? (
              <div className="flex gap-2">
                <dt className="font-bold">{t("portal.promotionLocation")}:</dt>
                <dd className="text-[var(--advo-muted)]">{detail.location}</dd>
              </div>
            ) : null}
            {detail.employmentType ? (
              <div className="flex gap-2">
                <dt className="font-bold">{t("portal.jobType")}:</dt>
                <dd className="text-[var(--advo-muted)]">{detail.employmentType}</dd>
              </div>
            ) : null}
          </dl>
          {detail.summary ? <p className="text-sm leading-relaxed">{detail.summary}</p> : null}
          {detail.description ? <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--advo-muted)]">{detail.description}</p> : null}
          <p className="rounded-lg bg-black/5 p-2 text-[11px] text-[var(--advo-muted)]">{t("portal.jobClosing")}</p>
        </div>
      ) : (
        <>
          <p className="mb-3 text-center text-sm text-[var(--advo-muted)]">{t("portal.jobsLead")}</p>
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-black/5 p-1" role="group">
            {tabs.map((tab) => {
              const active = tab.id === kind;
              return (
                <button
                  aria-pressed={active}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${active ? "text-white" : "text-[var(--advo-muted)]"}`}
                  key={tab.id}
                  onClick={() => {
                    setKind(tab.id);
                    setDetailId(null);
                  }}
                  style={active ? { background: "var(--advo-blue)" } : undefined}
                  type="button"
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--advo-muted)]">{t("portal.jobsPreviewNote")}</p>

          {visible.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--advo-muted)]">{t("portal.jobsEmpty")}</p>
          ) : (
            <ul className="space-y-2">
              {visible.map((listing) => (
                <li className="rounded-xl border border-black/10 p-3" key={listing.id}>
                  <p className="font-bold leading-tight">{listing.title}</p>
                  {listing.organization ? <p className="text-xs text-[var(--advo-muted)]">{listing.organization}</p> : null}
                  {listing.location ? <p className="mt-0.5 text-xs text-[var(--advo-muted)]">{listing.location}</p> : null}
                  {listing.employmentType ? (
                    <span className="mt-1.5 inline-block rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-bold text-[var(--advo-muted)]">
                      {listing.employmentType}
                    </span>
                  ) : null}
                  {listing.summary ? <p className="mt-1.5 text-xs leading-relaxed text-[var(--advo-muted)]">{listing.summary}</p> : null}
                  <button
                    className="mt-2 w-full rounded-lg border py-1.5 text-xs font-bold transition"
                    onClick={() => setDetailId(listing.id)}
                    style={{ borderColor: "var(--advo-blue)", color: "var(--advo-blue)" }}
                    type="button"
                  >
                    {kind === "JOB" ? t("portal.jobViewApply") : t("portal.jobViewOpportunity")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </PortalModal>
  );
}
