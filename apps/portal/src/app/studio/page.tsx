"use client";

import { DEFAULT_PORTAL_THEME, PORTAL_CONTENT_STARTER, PROMOTION_PACKAGES } from "@advo/contracts";
import type { ReactNode } from "react";
import { ConnectedStage } from "@/components/ConnectedStage";
import { PaymentWaitingStage } from "@/components/PaymentWaitingStage";
import { HomeBanner } from "@/components/HomeBanner";
import { PackagesStage } from "@/components/PackagesStage";
import { PaymentModal } from "@/components/PaymentModal";
import { PortalFrame } from "@/components/PortalFrame";
import { useLocale } from "@/lib/portal";
import type { PortalListing, PortalPackage } from "@/lib/portal-types";

/**
 * Design board for the guest captive portal.
 *
 * The guest journey is three screens. A voucher is entered on the first one,
 * under the packages. When payment or a voucher succeeds, the guest lands on
 * the connected screen. Nothing here starts a payment or redeems a voucher.
 */

const THEME = DEFAULT_PORTAL_THEME;

const PACKAGES: PortalPackage[] = [
  {
    packageId: "hour",
    name: "Saa 1",
    priceTzs: "1000",
    durationSeconds: 3600,
    downloadKbps: 15_000,
    uploadKbps: 5_000,
    quotaType: "UNLIMITED",
    quotaBytes: null,
    maxDevices: 1,
    cardStyle: "classic",
  },
  {
    packageId: "three",
    name: "Saa 3",
    priceTzs: "2500",
    durationSeconds: 3 * 3600,
    downloadKbps: 25_000,
    uploadKbps: 8_000,
    quotaType: "UNLIMITED",
    quotaBytes: null,
    maxDevices: 1,
    cardStyle: "soft",
  },
  {
    packageId: "day",
    name: "Siku nzima",
    priceTzs: "5000",
    durationSeconds: 24 * 3600,
    downloadKbps: 30_000,
    uploadKbps: 10_000,
    quotaType: "UNLIMITED",
    quotaBytes: null,
    maxDevices: 2,
    cardStyle: "classic",
  },
];

const LISTINGS: PortalListing[] = [
  {
    id: "job-1",
    kind: "JOB",
    title: "Mhudumu wa wateja",
    organization: "Palm Beach Café",
    location: "Kariakoo, Dar es Salaam",
    employmentType: "Muda kamili",
    summary: "Huduma kwa wateja na mauzo ya vifurushi vya WiFi.",
    description: "Tunatafuta mhudumu mwenye mawasiliano mazuri.",
  },
];

const BOARDS: Array<{ id: string; step: string; title: string }> = [
  { id: "choose", step: "Hatua 1", title: "Chagua kifurushi" },
  { id: "pay", step: "Hatua 2", title: "Lipa kwa simu" },
  { id: "waiting", step: "Hatua 2", title: "Malipo yanasubiri" },
  { id: "connected", step: "Hatua 3", title: "Umeunganishwa" },
];

export default function PortalStudioPage() {
  const { locale, toggle, setLocale } = useLocale();
  const buying = PACKAGES[1]!;

  return (
    <div className="min-h-screen bg-[#e7edf4] text-[#0f172a]">
      <header className="sticky top-0 z-40 border-b border-black/5 bg-white/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#1b5ea4]">Captive portal</p>
            <h1 className="text-lg font-black tracking-tight">Hatua tatu za mgeni</h1>
          </div>
          <nav className="flex flex-1 gap-1.5 overflow-x-auto" aria-label="Kurasa">
            {BOARDS.map((board) => (
              <a
                className="shrink-0 rounded-full bg-[#f5f7fb] px-3 py-1 text-xs font-bold text-[#334155] ring-1 ring-black/5 hover:bg-white"
                href={`#${board.id}`}
                key={board.id}
              >
                {board.title}
              </a>
            ))}
          </nav>
          <div className="flex shrink-0 gap-1">
            <button
              className={`rounded-full px-3 py-1 text-xs font-bold ${locale === "en" ? "bg-[#0f172a] text-white" : "bg-[#f5f7fb] text-[#334155]"}`}
              onClick={() => setLocale("en")}
              type="button"
            >
              EN
            </button>
            <button
              className={`rounded-full px-3 py-1 text-xs font-bold ${locale === "sw" ? "bg-[#0f172a] text-white" : "bg-[#f5f7fb] text-[#334155]"}`}
              onClick={() => setLocale("sw")}
              type="button"
            >
              SW
            </button>
          </div>
        </div>
      </header>

      <div className="flex gap-6 overflow-x-auto px-4 py-6">
        <Phone id="choose" note="Vocha inaingizwa hapa chini, si ukurasa mwingine." step="Hatua 1" title="Chagua kifurushi">
          <GuestShell banner locale={locale} onSelectLanguage={setLocale} onToggleLanguage={toggle} title="Palm Beach WiFi">
            <PackagesStage
              campaigns={[]}
              config={null}
              content={PORTAL_CONTENT_STARTER}
              contextToken={null}
              error={null}
              message="WiFi ya Palm Beach — lipa kwa simu, uanze kutumia."
              onSubmit={() => undefined}
              packageCardLayout="list"
              packageCardStyle="classic"
              packages={PACKAGES}
              payBlock="none"
              paymentContained
              pending={false}
              slug="palm-beach"
              theme={THEME}
            />
          </GuestShell>
        </Phone>

        <Phone
          id="pay"
          overlay={
            <PaymentModal
              blocked="none"
              contained
              error={null}
              onClose={() => undefined}
              onSubmit={() => undefined}
              pending={false}
              pkg={buying}
              theme={THEME}
            />
          }
          step="Hatua 2"
          title="Lipa kwa simu"
        >
          <GuestShell banner locale={locale} onSelectLanguage={setLocale} onToggleLanguage={toggle} title="Palm Beach WiFi">
            <div className="pointer-events-none">
              <PackagesStage
                campaigns={[]}
                config={null}
                content={PORTAL_CONTENT_STARTER}
                error={null}
                message="WiFi ya Palm Beach — lipa kwa simu, uanze kutumia."
                onSubmit={() => undefined}
                packageCardLayout="list"
                packageCardStyle="classic"
                packages={PACKAGES}
                payBlock="none"
                pending={false}
                theme={THEME}
              />
            </div>
          </GuestShell>
        </Phone>

        <Phone id="waiting" note="Baada ya kubonyeza lipa, mgeni anasubiri hapa." step="Hatua 2" title="Malipo yanasubiri">
          <GuestShell locale={locale} onSelectLanguage={setLocale} onToggleLanguage={toggle} title="Palm Beach WiFi">
            <PaymentWaitingStage
              amount="TZS 2,500"
              duration="3 hours"
              packageName="Saa 3"
              reference="PALMBEACH1"
            />
          </GuestShell>
        </Phone>

        <Phone id="connected" note="Malipo yakifaulu, au vocha ikifaulu, mgeni anafika hapa." step="Hatua 3" title="Umeunganishwa">
          <GuestShell locale={locale} onSelectLanguage={setLocale} onToggleLanguage={toggle} title="Palm Beach WiFi">
            <ConnectedStage
              business="Palm Beach Café"
              businesses={[]}
              config={null}
              landingUrl="https://www.google.com"
              listings={LISTINGS}
              promotionPackages={[...PROMOTION_PACKAGES]}
              sessionLabel="Saa 3 · bila kikomo"
              siteTitle="Palm Beach WiFi"
              slug="palm-beach"
              theme={THEME}
            />
          </GuestShell>
        </Phone>
      </div>
    </div>
  );
}

function Phone({
  id,
  step,
  title,
  note,
  children,
  overlay,
}: {
  id: string;
  step: string;
  title: string;
  note?: string;
  children: ReactNode;
  overlay?: ReactNode;
}) {
  return (
    <section className="flex w-[390px] shrink-0 flex-col gap-2" id={id}>
      <header className="px-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#64748b]">{step}</p>
        <h2 className="text-base font-black tracking-tight">{title}</h2>
        {note ? <p className="mt-1 text-xs leading-snug text-[#64748b]">{note}</p> : null}
      </header>
      <div className="relative h-[780px] overflow-hidden rounded-[2rem] bg-[#f5f7fb] shadow-[0_20px_50px_-24px_rgba(15,23,42,0.45)] ring-1 ring-black/10">
        <div className="h-full overflow-y-auto [&_.min-h-screen]:min-h-full">{children}</div>
        {overlay}
      </div>
    </section>
  );
}

function GuestShell({
  title,
  children,
  banner = false,
  locale,
  onToggleLanguage,
  onSelectLanguage,
}: {
  title: string;
  children: ReactNode;
  banner?: boolean;
  locale: "en" | "sw";
  onToggleLanguage: () => void;
  onSelectLanguage: (next: "en" | "sw") => void;
}) {
  const { t } = useLocale();
  return (
    <PortalFrame
      banner={banner ? <HomeBanner campaigns={[]} config={null} content={PORTAL_CONTENT_STARTER} /> : undefined}
      business="Palm Beach Café"
      languageLabel={t("language")}
      locale={locale}
      onSelectLanguage={onSelectLanguage}
      onToggleLanguage={onToggleLanguage}
      showLanguageSwitcher
      theme={THEME}
      title={title}
    >
      {children}
    </PortalFrame>
  );
}
