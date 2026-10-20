"use client";

import { useMemo } from "react";
import { PortalModal } from "@/components/PortalModal";
import type { PortalListing, PortalTheme } from "@/lib/portal-types";
import { useLocale } from "@/lib/portal";

/**
 * Local Events and Holidays both read from the same Admin-managed feed as the
 * jobs list, so one modal serves both rows. A listing is rendered as a compact
 * card: when/where/price first, then the description and a single outbound CTA.
 */
export function ExploreListingsModal({
  open,
  onClose,
  listings,
  kind,
  theme,
}: {
  open: boolean;
  onClose: () => void;
  listings: PortalListing[];
  kind: "LOCAL_EVENT" | "HOLIDAY";
  theme?: PortalTheme;
}) {
  const { locale, t } = useLocale();

  const visible = useMemo(() => listings.filter((listing) => listing.kind === kind), [listings, kind]);

  const formatDate = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const timeParts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Dar_es_Salaam",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const hour = timeParts.find((part) => part.type === "hour")?.value ?? "00";
    const minute = timeParts.find((part) => part.type === "minute")?.value ?? "00";
    const hasTime = !(hour === "00" && minute === "00");
    return new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      ...(hasTime ? { hour: "2-digit", minute: "2-digit" } : {}),
      timeZone: "Africa/Dar_es_Salaam",
    }).format(date);
  };

  const when = (listing: PortalListing) => {
    const start = formatDate(listing.startsAt);
    const end = formatDate(listing.endsAt);
    if (!start && !end) return "";
    if (start && end && start !== end) return `${start} — ${end}`;
    return start || end;
  };

  /** Venue, address and region often repeat each other; show each place once. */
  const place = (listing: PortalListing) => {
    const parts = [listing.venue, listing.location, listing.region]
      .map((value) => (value ?? "").trim())
      .filter(Boolean);
    const unique: string[] = [];
    for (const part of parts) {
      const lower = part.toLowerCase();
      if (unique.some((kept) => kept.toLowerCase().includes(lower))) continue;
      for (let index = unique.length - 1; index >= 0; index -= 1) {
        if (lower.includes(unique[index]!.toLowerCase())) unique.splice(index, 1);
      }
      unique.push(part);
    }
    return unique.join(", ");
  };

  const title = kind === "LOCAL_EVENT" ? t("portal.localEvents") : t("portal.holidays");
  const empty = kind === "LOCAL_EVENT" ? t("portal.eventsEmpty") : t("portal.holidaysEmpty");

  return (
    <PortalModal onClose={onClose} open={open} theme={theme} title={title} size="wide">
      <p className="mb-3 text-center text-sm text-[var(--advo-muted)]">
        {kind === "LOCAL_EVENT" ? t("portal.eventsLead") : t("portal.holidaysLead")}
      </p>

      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--advo-muted)]">{empty}</p>
      ) : (
        <ul className="max-h-[60vh] space-y-2.5 overflow-y-auto pr-1">
          {visible.map((listing) => {
            const placeLabel = place(listing);
            const dates = when(listing);
            return (
              <li className="rounded-xl border border-black/10 p-3.5" key={listing.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold leading-tight">{listing.title}</p>
                    {listing.organization ? (
                      <p className="text-xs text-[var(--advo-muted)]">{listing.organization}</p>
                    ) : null}
                  </div>
                  {listing.priceLabel ? (
                    <span className="shrink-0 rounded-full bg-black/5 px-2.5 py-1 text-[10px] font-bold text-[var(--advo-muted)]">
                      {listing.priceLabel}
                    </span>
                  ) : null}
                </div>

                <dl className="mt-2 space-y-1 text-xs">
                  {dates ? (
                    <div className="flex gap-1.5">
                      <dt className="font-bold">{t("portal.listingWhen")}:</dt>
                      <dd className="text-[var(--advo-muted)]">{dates}</dd>
                    </div>
                  ) : null}
                  {placeLabel ? (
                    <div className="flex gap-1.5">
                      <dt className="font-bold">{t("portal.listingWhere")}:</dt>
                      <dd className="text-[var(--advo-muted)]">{placeLabel}</dd>
                    </div>
                  ) : null}
                </dl>

                {listing.summary ? (
                  <p className="mt-2 text-xs leading-relaxed text-[var(--advo-muted)]">{listing.summary}</p>
                ) : null}

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {listing.link ? (
                    <a
                      className="rounded-lg px-3 py-1.5 text-xs font-bold text-white transition hover:brightness-110"
                      href={listing.link}
                      rel="noopener noreferrer"
                      style={{ background: "var(--advo-blue)" }}
                      target="_blank"
                    >
                      {kind === "LOCAL_EVENT" ? t("portal.eventsOpen") : t("portal.holidayOpen")}
                    </a>
                  ) : null}
                  {listing.contactPhone ? (
                    <a
                      className="rounded-lg border px-3 py-1.5 text-xs font-bold"
                      href={`tel:${listing.contactPhone.replace(/[^\d+]/g, "")}`}
                      style={{ borderColor: "var(--advo-blue)", color: "var(--advo-blue)" }}
                    >
                      {t("portal.listingCall")}
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PortalModal>
  );
}
