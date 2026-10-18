import type { SessionUser } from "@advo/contracts";
import type { MessageKey } from "@advo/i18n";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Briefcase,
  Building,
  CreditCard,
  Cpu,
  HelpCircle,
  Layers,
  LayoutDashboard,
  MapPin,
  Megaphone,
  Package,
  Palette,
  Receipt,
  Router,
  Settings,
  ShieldCheck,
  Ticket,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  Wifi,
  type LucideIcon,
} from "lucide-react";

export type Role = SessionUser["role"];

/**
 * A route carries a translation key rather than a label, so the sidebar renders
 * in whatever language the operator picked. Icon lookup is keyed by `href`,
 * which is stable, instead of by the (now translated) label.
 */
export type NavItem = {
  href: string;
  labelKey: MessageKey;
  icon: LucideIcon;
  /** Visible in the sidebar as a muted "shadow" row that cannot be opened. */
  disabled?: boolean;
};

/** A labelled, collapsible group of nav items rendered in the sidebar. */
export type NavSection = { id: string; labelKey: MessageKey; items: NavItem[] };

/** Icon per route. Every registered route needs an entry or it falls back below. */
const ICONS: Record<string, LucideIcon> = {
  "/admin": LayoutDashboard,
  "/admin/operations": Activity,
  "/admin/audit": ShieldCheck,
  "/admin/resellers": Building,
  "/admin/agents": UserCheck,
  "/admin/plans": Layers,
  "/admin/commissions": TrendingUp,
  "/admin/controllers": Cpu,
  "/admin/network": Wifi,
  "/admin/payments": Receipt,
  "/admin/withdrawals": ArrowUpRight,
  "/admin/ledger": BookOpen,
  "/admin/listings": Briefcase,
  "/admin/hotspots": MapPin,
  "/admin/campaigns": Megaphone,
  "/admin/settings": Settings,
  "/admin/support": HelpCircle,
  "/reseller": LayoutDashboard,
  "/reseller/subscription": CreditCard,
  "/reseller/sites": Wifi,
  "/reseller/devices": Router,
  "/reseller/packages": Package,
  "/reseller/vouchers": Ticket,
  "/reseller/captive-portal": Palette,
  "/reseller/customers": Users,
  "/reseller/orders": Receipt,
  "/reseller/wallet": ArrowUpRight,
  "/reseller/support": HelpCircle,
  "/agent": LayoutDashboard,
  "/agent/leads": UserPlus,
  "/agent/commissions": TrendingUp,
  "/agent/wallet": ArrowUpRight,
  "/agent/support": HelpCircle,
};

export const HOME: Record<Role, string> = {
  ADMIN: "/admin",
  RESELLER: "/reseller",
  AGENT: "/agent",
};

function item(href: string, labelKey: MessageKey, opts?: { disabled?: boolean }): NavItem {
  return { href, labelKey, icon: ICONS[href] ?? LayoutDashboard, disabled: opts?.disabled };
}

/** The first item of every section — used to separate sections on the icon rail. */
function section(id: string, labelKey: MessageKey, items: NavItem[]): NavSection {
  return { id, labelKey, items };
}

/**
 * Navigation, grouped into labelled sections. The sidebar renders these as
 * collapsible groups (HeroUI `DisclosureGroup`); the icon-only rail flattens
 * them. Every route of a role appears exactly once across its sections.
 */
export const SECTIONS: Record<Role, NavSection[]> = {
  ADMIN: [
    section("monitor", "nav.group.monitoring", [
      item("/admin", "nav.overview"),
      item("/admin/operations", "nav.operations"),
      item("/admin/audit", "nav.auditLog"),
    ]),
    section("partners", "nav.group.partners", [
      item("/admin/resellers", "nav.resellers"),
      item("/admin/agents", "nav.agents"),
      item("/admin/plans", "nav.plans"),
      item("/admin/commissions", "nav.commissions"),
    ]),
    section("network", "nav.group.network", [
      item("/admin/controllers", "nav.controllers", { disabled: true }),
      item("/admin/network", "nav.sitesAndDevices"),
    ]),
    section("finance", "nav.group.finance", [
      item("/admin/payments", "nav.payments"),
      item("/admin/withdrawals", "nav.withdrawals"),
      item("/admin/ledger", "nav.ledger"),
    ]),
    section("system", "nav.group.system", [
      item("/admin/listings", "nav.listings"),
      item("/admin/hotspots", "nav.hotspots"),
      item("/admin/campaigns", "nav.campaigns"),
      item("/admin/settings", "nav.settings"),
      item("/admin/support", "nav.support"),
    ]),
  ],
  RESELLER: [
    section("business", "nav.group.business", [item("/reseller", "nav.overview")]),
    section("network", "nav.group.network", [
      item("/reseller/sites", "nav.sites"),
      item("/reseller/devices", "nav.devices"),
      item("/reseller/packages", "nav.packages"),
      item("/reseller/vouchers", "nav.vouchers"),
      item("/reseller/captive-portal", "nav.captivePortal"),
    ]),
    section("customers", "nav.group.customers", [item("/reseller/customers", "nav.customersAndAccess")]),
    section("billing", "nav.group.billing", [
      item("/reseller/orders", "nav.payments"),
      // Subscription sits directly under Payments so everything the reseller
      // owes or is owed reads as one block instead of being split in two.
      item("/reseller/subscription", "nav.subscription"),
      item("/reseller/wallet", "nav.withdraw"),
    ]),
    section("help", "nav.group.help", [item("/reseller/support", "nav.support")]),
  ],
  AGENT: [
    section("monitor", "nav.group.monitoring", [
      item("/agent", "nav.overview"),
      item("/agent/leads", "nav.leadsAndInvitations"),
    ]),
    section("earnings", "nav.group.earnings", [
      item("/agent/commissions", "nav.commissions"),
      item("/agent/wallet", "nav.withdraw"),
    ]),
    section("help", "nav.group.help", [item("/agent/support", "nav.support")]),
  ],
};

/** Flat route order for a role — used by the icon-only rail and tests. */
export const NAV: Record<Role, NavItem[]> = {
  ADMIN: SECTIONS.ADMIN.flatMap((s) => s.items),
  RESELLER: SECTIONS.RESELLER.flatMap((s) => s.items),
  AGENT: SECTIONS.AGENT.flatMap((s) => s.items),
};

/** Where the sidebar's "Help & info" footer link points for a role. */
export const HELP_HREF: Record<Role, string> = {
  ADMIN: "/admin/support",
  RESELLER: "/reseller/support",
  AGENT: "/agent/support",
};

/**
 * Whether `href` is the current page. The role home is matched exactly so the
 * overview link does not stay highlighted on every sibling route.
 */
export function isActive(pathname: string, href: string, home: string): boolean {
  return href === home ? pathname === href : pathname.startsWith(href);
}
