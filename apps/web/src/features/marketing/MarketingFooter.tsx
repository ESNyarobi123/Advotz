"use client";

import Link from "next/link";
import { AdvoLogo } from "./AdvoLogo";
import { ShieldCheck, Radio, Phone, Mail, MapPin, CheckCircle2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@advo/i18n";
import { Container, cx } from "./ui";

const PRODUCT_LINKS: Array<{ key: MessageKey; href: string }> = [
  { key: "marketing.footer.products.portal", href: "/features#captive-portal" },
  { key: "marketing.footer.products.omada", href: "/features#omada-integration" },
  { key: "marketing.footer.products.vouchers", href: "/features#vouchers" },
  { key: "marketing.footer.products.ledger", href: "/features#ledger" },
  { key: "marketing.footer.products.agents", href: "/features#agents" },
];

const CUSTOMER_LINKS: Array<{ key: MessageKey; href: string }> = [
  { key: "marketing.footer.customers.hotels", href: "/#solutions" },
  { key: "marketing.footer.customers.cafes", href: "/#solutions" },
  { key: "marketing.footer.customers.hostels", href: "/#solutions" },
  { key: "marketing.footer.customers.wisp", href: "/#solutions" },
  { key: "marketing.footer.customers.calculator", href: "/#calculator" },
];

function FooterColumn({ title, links }: { title: string; links: Array<{ key: MessageKey; href: string }> }) {
  const { t } = useI18n();
  return (
    <div>
      <h4 className="text-xs font-bold tracking-[0.14em] text-white uppercase">{title}</h4>
      <ul className="mt-4 space-y-2.5">
        {links.map((link) => (
          <li key={link.key}>
            <Link href={link.href} className="text-sm text-white/65 transition-colors hover:text-white">
              {t(link.key)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MarketingFooter() {
  const { t } = useI18n();

  const pills = [
    { icon: <CheckCircle2 className="size-3.5 text-[#FBA102]" aria-hidden="true" />, label: t("marketing.footer.pill.ledger") },
    { icon: <Radio className="size-3.5 text-[#7FB4E6]" aria-hidden="true" />, label: t("marketing.footer.pill.omada") },
    { icon: <ShieldCheck className="size-3.5 text-emerald-400" aria-hidden="true" />, label: t("marketing.footer.pill.noTheft") },
  ];

  return (
    <footer className="w-full border-t border-white/10 bg-advo-charcoal pt-16 pb-12 text-white/70">
      <Container>
        <div className="grid grid-cols-1 gap-10 border-b border-white/10 pb-12 md:grid-cols-2 lg:grid-cols-5">
          {/* Brand */}
          <div className="space-y-4 lg:col-span-2">
            <AdvoLogo size="lg" />
            <p className="max-w-sm text-sm leading-relaxed text-white/65">
              {t("marketing.footer.introLead")}{" "}
              <strong className="font-semibold text-white">{t("marketing.footer.introOmada")}</strong>.{" "}
              {t("marketing.footer.introTrail")}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {pills.map((pill) => (
                <span
                  key={pill.label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70"
                >
                  {pill.icon}
                  {pill.label}
                </span>
              ))}
            </div>
          </div>

          <FooterColumn title={t("marketing.footer.products.title")} links={PRODUCT_LINKS} />
          <FooterColumn title={t("marketing.footer.customers.title")} links={CUSTOMER_LINKS} />

          {/* Contact */}
          <div>
            <h4 className="text-xs font-bold tracking-[0.14em] text-white uppercase">
              {t("marketing.footer.contact.title")}
            </h4>
            <ul className="mt-4 space-y-3 text-sm text-white/65">
              <li className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 size-4 shrink-0 text-[#FBA102]" aria-hidden="true" />
                <span>Dar es Salaam, Tanzania</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="size-4 shrink-0 text-[#FBA102]" aria-hidden="true" />
                <span>+255 700 000 000</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="size-4 shrink-0 text-[#FBA102]" aria-hidden="true" />
                <span>support@advo.tz</span>
              </li>
              <li className="pt-1">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-950/60 px-3 py-1.5 text-xs text-emerald-400">
                  <span className="size-2 animate-pulse rounded-full bg-emerald-400" aria-hidden="true" />
                  {t("marketing.footer.status")}
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div
          className={cx(
            "flex flex-col items-center justify-between gap-4 pt-8 text-xs text-white/45",
            "sm:flex-row",
          )}
        >
          <p>
            &copy; {new Date().getFullYear()} Advo TZ. {t("marketing.footer.rights")}
          </p>
          <div className="flex items-center gap-6">
            <Link href="/pricing" className="transition-colors hover:text-white">
              {t("marketing.footer.bottom.pricing")}
            </Link>
            <Link href="/contact" className="transition-colors hover:text-white">
              {t("nav.support")}
            </Link>
            <Link href="/login" className="transition-colors hover:text-white">
              {t("marketing.footer.bottom.login")}
            </Link>
          </div>
        </div>
      </Container>
    </footer>
  );
}
