"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode, type Ref } from "react";
import type { SessionUser } from "@advo/contracts";
import {
  Avatar,
  Button,
  Chip,
  Disclosure,
  DisclosureGroup,
  Drawer,
  ScrollShadow,
  Separator,
  Tooltip,
  useOverlayState,
} from "@heroui/react";
import {
  HelpCircle,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  X,
} from "lucide-react";
import { HOME, HELP_HREF, NAV, SECTIONS, isActive, type NavItem, type Role } from "./navigation";
import { LocaleSwitcher } from "@/features/common/LocaleSwitcher";
import { useI18n } from "@/lib/i18n";

const BRAND_MARK = "linear-gradient(135deg, #1B5EA4 0%, #2176C2 50%, #FBA102 100%)";
const BRAND_BAR = "linear-gradient(90deg, #1B5EA4 0%, #FBA102 50%, #F16304 100%)";
const COLLAPSE_KEY = "advo.sidebar.collapsed";

type SidebarCommon = {
  role: Role;
  user: SessionUser | null;
  version: string;
  onLogout: () => void;
};

/* -------------------------------------------------------------------------------------------------
 * Sidebar body — shared by the floating desktop panel and the mobile drawer.
 * `collapsed` renders the icon-only rail; the drawer always renders expanded.
 * -----------------------------------------------------------------------------------------------*/

function SidebarBody({
  role,
  user,
  version,
  collapsed,
  trailing,
  onNavigate,
  onLogout,
}: SidebarCommon & {
  collapsed: boolean;
  trailing?: ReactNode;
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const home = HOME[role];
  const sections = SECTIONS[role];
  const supportHref = HELP_HREF[role];
  const { t } = useI18n();

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* Top brand gradient accent line, clipped by the panel's rounded corners. */}
      <div className="h-1 shrink-0" style={{ background: BRAND_BAR }} />

      <div className={`flex items-center gap-2.5 pt-3.5 ${collapsed ? "justify-center px-2" : "px-3.5"}`}>
        <Link href={home} className="group flex min-w-0 items-center gap-2.5" onClick={onNavigate}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white shadow-md" style={{ background: BRAND_MARK }}>
            <Sparkles className="h-4 w-4" />
          </span>
          {!collapsed ? (
            <span className="min-w-0">
              <span className="block truncate text-base font-black tracking-tight text-white">Advo TZ</span>
              <span className="-mt-1 block truncate text-[9px] font-bold uppercase tracking-widest text-slate-400">
                Smart WiFi OS
              </span>
            </span>
          ) : null}
        </Link>

        {!collapsed ? (
          <span className="ml-auto shrink-0 rounded-md border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-300">
            v{version}
          </span>
        ) : null}
        {trailing}
      </div>

      {/* Signed-in identity. Hidden on the icon rail, where there is no room. */}
      {user && !collapsed ? (
        <div className="mx-3 mt-3 flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-2.5">
          <Avatar aria-label={user.name} className="shrink-0 ring-2 ring-white/10" color="default" size="sm">
            <Avatar.Fallback className="text-xs font-black text-white" style={{ background: BRAND_MARK }}>
              {user.name ? user.name.charAt(0).toUpperCase() : "A"}
            </Avatar.Fallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold leading-tight text-white">{user.name}</p>
            <p className="mt-0.5 truncate text-[10px] leading-tight text-slate-400">{user.email}</p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <Chip color="accent" size="sm" variant="soft">
                {role}
              </Chip>
              <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                {t("shell.status.active")}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Navigation. ScrollShadow keeps a long menu readable on short viewports. */}
      <ScrollShadow className={`mt-3 min-h-0 flex-1 ${collapsed ? "px-2" : "px-2.5"}`} hideScrollBar size={28}>
        {collapsed ? (
          <nav aria-label={t("nav.main")} className="flex flex-col gap-1">
            {NAV[role].map((entry, index) => (
              <div key={entry.href}>
                {index > 0 && isFirstOfSection(entry, sections) ? <Separator className="my-1.5 bg-white/10" /> : null}
                <RailLink active={isActive(pathname, entry.href, home)} entry={entry} onNavigate={onNavigate} />
              </div>
            ))}
          </nav>
        ) : (
          <DisclosureGroup
            allowsMultipleExpanded
            className="flex flex-col gap-3"
            defaultExpandedKeys={sections.map((section) => section.id)}
          >
            {sections.map((section) => (
              <Disclosure id={section.id} key={section.id}>
                <Disclosure.Heading>
                  <Disclosure.Trigger className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 transition-colors hover:text-white">
                    <span className="truncate">{t(section.labelKey)}</span>
                    <Disclosure.Indicator className="h-3.5 w-3.5 shrink-0 transition-transform duration-200" />
                  </Disclosure.Trigger>
                </Disclosure.Heading>
                <Disclosure.Content>
                  <Disclosure.Body className="mt-1 flex flex-col gap-1">
                    {section.items.map((entry) => (
                      <SidebarLink
                        active={isActive(pathname, entry.href, home)}
                        entry={entry}
                        key={entry.href}
                        onNavigate={onNavigate}
                      />
                    ))}
                  </Disclosure.Body>
                </Disclosure.Content>
              </Disclosure>
            ))}
          </DisclosureGroup>
        )}
      </ScrollShadow>

      {/* Footer: language, repeated help entry point (dark panels hide the footer
          label) and sign out. */}
      <div className="mt-2 shrink-0 border-t border-white/[0.08] p-2.5">
        <div className={`mb-2 flex ${collapsed ? "justify-center" : "justify-start"}`}>
          <LocaleSwitcher compact={collapsed} showIcon={!collapsed} variant="dark" />
        </div>
        <Link
          className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white ${
            collapsed ? "justify-center" : ""
          }`}
          href={supportHref}
          onClick={onNavigate}
        >
          <HelpCircle className="h-4 w-4 shrink-0" />
          {!collapsed ? <span>{t("nav.helpAndInfo")}</span> : null}
        </Link>
        <button
          className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[11px] font-bold text-rose-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300 ${
            collapsed ? "justify-center" : ""
          }`}
          onClick={onLogout}
          type="button"
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" />
          {!collapsed ? <span>{t("nav.logout")}</span> : null}
        </button>
      </div>
    </div>
  );
}

/** True when `entry` is the first item of any section after the first. */
function isFirstOfSection(entry: NavItem, sections: { items: NavItem[] }[]): boolean {
  return sections.some((section, index) => index > 0 && section.items[0]?.href === entry.href);
}

/** Expanded nav row: icon tile plus label. */
function SidebarLink({ entry, active, onNavigate }: { entry: NavItem; active: boolean; onNavigate?: () => void }) {
  const { t } = useI18n();
  const Icon = entry.icon;
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`group flex items-center gap-3 rounded-xl px-2.5 py-2 text-xs font-medium transition-colors ${
        active ? "bg-advo-blue font-bold text-white" : "text-slate-300 hover:bg-white/[0.07] hover:text-white"
      }`}
      href={entry.href}
      onClick={onNavigate}
      style={active ? { boxShadow: "0 4px 14px rgba(27, 94, 164, 0.4)" } : undefined}
    >
      <span
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors ${
          active ? "bg-white/20 text-white" : "text-slate-400 group-hover:bg-white/10 group-hover:text-white"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="truncate">{t(entry.labelKey)}</span>
    </Link>
  );
}

/**
 * Icon-only rail row.
 *
 * `Tooltip.Trigger` normally renders a `div[role="button"]`, which would nest an
 * unnamed button around every link. Rendering the trigger *as* the anchor keeps
 * a single element: one tab stop, one link, one tooltip anchor. The label lives
 * on `aria-label`, so the tooltip is a visual affordance only.
 *
 * HeroUI types the trigger as a `div`, so its props are re-cast to anchor props
 * at each such call site (`render` is typed to return a `ReactElement`, so the
 * change of element is otherwise accepted).
 */
function RailLink({ entry, active, onNavigate }: { entry: NavItem; active: boolean; onNavigate?: () => void }) {
  const { t } = useI18n();
  const label = t(entry.labelKey);
  const Icon = entry.icon;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={({ ref, ...triggerProps }) => {
          // Re-typed on purpose: see the note above.
          const trigger = triggerProps as unknown as AnchorHTMLAttributes<HTMLAnchorElement>;
          return (
            <a
              {...trigger}
              ref={ref as Ref<HTMLAnchorElement>}
              aria-current={active ? "page" : undefined}
              aria-label={label}
              className={`${trigger.className ?? ""} grid h-10 w-full place-items-center rounded-xl transition-colors ${
                active ? "bg-advo-blue text-white" : "text-slate-400 hover:bg-white/[0.07] hover:text-white"
              }`}
              href={entry.href}
              onClick={onNavigate}
              role={undefined}
              style={active ? { boxShadow: "0 4px 14px rgba(27, 94, 164, 0.4)" } : undefined}
              tabIndex={undefined}
            >
              <Icon className="h-4 w-4" />
            </a>
          );
        }}
      />
      <Tooltip.Content placement="right">{label}</Tooltip.Content>
    </Tooltip.Root>
  );
}

/* -------------------------------------------------------------------------------------------------
 * FloatingSidebar — the desktop panel, the mobile top bar and the mobile drawer.
 * -----------------------------------------------------------------------------------------------*/

export function FloatingSidebar({ role, user, version, onLogout }: SidebarCommon) {
  const pathname = usePathname();
  const home = HOME[role];
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const mobileNav = useOverlayState();

  // Restore the rail preference after mount so the server and first client
  // render agree (reading localStorage during render would desync hydration).
  useEffect(() => {
    if (window.localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value;
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

  // Close the mobile drawer on navigation.
  useEffect(() => {
    mobileNav.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      {/* Mobile top bar. The sidebar is a drawer below `lg`. */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--advo-border)] bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <Button aria-label={t("nav.openMenu")} isIconOnly onPress={mobileNav.open} size="sm" variant="ghost">
          <Menu className="h-5 w-5" />
        </Button>
        <Link className="flex min-w-0 items-center gap-2" href={home}>
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white" style={{ background: BRAND_MARK }}>
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <span className="truncate text-sm font-black tracking-tight text-[var(--advo-text)]">Advo TZ</span>
        </Link>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <LocaleSwitcher compact showIcon={false} />
          <small className="text-[10px] font-bold uppercase tracking-wider text-[var(--advo-muted)]">{role}</small>
        </div>
      </header>

      {/* Desktop: floating panel, detached from the viewport edge. */}
      <aside
        className={`sticky top-3 m-3 hidden shrink-0 flex-col overflow-hidden rounded-xl bg-advo-charcoal text-white shadow-[0_12px_40px_-12px_rgba(17,18,19,0.55)] ring-1 ring-black/5 transition-[width] duration-200 lg:flex ${
          collapsed ? "w-[76px]" : "w-64"
        }`}
        style={{ height: "calc(100svh - 1.5rem)" }}
      >
        <SidebarBody
          collapsed={collapsed}
          onLogout={onLogout}
          role={role}
          trailing={
            <Tooltip.Root>
              <Tooltip.Trigger
                render={({ ref, ...triggerProps }) => {
                  const trigger = triggerProps as unknown as ButtonHTMLAttributes<HTMLButtonElement>;
                  return (
                    <button
                      {...trigger}
                      ref={ref as Ref<HTMLButtonElement>}
                      aria-label={collapsed ? t("nav.expandMenu") : t("nav.collapseMenu")}
                      className={`${trigger.className ?? ""} ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white`}
                      onClick={toggleCollapsed}
                      role={undefined}
                      type="button"
                    >
                      {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                    </button>
                  );
                }}
              />
              <Tooltip.Content placement="right">
                {collapsed ? t("nav.expandMenu") : t("nav.collapseMenu")}
              </Tooltip.Content>
            </Tooltip.Root>
          }
          user={user}
          version={version}
        />
      </aside>

      {/* Mobile: off-canvas drawer carrying the same navigation, always expanded. */}
      <Drawer.Root state={mobileNav}>
        <Drawer.Backdrop>
          <Drawer.Content placement="left" className="w-[80vw] max-w-xs">
            <Drawer.Dialog className="bg-advo-charcoal text-white">
              <Drawer.Header className="sr-only">
                <Drawer.Heading>{t("nav.mainMenu")}</Drawer.Heading>
              </Drawer.Header>
              <Drawer.CloseTrigger aria-label={t("nav.closeMenu")} className="absolute right-3 top-4 z-10 text-slate-400">
                <X className="h-4 w-4" />
              </Drawer.CloseTrigger>
              <div className="flex h-full min-h-0 flex-col">
                <SidebarBody
                  collapsed={false}
                  onLogout={onLogout}
                  onNavigate={mobileNav.close}
                  role={role}
                  user={user}
                  version={version}
                />
              </div>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer.Root>
    </>
  );
}
