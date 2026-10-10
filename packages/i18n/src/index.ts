/**
 * Product translation catalogs.
 *
 * Design notes
 * ------------
 * - English is the **source of truth** and the default locale for the whole
 *   product. `en` therefore defines the `MessageKey` union, and every other
 *   catalog is typed as `Record<MessageKey, string>` — a missing translation is
 *   a compile error rather than a silent English leak.
 * - Keys are flat dotted strings (`nav.overview`, `reseller.overview.title`).
 *   That keeps one narrow, greppable union type instead of a nested type that
 *   would need recursive lookups at every call site.
 * - The guest-portal keys at the bottom of each catalog are unprefixed and kept
 *   verbatim for backward compatibility with `apps/portal`.
 */

import { adminScreensCatalog } from "./catalogs/adminScreens";
import { authCatalog } from "./catalogs/auth";
import { marketingCatalog } from "./catalogs/marketing";
import { resellerScreensCatalog } from "./catalogs/resellerScreens";

export type Locale = "en" | "sw";

export const LOCALES = ["en", "sw"] as const;

/**
 * English-first by design: the product is sold to Tanzanian WiFi operators who
 * read English day to day, and Swahili stays one tap away. Everything that
 * reads a locale — the web app, the guest portal, the API's cookie handling —
 * falls back to this value.
 */
export const DEFAULT_LOCALE: Locale = "en";

export type LocaleMeta = {
  code: Locale;
  /** Name in the language itself — what the switcher shows. */
  nativeName: string;
  /** Name in English, used when the current locale's script is unreadable. */
  englishName: string;
  /** BCP-47 tag for `<html lang>`. */
  htmlLang: string;
  /** Tag handed to `Intl` for dates, numbers and currency. */
  intlLocale: string;
};

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  en: {
    code: "en",
    nativeName: "English",
    englishName: "English",
    htmlLang: "en",
    intlLocale: "en-GB",
  },
  sw: {
    code: "sw",
    nativeName: "Kiswahili",
    englishName: "Swahili",
    htmlLang: "sw",
    intlLocale: "sw-TZ",
  },
};

/**
 * Where the chosen locale is persisted. The cookie is read on the server so the
 * first paint already carries the right language (no flash of English for a
 * Swahili reader); `localStorage` is the client-side mirror.
 */
export const LOCALE_COOKIE = "advo.lang";
export const LOCALE_STORAGE_KEY = "advo:lang";
/** One year, in seconds — a language choice is not a session. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "sw";
}

/**
 * Narrows untrusted input (a cookie, a query param, `localStorage`, a header
 * like `sw-TZ`) to a supported locale, falling back when it is absent or
 * unrecognised.
 */
export function resolveLocale(
  value: unknown,
  fallback: Locale = DEFAULT_LOCALE,
): Locale {
  if (typeof value !== "string") return fallback;
  const base = value.trim().toLowerCase().split(/[-_]/)[0];
  return isLocale(base) ? base : fallback;
}

const baseEn = {
  // ── Brand & shared chrome ────────────────────────────────────────────────
  "brand.name": "Advo TZ",
  "brand.product": "Smart WiFi OS",
  "common.retry": "Try again",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.search": "Search",
  "common.loading": "Loading…",
  "common.refresh": "Refresh dashboard",
  "common.print": "Print or save this page",
  "common.language": "Language",
  "common.languageSwitch": "Change language",
  "common.languageCurrent": "Current language: {language}",
  "common.copied": "Copied",
  "common.copy": "Copy",
  "common.close": "Close",
  "common.all": "All",
  "common.none": "None",
  "common.viewAll": "View all",
  "common.learnMore": "Learn more",
  "common.optional": "optional",

  // ── Navigation & sidebar ─────────────────────────────────────────────────
  "nav.main": "Main",
  "nav.mainMenu": "Main menu",
  "nav.openMenu": "Open menu",
  "nav.closeMenu": "Close menu",
  "nav.collapseMenu": "Collapse menu",
  "nav.expandMenu": "Expand menu",
  "nav.logout": "Log out",
  "nav.helpAndInfo": "Help & info",
  "nav.group.monitoring": "Monitoring",
  "nav.group.partners": "Partners",
  "nav.group.network": "Network",
  "nav.group.finance": "Finance",
  "nav.group.system": "System",
  "nav.group.business": "Business",
  "nav.group.customers": "Customers",
  "nav.group.billing": "Billing",
  "nav.group.help": "Help",
  "nav.group.earnings": "Earnings",
  "nav.overview": "Overview",
  "nav.subscription": "Subscription",
  "nav.sitesAndDevices": "Sites & devices",
  "nav.sites": "Sites",
  "nav.devices": "Devices",
  "nav.packages": "Packages",
  "nav.vouchers": "Vouchers",
  "nav.captivePortal": "Captive Portal",
  "nav.customersAndAccess": "Customers & access",
  "nav.payments": "Payments",
  "nav.wallet": "Wallet",
  "nav.support": "Support",
  "nav.resellers": "Resellers",
  "nav.agents": "Agents",
  "nav.plans": "Plans",
  "nav.commissions": "Commissions",
  "nav.controllers": "Controllers",
  "nav.withdrawals": "Withdrawals",
  "nav.ledger": "Ledger",
  "nav.settings": "Settings",
  "nav.operations": "Operations",
  "nav.auditLog": "Audit log",
  "nav.leadsAndInvitations": "Leads & invitations",
  "nav.listings": "Jobs & Opportunities",
  "nav.campaigns": "Ad campaigns",

  // ── Session shell ────────────────────────────────────────────────────────
  "shell.sessionFailed": "Could not load your session: {reason}",
  "shell.status.active": "Active",
  "account.state.PENDING_VERIFICATION": "Pending verification",
  "account.state.ACTIVE": "Active",
  "account.state.SUSPENDED": "Suspended",
  "subscription.state.NONE": "No plan",
  "subscription.state.TRIALING": "Free trial",
  "subscription.state.ACTIVE": "Subscribed",
  "subscription.state.PAST_DUE": "Payment overdue",
  "subscription.state.EXPIRED": "Expired",
  "subscription.state.SUSPENDED": "Suspended",
  "subscription.state.CANCELLED": "Cancelled",
  "lead.state.INVITED": "Invited",
  "lead.state.ACCEPTED": "Accepted",
  "lead.state.EXPIRED": "Expired",
  "lead.state.CANCELLED": "Cancelled",
  "commission.state.PENDING_HOLD": "On hold",
  "commission.state.AVAILABLE": "Available",
  "commission.state.RESERVED_FOR_WITHDRAWAL": "Reserved for withdrawal",
  "commission.state.PAID": "Paid",
  "commission.state.REVERSED": "Reversed",
  "commission.state.NEEDS_REVIEW": "Needs review",
  "commission.trigger.FIRST_SUBSCRIPTION_PAYMENT": "First subscription payment",
  "commission.trigger.SUBSCRIPTION_RENEWAL": "Subscription renewal",
  "shell.mfa.required.title": "Two-step verification required",
  "shell.mfa.required.body":
    "Sign out and sign in again with your authenticator code.",
  "shell.mfa.setup.title": "Set up two-step verification",
  "shell.mfa.setup.body":
    "Admin accounts must use an authenticator app (TOTP) before any admin screen is available.",
  "shell.mfa.generate": "Generate secret",
  "shell.mfa.preparing": "Preparing…",
  "shell.mfa.secretLabel": "Secret (enter in your authenticator app)",
  "shell.mfa.codeLabel": "6-digit code",
  "shell.mfa.enable": "Enable and continue",
  "shell.mfa.verifying": "Verifying…",

  // ── Shared reseller vocabulary ───────────────────────────────────────────
  "payment.state.PAID": "Paid",
  "payment.state.OVERPAID": "Overpaid",
  "payment.state.UNPAID": "Unpaid",
  "payment.state.CANCELLED": "Cancelled",
  "payment.state.REFUND_PENDING": "Refund pending",
  "payment.state.REFUNDED": "Refunded",
  "payment.state.NEEDS_REVIEW": "Needs review",
  "grant.state.PENDING_ACTIVATION": "Pending activation",
  "grant.state.ACTIVE": "Active",
  "grant.state.EXPIRED": "Expired",
  "grant.state.QUOTA_EXHAUSTED": "Quota exhausted",
  "grant.state.REVOKED": "Revoked",
  "grant.state.ACTIVATION_FAILED": "Activation failed",
  "device.state.RESERVED": "Reserved",
  "device.state.AUTHORIZING": "Authorizing",
  "device.state.AUTHORIZED": "Authorized",
  "device.state.UNKNOWN": "Unknown",
  "device.state.REVOKE_PENDING": "Revoke pending",
  "device.state.REVOKED": "Revoked",
  "device.state.FAILED": "Failed",
  "fulfillment.state.NOT_STARTED": "Not started",
  "fulfillment.state.PENDING": "Pending",
  "fulfillment.state.FULFILLED": "Fulfilled",
  "fulfillment.state.FAILED": "Failed",
  "fulfillment.state.NEEDS_REVIEW": "Needs review",
  "reseller.walkIn": "Walk-in guest",
  "reseller.vsYesterday": "vs yesterday",
  "reseller.vsLastWeek": "vs last week",
  "reseller.withdraw": "Withdraw",
  "reseller.filter.all": "All",
  "reseller.filter.paid": "Paid",
  "reseller.filter.attention": "Needs review",
  "reseller.search.label": "Search transactions",
  "reseller.search.placeholder": "Search phone, customer, package…",
  "reseller.col.transaction": "Transaction",
  "reseller.col.customer": "Customer",
  "reseller.col.package": "Package",
  "reseller.col.site": "Site",
  "reseller.col.time": "Time",
  "reseller.col.amount": "Amount (TZS)",
  "reseller.col.status": "Status",
  "reseller.col.date": "Date",
  "reseller.col.packageAndSite": "Package & site",
  "reseller.col.grant": "WiFi grant",
  "reseller.col.reference": "Reference",
  "reseller.col.state": "State",
  "reseller.col.devices": "Devices",
  "reseller.col.timeRemaining": "Time remaining",
  "reseller.col.totalPurchases": "Total purchases",
  "reseller.col.totalPaid": "Total paid",
  "reseller.col.lastPurchase": "Last purchase",

  // ── Reseller · payments (orders) ─────────────────────────────────────────
  "reseller.orders.badge": "Financial ledger & reconciliation",
  "reseller.orders.subtitle":
    "Guest payments are confirmed only by the payment provider. Net earnings are credited to your wallet.",
  "reseller.orders.kpi.grossVolume": "Gross volume",
  "reseller.orders.kpi.grossVolumeHint": "Paid & overpaid mobile payments",
  "reseller.orders.kpi.paidOrders": "Paid orders",
  "reseller.orders.kpi.paidOrdersHint": "Paid or overpaid checkouts",
  "reseller.orders.kpi.pending": "Pending",
  "reseller.orders.kpi.pendingHint": "Awaiting payment confirmation",
  "reseller.orders.kpi.attempts": "Total attempts",
  "reseller.orders.kpi.attemptsHint": "All checkout transactions",
  "reseller.orders.tableLabel": "Guest payments",
  "reseller.orders.empty": "No guest payment matches your filter.",

  // ── Reseller · customers & access ────────────────────────────────────────
  "reseller.customers.badge": "Session monitoring & directory",
  "reseller.customers.sync": "Live RADIUS sync",
  "reseller.customers.subtitle":
    "Access expiry is fixed at first activation and never extended by reconnects.",
  "reseller.customers.kpi.activeSessions": "Active sessions",
  "reseller.customers.kpi.activeSessionsHint": "Currently connected guests",
  "reseller.customers.kpi.onlineDevices": "Online devices",
  "reseller.customers.kpi.onlineDevicesHint": "Authenticated MAC addresses",
  "reseller.customers.kpi.registeredUsers": "Registered users",
  "reseller.customers.kpi.registeredUsersHint": "Unique guest phone records",
  "reseller.customers.kpi.totalSpend": "Total spend",
  "reseller.customers.kpi.totalSpendHint": "Cumulative sales",
  "reseller.customers.guestAccess.title": "Guest access",
  "reseller.customers.guestAccess.description":
    "Active and recent WiFi authorization sessions",
  "reseller.customers.guestAccess.tableLabel": "Guest access grants",
  "reseller.customers.guestAccess.empty": "No guest access yet.",
  "reseller.customers.directory.title": "Customers",
  "reseller.customers.directory.description":
    "Directory of registered guests and spending metrics",
  "reseller.customers.directory.tableLabel": "Customers",
  "reseller.customers.directory.empty": "No paying customers yet.",
  "reseller.customers.source.mobilePayment": "Mobile payment",
  "reseller.customers.source.voucher": "Voucher",
  "reseller.customers.deviceSlots": "{used} / {total} device slots used",
  "reseller.customers.ordersCount": "{count} order",
  "reseller.customers.ordersCountPlural": "{count} orders",
  "reseller.customers.guest": "Guest",
  "reseller.customers.revoke": "Revoke",
  "reseller.customers.revokeReason": "Reason for revoking this guest's access",
  "reseller.customers.remaining.notStarted": "not started",
  "reseller.customers.remaining.ended": "ended",
  "reseller.customers.remaining.minutes": "{minutes}m left",
  "reseller.customers.remaining.hours": "{hours}h {minutes}m left",

  // ── Reseller · overview ──────────────────────────────────────────────────
  "reseller.overview.activePortal": "Active portal",
  "reseller.overview.subtitle":
    "Measured on Dar es Salaam time (EAT). Sales are the guest's gross payment; net earnings land in your wallet.",
  "reseller.overview.accountStatus": "Account status: {status}.",
  "reseller.overview.accountStatusNote":
    "Some services unlock once the account is verified.",
  "reseller.overview.verifyNow": "Verify now",
  "reseller.overview.pastDue":
    "Your platform subscription payment is overdue. Pay to keep your guests online without interruption.",
  "reseller.overview.payNow": "Pay now",
  "reseller.overview.expired":
    "Your platform subscription has ended. New WiFi sales are paused for now.",
  "reseller.overview.restart": "Restart subscription",
  "reseller.overview.checklist.title": "Network setup checklist",
  "reseller.overview.checklist.body":
    "Finish these steps to start selling packages and receiving payments directly.",
  "reseller.overview.checklist.progress": "{done} of {total} completed",
  "reseller.overview.step.plan": "Choose a platform plan",
  "reseller.overview.step.site": "Register your first site",
  "reseller.overview.step.device": "Connect an Omada access point",
  "reseller.overview.step.package": "Create WiFi packages",
  "reseller.overview.step.done": "Done",
  "reseller.overview.step.configure": "Click to set up",
  "reseller.overview.kpi.revenueToday": "Revenue (today)",
  "reseller.overview.kpi.revenueHint": "{count} transactions paid today",
  "reseller.overview.kpi.wallet": "Wallet",
  "reseller.overview.kpi.walletHint": "{amount} awaiting settlement",
  "reseller.overview.kpi.salesToday": "Sales (today)",
  "reseller.overview.kpi.salesHint": "{amount} in total sales",
  "reseller.overview.kpi.activeUsers": "Active users",
  "reseller.overview.kpi.activeUsersHint":
    "{sites} sites · {devices} AP devices",
  "reseller.overview.trend.title": "Sales trend",
  "reseller.overview.trend.description": "Paid transactions per day",
  "reseller.overview.trend.window": "{amount} · {days} days",
  "reseller.overview.trend.last7": "Last 7 days",
  "reseller.overview.mix.title": "Payment status",
  "reseller.overview.mix.description": "Transactions by payment state",
  "reseller.overview.mix.centerLabel": "transactions",
  "reseller.overview.mix.needsReview": "Transactions needing review",
  "reseller.overview.bySite.title": "Sales by site",
  "reseller.overview.bySite.description": "Paid sales for each site",
  "reseller.overview.byPackage.title": "Package breakdown",
  "reseller.overview.byPackage.description": "Best-selling packages",
  "reseller.overview.rankings.empty": "No paid sales yet.",
  "reseller.overview.recent.title": "Recent transactions",
  "reseller.overview.recent.empty": "No transaction matches this filter.",
  "reseller.overview.recent.tableLabel": "Recent transactions",
  "reseller.overview.recent.showing":
    "Showing the {count} most recent transactions",
  "reseller.overview.recent.filtered": " · {count} after filtering",
  "reseller.overview.recent.viewAll": "View all transactions",
  "reseller.overview.sites.title": "WiFi sites & hotspots",
  "reseller.overview.sites.description":
    "Open the captive portal for each of your sites",
  "reseller.overview.sites.register": "Register a new site",
  "reseller.overview.sites.portal": "Captive portal",
  "reseller.overview.sites.empty.title": "No sites registered yet",
  "reseller.overview.sites.empty.body":
    "Register your first site to start selling WiFi packages to your guests.",
  "reseller.overview.sites.empty.cta": "Register your first site",
  "reseller.overview.printHint":
    "Use the print button above to save this page as a PDF.",

  // ── Marketing ────────────────────────────────────────────────────────────
  "marketing.banner.new": "NEW",
  "marketing.banner.body":
    "Connect TP-Link Omada SDN with instant payments from M-Pesa, Tigo Pesa, Airtel Money & Halopesa.",
  "marketing.banner.bodyShort": "TP-Link Omada + Mobile Money TZ WiFi billing",
  "marketing.banner.cta": "Start free",
  "marketing.nav.features": "Features",
  "marketing.nav.howItWorks": "How it works",
  "marketing.nav.customers": "Our customers",
  "marketing.nav.calculator": "Revenue calculator",
  "marketing.nav.pricing": "Packages & pricing",
  "marketing.nav.contact": "Contact us",
  "marketing.header.login": "Log in",
  "marketing.header.loginDashboard": "Log in to dashboard",
  "marketing.header.register": "Register your WiFi",
  "marketing.header.registerFree": "Start using Advo TZ free",
  "marketing.nav.solutions": "Solutions",
  "marketing.nav.primary": "Primary navigation",
  "marketing.home.integrations.label": "Works with the tools you already use",
  "marketing.home.stats.eyebrow": "Built for trust",
  "marketing.home.stats.title": "Numbers our customers count on every day",
  "marketing.home.pricing.compare": "Compare all plans & features",

  // ── Guest portal ─────────────────────────────────────────────────────────
  brand: "Advo TZ",
  tagline: "Smart WiFi Billing & Network Management",
  login: "Log in",
  register: "Register your WiFi business",
  email: "Email",
  password: "Password",
  businessName: "Business name",
  ownerName: "Owner name",
  phone: "Phone (+255…)",
  referralCodeOptional: "Agent referral code (optional)",
  acceptTerms: "I accept the terms of service",
  choosePackage: "Choose your package.",
  enterPaymentPhone: "Enter the phone number for payment.",
  confirmPaymentPrompt: "Confirm the payment request on your phone.",
  paymentReceivedConnecting: "Payment received. Connecting your WiFi.",
  wifiReady: "Your WiFi is ready to use.",
  paymentReceivedActivating:
    "We received payment, but WiFi activation is still in progress.",
  voucherUsedOrExpired: "This voucher has already been used or has expired.",
  price: "Price",
  duration: "Duration",
  speed: "Speed",
  data: "Data",
  unlimitedData: "Unlimited data",
  devices: "Devices",
  upTo: "up to",
  buy: "Buy",
  pay: "Pay now",
  sending: "Sending…",
  mobileMoneyNumber: "Mobile money number",
  haveVoucher: "Have a voucher?",
  voucherCode: "Voucher code",
  redeem: "Use voucher",
  back: "Back",
  notAvailable: "WiFi sales are not available at this location right now.",
  noPackages: "No packages are available right now.",
  openFromWifi:
    "Connect to this WiFi network and open the login page to buy access.",
  contextExpired:
    "Your session expired. Reconnect to the WiFi to reopen the login page.",
  paymentPending: "Waiting for payment confirmation…",
  paymentFailed: "Payment was not completed.",
  tryAgain: "Try again",
  activationFailed:
    "We received payment but could not connect your device. Contact support with your reference.",
  needsReview:
    "Your payment is being checked. Contact support with your reference if this takes long.",
  remaining: "Time remaining",
  expiresAt: "Expires",
  continueBrowsing: "Continue browsing",
  reference: "Reference",
  keepReference: "Keep this page or reference to reconnect later.",
  connectThisDevice: "Connect this device",
  accessStatus: "Access status",
  accessEnded: "This access has ended.",
  support: "Need help? Show this reference to the WiFi owner.",
  deviceLimit: "Device limit reached for this package.",

  // ── Guest portal · journey (Choose → Pay → Connect) ──────────────────────
  "portal.advertBadge": "Advertisement",
  "portal.advertSlideAria": "Slide {n}",
  "portal.sponsoredChip": "Sponsored",
  "portal.card.upTo": "Up to {speed}",
  "portal.card.allowance": "{data} data",
  "portal.card.deviceOne": "{count} device",
  "portal.card.deviceMany": "{count} devices",
  "portal.advertPrev": "Previous advert",
  "portal.advertNext": "Next advert",
  "portal.advertPause": "Pause adverts",
  "portal.advertPlay": "Play adverts",
  "portal.advertPosition": "{current} / {total}",
  "portal.advertTapToView": "Tap for offer & details",
  "portal.advertShareAction": "Share offer",
  "portal.advertShareWhatsApp": "Share on WhatsApp",
  "portal.advertCopyInfo": "Copy details",
  "portal.advertCopied": "Copied!",
  "portal.advertCall": "Call",
  "portal.advertWhatsApp": "WhatsApp",
  "portal.advertClose": "Close",
  "portal.advertWifiNotice": "Full internet and website browsing is unlocked as soon as you connect to WiFi.",
  "portal.sponsoredBadge": "Sponsored advertisement",
  "portal.sponsoredCredit": "Sponsored picks near you",
  "portal.selectPackage": "Choose plan",
  "portal.voucherUnavailable":
    "Voucher login is not available at this WiFi location.",
  "portal.voucherSectionTitle": "Have a WiFi Voucher?",
  "portal.voucherSectionSubtitle":
    "Enter your voucher code to connect instantly without online payment.",
  "portal.voucherPlaceholder": "e.g. 2ABC-4DEF-6GHK",
  "portal.voucherSubmit": "Connect with Voucher",
  "portal.voucherOr": "Or connect using a voucher",
  "portal.voucherSubmitting": "Verifying voucher…",
  "portal.loadFailed":
    "We could not load this WiFi location. This is usually temporary.",
  "portal.retry": "Try again",
  "portal.chooseTitle": "Choose your package",
  "portal.chooseLead": "Select the access time that suits you.",
  "portal.payTitle": "Complete your payment",
  "portal.youAreBuying": "You are buying",
  "portal.changePackage": "Choose a different package",
  "portal.payWithMobileMoney": "Pay with mobile money",
  "portal.networkVodacom": "Vodacom",
  "portal.networkAirtel": "Airtel",
  "portal.networkYas": "Yas",
  "portal.networkDetected": "We detected {network} from your number.",
  "portal.connectedTitle": "You’re connected!",
  "portal.connectedLead": "Your WiFi session is active.",
  "portal.previewNote": "Preview: this is the screen your guest sees after paying.",
  "portal.activePackage": "Active package",
  "portal.browseInternet": "Start browsing the web",
  "portal.exploreWeb": "Explore the Web",
  "portal.exploreWebSubtitle": "Instant access to popular apps & online services",
  "portal.exploreLocal": "Explore Local Services & Offers",
  "portal.exploreLocalSubtitle": "Curated spots and essentials in your area",
  "portal.allCategories": "All",
  "portal.foodDrinks": "Food & Cafes",
  "portal.shopsServices": "Shops & Services",
  "portal.techGadgets": "Tech & Phones",
  "portal.speedTest": "Speed Test",
  "portal.wifiActiveStatus": "High-speed internet active & ready",
  "portal.openNow": "Open Now",
  "portal.exploreTitle": "Explore…",
  "portal.exploreSeeAll": "See all",
  "portal.exploreEmpty": "No featured businesses yet.",
  "portal.businessExplore": "Explore",
  "portal.exploreSoon": "More about {business} is coming soon.",
  "portal.visitWebsite": "Visit {site}",
  "portal.jobsOpportunities": "Jobs & Opportunities",
  "portal.promoteBusiness": "Promote your business",
  "portal.startOver": "Start over",
  "portal.poweredBy": "Powered by {brand} · Tanzania",
  "portal.helpWhatsapp": "Help / WhatsApp",
  "portal.supportTitle": "Customer help",
  "portal.supportLead": "Talk to the WiFi team if you need a hand.",
  "portal.supportCall": "Call now",
  "portal.supportWhatsapp": "WhatsApp",
  "portal.jobs": "Jobs",
  "portal.opportunities": "Opportunities",
  "portal.jobsLead": "Discover your next opportunity.",
  "portal.jobsPreviewNote":
    "Live vacancies and opportunities from our partners.",
  "portal.jobsEmpty": "No listings are available right now.",
  "portal.jobViewApply": "View & Apply",
  "portal.jobViewOpportunity": "View opportunity",
  "portal.jobApplyContinue": "Continue to the provider",
  "portal.jobBack": "Back to list",
  "portal.jobClosing": "Closing date is set by the provider.",
  "portal.jobType": "Type",
  "portal.promotionTitle": "Promote your business",
  "portal.promotionLead":
    "Choose how long you want your banner promotion to run.",
  "portal.promotionPriceNote":
    "Example prices for this page — final rates to be agreed.",
  "portal.promotionWeekly": "Weekly packages",
  "portal.promotionQuarterly": "Quarterly packages",
  "portal.promotionChoose": "Choose {duration}, example price {price}",
  "portal.promotionSelected": "Selected",
  "portal.promotionChange": "Change package",
  "portal.promotionName": "Your full name",
  "portal.promotionMobile": "Mobile number",
  "portal.promotionEmail": "Email (optional)",
  "portal.promotionBusiness": "Business name",
  "portal.promotionLocation": "Business location",
  "portal.promotionLocationPlaceholder": "Area / street / nearby landmark",
  "portal.promotionDescription": "What does your business do?",
  "portal.promotionOffer": "What would you like to promote?",
  "portal.promotionSubmit": "Submit promotion request",
  "portal.promotionSubmitting": "Sending…",
  "portal.promotionSuccessTitle": "Request received",
  "portal.promotionSuccessBody":
    "The WiFi owner will contact you about your banner promotion.",
  "portal.promotionAnother": "Send another request",
  "portal.promotionBack": "Back to the connected page",
  "portal.promotionRequired": "Please fill in this field.",
  "portal.close": "Close",
  language: "Kiswahili",
} as const;

export type BaseMessageKey = keyof typeof baseEn;

/**
 * The full key union: the shared catalog plus every feature catalog. Adding a
 * namespace file here is all it takes to widen `MessageKey`.
 */
const en = {
  ...baseEn,
  ...adminScreensCatalog.en,
  ...resellerScreensCatalog.en,
  ...authCatalog.en,
  ...marketingCatalog.en,
} as const;

export type MessageKey = keyof typeof en;

const baseSw: Record<BaseMessageKey, string> = {
  "brand.name": "Advo TZ",
  "brand.product": "Smart WiFi OS",
  "common.retry": "Jaribu tena",
  "common.cancel": "Ghairi",
  "common.save": "Hifadhi",
  "common.search": "Tafuta",
  "common.loading": "Inapakia…",
  "common.refresh": "Sasisha dashibodi",
  "common.print": "Chapisha au hifadhi ukurasa",
  "common.language": "Lugha",
  "common.languageSwitch": "Badilisha lugha",
  "common.languageCurrent": "Lugha ya sasa: {language}",
  "common.copied": "Imenakiliwa",
  "common.copy": "Nakili",
  "common.close": "Funga",
  "common.all": "Zote",
  "common.none": "Hakuna",
  "common.viewAll": "Tazama zote",
  "common.learnMore": "Jifunze zaidi",
  "common.optional": "si lazima",

  "nav.main": "Kuu",
  "nav.mainMenu": "Menyu kuu",
  "nav.openMenu": "Fungua menyu",
  "nav.closeMenu": "Funga menyu",
  "nav.collapseMenu": "Kunja menyu",
  "nav.expandMenu": "Panua menyu",
  "nav.logout": "Toka",
  "nav.helpAndInfo": "Msaada & Taarifa",
  "nav.group.monitoring": "Ufuatiliaji",
  "nav.group.partners": "Washirika",
  "nav.group.network": "Mtandao",
  "nav.group.finance": "Fedha",
  "nav.group.system": "Mfumo",
  "nav.group.business": "Biashara",
  "nav.group.customers": "Wateja",
  "nav.group.billing": "Fedha",
  "nav.group.help": "Msaada",
  "nav.group.earnings": "Mapato",
  "nav.overview": "Muhtasari",
  "nav.subscription": "Usajili",
  "nav.sitesAndDevices": "Eneo & vifaa",
  "nav.sites": "Maeneo",
  "nav.devices": "Vifaa",
  "nav.packages": "Vifurushi",
  "nav.vouchers": "Vocha",
  "nav.captivePortal": "Portal ya Wageni",
  "nav.customersAndAccess": "Wateja & ufikiaji",
  "nav.payments": "Malipo",
  "nav.wallet": "Pochi",
  "nav.support": "Msaada",
  "nav.resellers": "Wauzaji",
  "nav.agents": "Mawakala",
  "nav.plans": "Mipango",
  "nav.commissions": "Kamisheni",
  "nav.controllers": "Vidhibiti",
  "nav.withdrawals": "Utoaji",
  "nav.ledger": "Leja",
  "nav.settings": "Mipangilio",
  "nav.operations": "Uendeshaji",
  "nav.auditLog": "Kumbukumbu za ukaguzi",
  "nav.leadsAndInvitations": "Wateja tarajali & mialiko",
  "nav.listings": "Kazi & Fursa",
  "nav.campaigns": "Kampeni za matangazo",

  "shell.sessionFailed": "Imeshindwa kupakia kipindi chako: {reason}",
  "shell.status.active": "Hai",
  "account.state.PENDING_VERIFICATION": "Inasubiri uthibitisho",
  "account.state.ACTIVE": "Hai",
  "account.state.SUSPENDED": "Imesimamishwa",
  "subscription.state.NONE": "Hakuna kifurushi",
  "subscription.state.TRIALING": "Jaribio la bure",
  "subscription.state.ACTIVE": "Amejisajili",
  "subscription.state.PAST_DUE": "Malipo yamechelewa",
  "subscription.state.EXPIRED": "Imeisha muda",
  "subscription.state.SUSPENDED": "Imesimamishwa",
  "subscription.state.CANCELLED": "Imesitishwa",
  "lead.state.INVITED": "Amealikwa",
  "lead.state.ACCEPTED": "Amekubali",
  "lead.state.EXPIRED": "Imeisha muda",
  "lead.state.CANCELLED": "Imesitishwa",
  "commission.state.PENDING_HOLD": "Inasubiri kipindi",
  "commission.state.AVAILABLE": "Inapatikana",
  "commission.state.RESERVED_FOR_WITHDRAWAL": "Imetengwa kwa uondoaji",
  "commission.state.PAID": "Imelipwa",
  "commission.state.REVERSED": "Imerejeshwa",
  "commission.state.NEEDS_REVIEW": "Inahitaji ukaguzi",
  "commission.trigger.FIRST_SUBSCRIPTION_PAYMENT":
    "Malipo ya kwanza ya kifurushi",
  "commission.trigger.SUBSCRIPTION_RENEWAL": "Uhuishaji wa kifurushi",
  "shell.mfa.required.title": "Uthibitisho wa hatua mbili unahitajika",
  "shell.mfa.required.body":
    "Toka kisha ingia tena ukitumia namba yako ya kithibitishaji.",
  "shell.mfa.setup.title": "Sanidi uthibitisho wa hatua mbili",
  "shell.mfa.setup.body":
    "Akaunti za msimamizi lazima zitumie programu ya kithibitishaji (TOTP) kabla ya skrini yoyote ya msimamizi kufunguka.",
  "shell.mfa.generate": "Tengeneza siri",
  "shell.mfa.preparing": "Inatayarisha…",
  "shell.mfa.secretLabel": "Siri (weka kwenye programu yako ya kithibitishaji)",
  "shell.mfa.codeLabel": "Namba ya tarakimu 6",
  "shell.mfa.enable": "Washa na uendelee",
  "shell.mfa.verifying": "Inathibitisha…",

  "payment.state.PAID": "Imelipwa",
  "payment.state.OVERPAID": "Imelipwa (zaidi)",
  "payment.state.UNPAID": "Haijalipwa",
  "payment.state.CANCELLED": "Imefutwa",
  "payment.state.REFUND_PENDING": "Inasubiri marejesho",
  "payment.state.REFUNDED": "Imerejeshwa",
  "payment.state.NEEDS_REVIEW": "Inahitaji ukaguzi",
  "grant.state.PENDING_ACTIVATION": "Inasubiri kuamilishwa",
  "grant.state.ACTIVE": "Hai",
  "grant.state.EXPIRED": "Imeisha muda",
  "grant.state.QUOTA_EXHAUSTED": "Kikomo cha data kimeisha",
  "grant.state.REVOKED": "Imefutwa",
  "grant.state.ACTIVATION_FAILED": "Kuamilisha kumeshindikana",
  "device.state.RESERVED": "Imehifadhiwa",
  "device.state.AUTHORIZING": "Inaidhinisha",
  "device.state.AUTHORIZED": "Imeidhinishwa",
  "device.state.UNKNOWN": "Haijulikani",
  "device.state.REVOKE_PENDING": "Inasubiri kufutwa",
  "device.state.REVOKED": "Imefutwa",
  "device.state.FAILED": "Imeshindikana",
  "fulfillment.state.NOT_STARTED": "Haijaanza",
  "fulfillment.state.PENDING": "Inasubiri",
  "fulfillment.state.FULFILLED": "Imekamilika",
  "fulfillment.state.FAILED": "Imeshindikana",
  "fulfillment.state.NEEDS_REVIEW": "Inahitaji ukaguzi",
  "reseller.walkIn": "Mgeni (Walk-in)",
  "reseller.vsYesterday": "vs jana",
  "reseller.vsLastWeek": "vs wiki iliyopita",
  "reseller.withdraw": "Toa Pesa",
  "reseller.filter.all": "Zote",
  "reseller.filter.paid": "Zilizolipwa",
  "reseller.filter.attention": "Ukaguzi",
  "reseller.search.label": "Tafuta miamala",
  "reseller.search.placeholder": "Tafuta namba, mteja, kifurushi…",
  "reseller.col.transaction": "Muamala",
  "reseller.col.customer": "Mteja",
  "reseller.col.package": "Kifurushi",
  "reseller.col.site": "Eneo",
  "reseller.col.time": "Muda",
  "reseller.col.amount": "Kiasi (TZS)",
  "reseller.col.status": "Hali",
  "reseller.col.date": "Tarehe",
  "reseller.col.packageAndSite": "Kifurushi & eneo",
  "reseller.col.grant": "Ufikiaji wa WiFi",
  "reseller.col.reference": "Kumbukumbu",
  "reseller.col.state": "Hali",
  "reseller.col.devices": "Vifaa",
  "reseller.col.timeRemaining": "Muda uliobaki",
  "reseller.col.totalPurchases": "Jumla ya manunuzi",
  "reseller.col.totalPaid": "Jumla iliyolipwa",
  "reseller.col.lastPurchase": "Manunuzi ya mwisho",

  "reseller.orders.badge": "Leja ya fedha & urekebishaji",
  "reseller.orders.subtitle":
    "Malipo ya wateja yanathibitishwa na mtoa huduma wa malipo pekee. Mapato halisi yanaingia kwenye pochi yako.",
  "reseller.orders.kpi.grossVolume": "Mapato ghafi",
  "reseller.orders.kpi.grossVolumeHint": "Malipo ya simu yaliyolipwa na kuzidi",
  "reseller.orders.kpi.paidOrders": "Oda zilizolipwa",
  "reseller.orders.kpi.paidOrdersHint": "Malipo yaliyolipwa au kuzidi",
  "reseller.orders.kpi.pending": "Inasubiri",
  "reseller.orders.kpi.pendingHint": "Inasubiri uthibitisho wa malipo",
  "reseller.orders.kpi.attempts": "Jumla ya majaribio",
  "reseller.orders.kpi.attemptsHint": "Miamala yote ya malipo",
  "reseller.orders.tableLabel": "Malipo ya wageni",
  "reseller.orders.empty":
    "Hakuna malipo ya mgeni yanayolingana na kichujio chako.",

  "reseller.customers.badge": "Ufuatiliaji wa vikao & saraka",
  "reseller.customers.sync": "Usawazishaji wa RADIUS moja kwa moja",
  "reseller.customers.subtitle":
    "Muda wa ufikiaji hubainishwa wakati wa kuamilisha mara ya kwanza na hauongezwi kwa kuunganisha tena.",
  "reseller.customers.kpi.activeSessions": "Vikao hai",
  "reseller.customers.kpi.activeSessionsHint": "Wageni waliounganishwa sasa",
  "reseller.customers.kpi.onlineDevices": "Vifaa mtandaoni",
  "reseller.customers.kpi.onlineDevicesHint": "Anwani za MAC zilizoidhinishwa",
  "reseller.customers.kpi.registeredUsers": "Watumiaji waliosajiliwa",
  "reseller.customers.kpi.registeredUsersHint": "Kumbukumbu za namba za wageni",
  "reseller.customers.kpi.totalSpend": "Jumla ya matumizi",
  "reseller.customers.kpi.totalSpendHint": "Mauzo ya jumla",
  "reseller.customers.guestAccess.title": "Ufikiaji wa wageni",
  "reseller.customers.guestAccess.description":
    "Vikao vya uidhinishaji vya WiFi vya sasa na vya hivi karibuni",
  "reseller.customers.guestAccess.tableLabel": "Ruhusa za ufikiaji wa wageni",
  "reseller.customers.guestAccess.empty": "Hakuna ufikiaji wa mgeni bado.",
  "reseller.customers.directory.title": "Wateja",
  "reseller.customers.directory.description":
    "Saraka ya wageni waliosajiliwa na vipimo vya matumizi",
  "reseller.customers.directory.tableLabel": "Wateja",
  "reseller.customers.directory.empty": "Hakuna mteja anayelipa bado.",
  "reseller.customers.source.mobilePayment": "Malipo ya simu",
  "reseller.customers.source.voucher": "Vocha",
  "reseller.customers.deviceSlots":
    "{used} / {total} nafasi za vifaa zimetumika",
  "reseller.customers.ordersCount": "Oda {count}",
  "reseller.customers.ordersCountPlural": "Oda {count}",
  "reseller.customers.guest": "Mgeni",
  "reseller.customers.revoke": "Futa ruhusa",
  "reseller.customers.revokeReason": "Sababu ya kufuta ufikiaji wa mgeni huyu",
  "reseller.customers.remaining.notStarted": "haijaanza",
  "reseller.customers.remaining.ended": "imeisha",
  "reseller.customers.remaining.minutes": "Dakika {minutes} zimebaki",
  "reseller.customers.remaining.hours": "Saa {hours} dakika {minutes} zimebaki",

  "reseller.overview.activePortal": "Portal hai",
  "reseller.overview.subtitle":
    "Leo inapimwa kwa saa za Dar es Salaam (EAT). Mauzo ni malipo ghafi ya wateja; mapato halisi yanaingia kwenye wallet.",
  "reseller.overview.accountStatus": "Hali ya akaunti: {status}.",
  "reseller.overview.accountStatusNote":
    "Baadhi ya huduma zitafunguka pindi akaunti inapothibitishwa.",
  "reseller.overview.verifyNow": "Thibitisha sasa",
  "reseller.overview.pastDue":
    "Usajili wako wa mfumo umepita muda wake wa kulipwa. Lipia ili wateja wasipate usumbufu wa mtandao.",
  "reseller.overview.payNow": "Lipia sasa",
  "reseller.overview.expired":
    "Usajili wako wa mfumo umeisha. Mauzo mapya ya WiFi yamesimamishwa kwa muda.",
  "reseller.overview.restart": "Anzisha upya usajili",
  "reseller.overview.checklist.title":
    "Hatua za Kukamilisha Usanidi wa Mtandao",
  "reseller.overview.checklist.body":
    "Kamilisha hatua hizi ili uanze kuuza vifurushi na kupokea malipo moja kwa moja.",
  "reseller.overview.checklist.progress": "{done} kati ya {total} zimekamilika",
  "reseller.overview.step.plan": "Chagua kifurushi cha jukwaa",
  "reseller.overview.step.site": "Sajili eneo lako la kwanza (Site)",
  "reseller.overview.step.device": "Unganisha Access Point ya Omada",
  "reseller.overview.step.package": "Tengeneza vifurushi vya WiFi",
  "reseller.overview.step.done": "Tayari",
  "reseller.overview.step.configure": "Bofya kusanidi",
  "reseller.overview.kpi.revenueToday": "Mapato (leo)",
  "reseller.overview.kpi.revenueHint": "{count} miamala imelipwa leo",
  "reseller.overview.kpi.wallet": "Pochi",
  "reseller.overview.kpi.walletHint": "{amount} inasubiri settlement",
  "reseller.overview.kpi.salesToday": "Mauzo (leo)",
  "reseller.overview.kpi.salesHint": "{amount} jumla ya mauzo yote",
  "reseller.overview.kpi.activeUsers": "Watumiaji Hai",
  "reseller.overview.kpi.activeUsersHint":
    "{sites} maeneo · {devices} vifaa vya AP",
  "reseller.overview.trend.title": "Mwenendo wa Mauzo",
  "reseller.overview.trend.description": "Malipo yaliyolipwa kwa siku",
  "reseller.overview.trend.window": "{amount} · siku {days}",
  "reseller.overview.trend.last7": "Siku 7 za mwisho",
  "reseller.overview.mix.title": "Hali ya Malipo",
  "reseller.overview.mix.description": "Mgawanyo wa miamala kwa hali ya malipo",
  "reseller.overview.mix.centerLabel": "miamala",
  "reseller.overview.mix.needsReview": "Miamala inayohitaji ukaguzi",
  "reseller.overview.bySite.title": "Mauzo kwa Eneo (Site)",
  "reseller.overview.bySite.description": "Mauzo yaliyolipwa kwa kila eneo",
  "reseller.overview.byPackage.title": "Mchanganuo wa Vifurushi",
  "reseller.overview.byPackage.description": "Vifurushi vinavyouzwa zaidi",
  "reseller.overview.rankings.empty": "Hakuna mauzo yaliyolipwa bado.",
  "reseller.overview.recent.title": "Miamala ya Hivi Karibuni",
  "reseller.overview.recent.empty":
    "Hakuna muamala unaolingana na kichujio hiki.",
  "reseller.overview.recent.tableLabel": "Miamala ya hivi karibuni",
  "reseller.overview.recent.showing":
    "Inaonyesha miamala {count} ya hivi karibuni",
  "reseller.overview.recent.filtered": " · {count} baada ya kuchuja",
  "reseller.overview.recent.viewAll": "Tazama miamala yote",
  "reseller.overview.sites.title": "Maeneo ya WiFi (Sites & Hotspots)",
  "reseller.overview.sites.description":
    "Tazama kurasa za kuingilia za captive portal kwa kila eneo lako",
  "reseller.overview.sites.register": "Sajili eneo jipya",
  "reseller.overview.sites.portal": "Captive portal",
  "reseller.overview.sites.empty.title": "Hakuna eneo lililosajiliwa",
  "reseller.overview.sites.empty.body":
    "Sajili eneo lako la kwanza ili kuanza kuuza vifurushi vya WiFi kwa wateja.",
  "reseller.overview.sites.empty.cta": "Sajili eneo la kwanza",
  "reseller.overview.printHint":
    "Tumia kitufe cha kuchapisha juu ili kuhifadhi ukurasa huu kama PDF.",

  "marketing.banner.new": "MPYA",
  "marketing.banner.body":
    "Unganisha TP-Link Omada SDN na malipo ya papo hapo ya M-Pesa, Tigo Pesa, Airtel Money & Halopesa.",
  "marketing.banner.bodyShort": "TP-Link Omada + Malipo ya Simu TZ kwa WiFi",
  "marketing.banner.cta": "Anza Bure",
  "marketing.nav.features": "Vipengele",
  "marketing.nav.howItWorks": "Jinsi Inavyofanya Kazi",
  "marketing.nav.customers": "Wateja Wetu",
  "marketing.nav.calculator": "Kikokotoo cha Mapato",
  "marketing.nav.pricing": "Vifurushi & Bei",
  "marketing.nav.contact": "Wasiliana Nasi",
  "marketing.header.login": "Ingia",
  "marketing.header.loginDashboard": "Ingia kwenye Dashboard",
  "marketing.header.register": "Sajili WiFi Yako",
  "marketing.header.registerFree": "Anza Kutumia Advo TZ Bure",
  "marketing.nav.solutions": "Suluhisho",
  "marketing.nav.primary": "Menyu kuu",
  "marketing.home.integrations.label":
    "Inafanya kazi na zana unazotumia tayari",
  "marketing.home.stats.eyebrow": "Imejengwa kwa uaminifu",
  "marketing.home.stats.title":
    "Namba ambazo wateja wetu wanazitegemea kila siku",
  "marketing.home.pricing.compare": "Linganisha vifurushi vyote na vipengele",

  brand: "Advo TZ",
  tagline: "Malipo ya WiFi na Usimamizi wa Mtandao",
  login: "Ingia",
  register: "Sajili biashara yako ya WiFi",
  email: "Barua pepe",
  password: "Nenosiri",
  businessName: "Jina la biashara",
  ownerName: "Jina la mmiliki",
  phone: "Simu (+255…)",
  referralCodeOptional: "Namba ya rufaa ya Agent (si lazima)",
  acceptTerms: "Nakubali masharti ya huduma",
  choosePackage: "Chagua kifurushi chako.",
  enterPaymentPhone: "Weka namba ya simu ya kufanya malipo.",
  confirmPaymentPrompt: "Thibitisha ombi la malipo kwenye simu yako.",
  paymentReceivedConnecting: "Malipo yamepokelewa. Tunaunganisha WiFi yako.",
  wifiReady: "WiFi yako iko tayari kutumika.",
  paymentReceivedActivating:
    "Tumepokea malipo, lakini kuunganisha WiFi bado kunaendelea.",
  voucherUsedOrExpired: "Voucher hii imeshatumika au imeisha muda.",
  price: "Bei",
  duration: "Muda",
  speed: "Kasi",
  data: "Data",
  unlimitedData: "Data bila kikomo",
  devices: "Vifaa",
  upTo: "hadi",
  buy: "Nunua",
  pay: "Lipa sasa",
  sending: "Inatuma…",
  mobileMoneyNumber: "Namba ya pesa ya simu",
  haveVoucher: "Una voucher?",
  voucherCode: "Namba ya voucher",
  redeem: "Tumia voucher",
  back: "Rudi",
  notAvailable: "Huduma ya kununua WiFi haipatikani hapa kwa sasa.",
  noPackages: "Hakuna vifurushi kwa sasa.",
  openFromWifi:
    "Unganisha kwenye WiFi hii kisha fungua ukurasa wa kuingia ili kununua.",
  contextExpired:
    "Muda wa ukurasa umeisha. Unganisha tena kwenye WiFi ili kufungua ukurasa wa kuingia.",
  paymentPending: "Tunasubiri uthibitisho wa malipo…",
  paymentFailed: "Malipo hayakukamilika.",
  tryAgain: "Jaribu tena",
  activationFailed:
    "Tumepokea malipo lakini hatukuweza kuunganisha kifaa chako. Wasiliana na msaada ukiwa na namba ya kumbukumbu.",
  needsReview:
    "Malipo yako yanakaguliwa. Wasiliana na msaada ukiwa na namba ya kumbukumbu ikichukua muda mrefu.",
  remaining: "Muda uliobaki",
  expiresAt: "Inaisha",
  continueBrowsing: "Endelea kutumia intaneti",
  reference: "Kumbukumbu",
  keepReference:
    "Hifadhi ukurasa huu au namba ya kumbukumbu ili kuunganisha tena baadaye.",
  connectThisDevice: "Unganisha kifaa hiki",
  accessStatus: "Hali ya huduma",
  accessEnded: "Huduma hii imeisha.",
  support:
    "Unahitaji msaada? Mwonyeshe mmiliki wa WiFi namba hii ya kumbukumbu.",
  deviceLimit: "Idadi ya vifaa kwa kifurushi hiki imefika kikomo.",

  "portal.advertBadge": "Tangazo",
  "portal.advertSlideAria": "Slaidi {n}",
  "portal.sponsoredChip": "Imedhaminiwa",
  "portal.card.upTo": "Hadi {speed}",
  "portal.card.allowance": "Data {data}",
  "portal.card.deviceOne": "Kifaa {count}",
  "portal.card.deviceMany": "Vifaa {count}",
  "portal.advertPrev": "Tangazo lililopita",
  "portal.advertNext": "Tangazo lifuatalo",
  "portal.advertPause": "Simamisha matangazo",
  "portal.advertPlay": "Endeleza matangazo",
  "portal.advertPosition": "{current} / {total}",
  "portal.advertTapToView": "Bofya kupata ofa & maelezo",
  "portal.advertShareAction": "Sambaza ofa",
  "portal.advertShareWhatsApp": "Tuma WhatsApp",
  "portal.advertCopyInfo": "Nakili maelezo",
  "portal.advertCopied": "Imenakiliwa!",
  "portal.advertCall": "Piga simu",
  "portal.advertWhatsApp": "WhatsApp",
  "portal.advertClose": "Funga",
  "portal.advertWifiNotice": "Ukurasa wa wavuti na intaneti vitafunguka kikamilifu mara tu utakapounganishwa na WiFi.",
  "portal.sponsoredBadge": "Tangazo lililodhaminiwa",
  "portal.sponsoredCredit": "Matangazo ya wadhamini karibu nawe",
  "portal.selectPackage": "Chagua kifurushi",
  "portal.voucherUnavailable":
    "Kuingia kwa voucher hakupatikani kwenye eneo hili la WiFi.",
  "portal.voucherSectionTitle": "Una Vocha ya WiFi?",
  "portal.voucherSectionSubtitle":
    "Weka namba ya vocha yako kujiunga na mtandao mara moja bila kulipa mtandaoni.",
  "portal.voucherPlaceholder": "mf. 2ABC-4DEF-6GHK",
  "portal.voucherSubmit": "Unganisha kwa Vocha",
  "portal.voucherOr": "Au unganisha kwa kutumia vocha",
  "portal.voucherSubmitting": "Inahakiki vocha…",
  "portal.loadFailed":
    "Hatukuweza kupakua eneo hili la WiFi. Kwa kawaida ni kwa muda.",
  "portal.retry": "Jaribu tena",
  "portal.chooseTitle": "Chagua kifurushi chako",
  "portal.chooseLead": "Chagua muda wa matumizi unaokufaa.",
  "portal.payTitle": "Kamilisha malipo yako",
  "portal.youAreBuying": "Unanunua",
  "portal.changePackage": "Chagua kifurushi kingine",
  "portal.payWithMobileMoney": "Lipa kwa pesa ya simu",
  "portal.networkVodacom": "Vodacom",
  "portal.networkAirtel": "Airtel",
  "portal.networkYas": "Yas",
  "portal.networkDetected": "Tumegundua {network} kutoka namba yako.",
  "portal.connectedTitle": "Umeunganishwa!",
  "portal.connectedLead": "Kipindi chako cha WiFi kinaendelea.",
  "portal.previewNote": "Onyesho: hii ni skrini ambayo mgeni wako anaona baada ya kulipa.",
  "portal.activePackage": "Kifurushi kinachoendelea",
  "portal.browseInternet": "Anza kutumia intaneti",
  "portal.exploreWeb": "Gundua Mtandao",
  "portal.exploreWebSubtitle": "Njia ya haraka kufungua programu na huduma maarufu",
  "portal.exploreLocal": "Gundua Huduma & Eneo Lako",
  "portal.exploreLocalSubtitle": "Biashara na ofa maalum zilizopo karibu nawe",
  "portal.allCategories": "Zote",
  "portal.foodDrinks": "Vyakula & Mikahawa",
  "portal.shopsServices": "Maduka & Huduma",
  "portal.techGadgets": "Teknolojia & Simu",
  "portal.speedTest": "Pima Kasi",
  "portal.wifiActiveStatus": "Intaneti yenye kasi ipo tayari",
  "portal.openNow": "Funguliwa Sasa",
  "portal.exploreTitle": "Gundua…",
  "portal.exploreSeeAll": "Ona zote",
  "portal.exploreEmpty": "Hakuna biashara zilizoangaziwa bado.",
  "portal.businessExplore": "Gundua",
  "portal.exploreSoon":
    "Maelezo zaidi kuhusu {business} yanakuja hivi karibuni.",
  "portal.visitWebsite": "Tembelea {site}",
  "portal.jobsOpportunities": "Kazi & Fursa",
  "portal.promoteBusiness": "Tangaza biashara yako",
  "portal.startOver": "Anza upya",
  "portal.poweredBy": "Inaendeshwa na {brand} · Tanzania",
  "portal.helpWhatsapp": "Msaada / WhatsApp",
  "portal.supportTitle": "Msaada kwa wateja",
  "portal.supportLead": "Wasiliana na timu ya WiFi ikiwa unahitaji msaada.",
  "portal.supportCall": "Piga simu sasa",
  "portal.supportWhatsapp": "WhatsApp",
  "portal.jobs": "Kazi",
  "portal.opportunities": "Fursa",
  "portal.jobsLead": "Gundua fursa yako ijayo.",
  "portal.jobsPreviewNote": "Kazi na fursa halisi kutoka kwa washirika wetu.",
  "portal.jobsEmpty": "Hakuna matangazo yanayopatikana kwa sasa.",
  "portal.jobViewApply": "Tazama & Omba",
  "portal.jobViewOpportunity": "Tazama fursa",
  "portal.jobApplyContinue": "Endelea kwa mtoa huduma",
  "portal.jobBack": "Rudi kwenye orodha",
  "portal.jobClosing": "Tarehe ya mwisho hubainishwa na mtoa huduma.",
  "portal.jobType": "Aina",
  "portal.promotionTitle": "Tangaza biashara yako",
  "portal.promotionLead": "Chagua muda unaotaka tangazo lako la bango lidumu.",
  "portal.promotionPriceNote":
    "Bei za mfano kwa ukurasa huu — viwango halisi vitakubaliwa.",
  "portal.promotionWeekly": "Vifurushi vya wiki",
  "portal.promotionQuarterly": "Vifurushi vya robo mwaka",
  "portal.promotionChoose": "Chagua {duration}, bei ya mfano {price}",
  "portal.promotionSelected": "Umechagua",
  "portal.promotionChange": "Badilisha kifurushi",
  "portal.promotionName": "Jina lako kamili",
  "portal.promotionMobile": "Namba ya simu",
  "portal.promotionEmail": "Barua pepe (si lazima)",
  "portal.promotionBusiness": "Jina la biashara",
  "portal.promotionLocation": "Eneo la biashara",
  "portal.promotionLocationPlaceholder": "Eneo / mtaa / alama ya karibu",
  "portal.promotionDescription": "Biashara yako inafanya nini?",
  "portal.promotionOffer": "Ungependa kutangaza nini?",
  "portal.promotionSubmit": "Tuma ombi la tangazo",
  "portal.promotionSubmitting": "Inatuma…",
  "portal.promotionSuccessTitle": "Ombi limepokelewa",
  "portal.promotionSuccessBody":
    "Mmiliki wa WiFi atawasiliana nawe kuhusu tangazo lako la bango.",
  "portal.promotionAnother": "Tuma ombi lingine",
  "portal.promotionBack": "Rudi kwenye ukurasa uliounganishwa",
  "portal.promotionRequired": "Tafadhali jaza sehemu hii.",
  "portal.close": "Funga",
  language: "English",
};

const sw: Record<MessageKey, string> = {
  ...baseSw,
  ...adminScreensCatalog.sw,
  ...resellerScreensCatalog.sw,
  ...authCatalog.sw,
  ...marketingCatalog.sw,
};

const catalogs: Record<Locale, Record<MessageKey, string>> = { en, sw };

/** Values substituted into `{placeholders}` in a message. */
export type TranslateVars = Record<string, string | number>;

/**
 * Looks a key up in `locale`, substitutes `{name}` placeholders, and falls back
 * to English when a catalog is somehow incomplete at runtime.
 */
export function t(
  locale: Locale,
  key: MessageKey,
  vars?: TranslateVars,
): string {
  const message =
    catalogs[locale]?.[key] ?? catalogs[DEFAULT_LOCALE][key] ?? key;
  if (!vars) return message;
  return message.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/** Builds a `t` bound to one locale — what the React providers expose. */
export function createTranslator(locale: Locale) {
  return (key: MessageKey, vars?: TranslateVars) => t(locale, key, vars);
}

export type Translator = ReturnType<typeof createTranslator>;

/** True when `locale` has a real translation for `key` (no English fallback). */
export function hasTranslation(locale: Locale, key: MessageKey): boolean {
  return locale === DEFAULT_LOCALE || Boolean(catalogs[locale]?.[key]);
}

/** All keys, useful for translation-coverage checks in tests. */
export const MESSAGE_KEYS = Object.keys(en) as MessageKey[];

export { en, sw };
