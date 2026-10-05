"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdvoLogo } from "./AdvoLogo";
import { Menu, X, ArrowRight, Sparkles } from "lucide-react";
import { LocaleSwitcher } from "@/features/common/LocaleSwitcher";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@advo/i18n";
import { ButtonLink, Container, cx } from "./ui";

type NavItem = {
  labelKey: MessageKey;
  href: string;
  /** Section id on the home page, used for the scroll-spy active state. */
  sectionId?: string;
};

const NAV_ITEMS: NavItem[] = [
  { labelKey: "marketing.nav.features", href: "/features" },
  { labelKey: "marketing.nav.solutions", href: "/#solutions", sectionId: "solutions" },
  { labelKey: "marketing.nav.howItWorks", href: "/#how-it-works", sectionId: "how-it-works" },
  { labelKey: "marketing.nav.pricing", href: "/pricing" },
  { labelKey: "marketing.nav.contact", href: "/contact" },
];

export function MarketingHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const pathname = usePathname();
  const { t } = useI18n();

  /* The header floats over the dark hero, then turns into a white glass bar
     once the page scrolls so it stays legible over light sections. */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Scroll-spy: highlight the in-page section currently under the header. */
  useEffect(() => {
    if (pathname !== "/") {
      setActiveSection(null);
      return;
    }
    const ids = NAV_ITEMS.map((item) => item.sectionId).filter(Boolean) as string[];
    const targets = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: [0, 0.2, 0.5, 1] },
    );
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [pathname]);

  /* Close the mobile drawer on Escape and lock background scroll while open. */
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [mobileMenuOpen]);

  const isActive = (item: NavItem) =>
    item.sectionId ? pathname === "/" && activeSection === item.sectionId : pathname === item.href;

  const onDark = !scrolled && !mobileMenuOpen;

  return (
    <>
      {/* Slim announcement bar */}
      <div className="relative z-50 w-full border-b border-white/10 bg-advo-charcoal">
        <Container className="flex items-center justify-center gap-2 py-2 text-center text-xs font-medium text-white/85">
          <span className="inline-flex items-center gap-1 rounded-full bg-[linear-gradient(135deg,#fba102_0%,#f16304_100%)] px-2 py-0.5 text-[10px] font-black tracking-wider text-advo-charcoal uppercase">
            <Sparkles className="size-3" aria-hidden="true" />
            {t("marketing.banner.new")}
          </span>
          <span className="hidden truncate sm:inline">{t("marketing.banner.body")}</span>
          <span className="sm:hidden">{t("marketing.banner.bodyShort")}</span>
          <Link href="/register" className="shrink-0 font-bold text-[#FBA102] underline hover:text-white">
            {t("marketing.banner.cta")} &rarr;
          </Link>
        </Container>
      </div>

      <header
        className={cx(
          "sticky top-0 z-40 w-full border-b transition-colors duration-300",
          scrolled
            ? "border-advo-border bg-white/85 shadow-[0_1px_0_rgba(16,24,40,0.04)] backdrop-blur-xl"
            : "border-white/10 bg-advo-charcoal/85 backdrop-blur-md",
        )}
      >
        <Container className="flex h-16 items-center justify-between gap-4 lg:h-20">
          <AdvoLogo size="md" variant={onDark ? "dark" : "light"} />

          {/* Desktop navigation — hidden below `lg` so Swahili labels never crowd the bar. */}
          <nav aria-label={t("marketing.nav.primary")} className="hidden items-center gap-1 lg:flex">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "rounded-field px-3 py-2 text-sm font-semibold transition-colors",
                    active
                      ? onDark
                        ? "bg-white/10 text-white"
                        : "bg-advo-blue-soft text-advo-blue"
                      : onDark
                        ? "text-white/75 hover:bg-white/5 hover:text-white"
                        : "text-advo-muted hover:bg-advo-page hover:text-advo-text",
                  )}
                >
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <LocaleSwitcher variant={onDark ? "dark" : "light"} />
            <Link
              href="/login"
              className={cx(
                "rounded-field px-3.5 py-2.5 text-sm font-semibold transition-colors",
                onDark ? "text-white/85 hover:bg-white/10 hover:text-white" : "text-advo-text hover:bg-advo-page",
              )}
            >
              {t("marketing.header.login")}
            </Link>
            <ButtonLink href="/register" size="md" arrow>
              {t("marketing.header.register")}
            </ButtonLink>
          </div>

          {/* Mobile / tablet trigger */}
          <div className="flex items-center gap-2 lg:hidden">
            <LocaleSwitcher compact showIcon={false} variant={onDark ? "dark" : "light"} />
            <button
              type="button"
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-expanded={mobileMenuOpen}
              aria-controls="marketing-mobile-menu"
              aria-label={mobileMenuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
              className={cx(
                "rounded-field p-2 transition-colors",
                onDark ? "text-white hover:bg-white/10" : "text-advo-text hover:bg-advo-page",
              )}
            >
              {mobileMenuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
            </button>
          </div>
        </Container>

        {/* Mobile / tablet drawer */}
        {mobileMenuOpen ? (
          <div
            id="marketing-mobile-menu"
            className="absolute inset-x-0 top-full max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-white/10 bg-advo-charcoal px-4 py-6 sm:px-6"
          >
            <nav className="flex flex-col gap-1" aria-label={t("marketing.nav.primary")}>
              {NAV_ITEMS.map((item) => {
                const active = isActive(item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "rounded-field px-4 py-3 text-base font-semibold transition-colors",
                      active ? "bg-white/10 text-white" : "text-white/80 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    {t(item.labelKey)}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-6 flex flex-col gap-3 border-t border-white/10 pt-6">
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-field border border-white/20 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-white/5"
              >
                {t("marketing.header.loginDashboard")}
              </Link>
              <ButtonLink href="/register" size="lg" arrow className="w-full">
                {t("marketing.header.registerFree")}
              </ButtonLink>
            </div>
          </div>
        ) : null}
      </header>

      {/* Dimmed backdrop behind the drawer */}
      {mobileMenuOpen ? (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-30 bg-advo-charcoal/40 backdrop-blur-sm lg:hidden"
        />
      ) : null}
    </>
  );
}
