# Frontend

Two Next.js 15 App Router apps (React 19, Tailwind CSS 4) share `@advo/ui` (brand tokens and brand-semantic helpers over HeroUI), `@advo/api-client` and `@advo/contracts`.

## `apps/web` (port 3000)

| Area | Routes |
|---|---|
| Marketing | `/`, `/features`, `/pricing`, `/contact` |
| Auth | `/login` (with the TOTP step for Admins), `/register`, `/verify`, `/forgot-password`, `/invite/[token]` |
| Onboarding | `/onboarding` |
| Admin (14 pages) | Overview, Resellers, Agents, Plans, Commissions, Controllers, Sites & devices, Payments, Withdrawals, Ledger, Settings, Operations, Support, Audit log |
| Reseller (9 pages) | Overview, Subscription, Sites & devices, Packages, Vouchers, Customers & access, Payments, Wallet, Support |
| Agent (5 pages) | Overview, Leads & invitations, Commissions, Wallet, Support |

- **Access.** Dashboard layouts check the session with `/auth/me`. Anonymous users go to `/login?next=…`, and users with the wrong role are sent to their own dashboard. The API enforces the same rules again, so the frontend check is only for convenience.
- **Data.** Pages load through a small `useResource` hook over the API client and show loading (`aria-busy`), empty and error states. The Playwright suite opens every page for each role and checks that none of them is stuck loading or shows an error.
- **Actions.** Audited actions use `ActionButton`. With `reasonPrompt` set, the user must type a reason of at least 3 characters before anything is sent, and the API records it.
- **No optimistic UI for money or hardware.** Payment, payout, settlement and authorization results are shown only after the API confirms them.
- **Language.** English only. It does not use `@advo/i18n` yet.
- **Fonts.** Inter is the only typeface in the product. It is self-hosted through `next/font/google` in `app/layout.tsx` (no runtime request to Google) and exposed to the design tokens as `--advo-font-inter`.

## `apps/portal` (port 3001)

The captive portal guests see after connecting to the Reseller's SSID.

| Route | Purpose |
|---|---|
| `/[brandSlug]` | Package list for the site. It reads the EAP redirect parameters (`clientMac`, `apMac` or `gatewayMac`, `ssidName`, `radioId` or `vid`), exchanges them for a server-side portal context, then removes them from the URL |
| `/[brandSlug]/payment/[orderToken]` | Waits for payment confirmation (polling), then shows "Your WiFi is ready to use." |
| `/[brandSlug]/voucher` | Voucher redemption |
| `/[brandSlug]/status` | Access status. Opening the recovery link here joins another device to the same access |

- **Swahili by default** (`<html lang="sw">`), with an English toggle remembered on the device. Strings come from `@advo/i18n`.
- **Mobile first.** Playwright runs the portal on a Pixel 7 profile.
- Without a WiFi context (for example the page opened directly, not from an EAP redirect), the Buy button is disabled and explains why.
- Server components call the API through `API_INTERNAL_URL`, and the browser uses `NEXT_PUBLIC_API_URL`.

## Build and configuration

- `output: "standalone"` with `outputFileTracingRoot` at the repository root, so the Docker images ship only the traced files.
- `NEXT_PUBLIC_*` values are **baked in at build time** (Docker build args). `API_INTERNAL_URL` is read at runtime.
- Never put secrets in `NEXT_PUBLIC_*`.
- `next build` must run with `NODE_ENV` unset (or `production`).
- `next dev` and `next build` share `<app>/.next`, so a production build while the dev server is running overwrites the chunks the dev server is still serving (see the `ChunkLoadError` runbook). Both apps therefore run `scripts/guard-next-build.mjs` **before** `next build`; with a Next server on the app's dev port it aborts and prints the fix instead of corrupting `.next`. `ALLOW_BUILD_WITH_DEV=1` overrides the guard, and Docker and CI are unaffected because nothing listens on the app port during those builds.

## UI library

**HeroUI v3 (`@heroui/react` + `@heroui/styles`, pinned to 3.2.6) renders every control in the product.** It is a real dependency of both apps and of `@advo/ui`; there is no in-house primitive layer.

`@advo/ui` is the thin Advo brand layer on top of HeroUI. It keeps only what HeroUI cannot know about:

- **`tokens.css`** — the Advo palette, type and radius scale, exposed as CSS variables.
- **Brand-semantic helpers** — `StatusChip` (HeroUI `Chip` + the domain status vocabulary, so screens render `<StatusChip>{order.paymentState}</StatusChip>` instead of repeating a tone lookup), `Notice` (one-line `Alert`), `AdvoKpi` (HeroUI `Card` in the product's metric layout) and `AdvoTable` (a flat `rows`/`columns` wrapper over HeroUI's compound `Table`).
- **`AdvoSelect`** — a native `<select>` carrying HeroUI's field classes, for the HTML-form flows where React Aria's listbox would not submit.

Everything else (`Button`, `Card`, `Input`, `Label`, `Skeleton`, `TextArea`, `Chip`, `Alert`, `Table`, `EmptyState`, …) is imported straight from `@heroui/react` at the call site.

### Dashboard shell (Admin, Reseller, Agent)

`features/shell/DashboardShell.tsx` owns the session, the TOTP gate and the role guard; `features/shell/FloatingSidebar.tsx` renders the navigation; `features/shell/navigation.ts` holds the routes, their icons and the section grouping. All three roles share it, so a new route is added in one place.

The sidebar is a **floating panel**: detached from the viewport edge by 12px on three sides, rounded to the medium radius (12px) and lifted with a shadow, over the light page. It keeps the Advo dark surface (`--advo-charcoal`) and the brand gradient accent line.

It is built from the open-source HeroUI primitives. **HeroUI's own `Sidebar` / `AppLayout` with `sidebarVariant="floating"` is a HeroUI _Pro_ component** and is not part of `@heroui/react`; nothing in this repository depends on Pro. The primitives used instead are:

| Piece | Component |
|---|---|
| Nav sections that expand/collapse | `DisclosureGroup` + `Disclosure` (`allowsMultipleExpanded`, all sections open by default) |
| Scrolling nav area | `ScrollShadow` (`hideScrollBar`) |
| Signed-in identity | `Avatar`, `Chip`, `Separator` |
| Icon-only rail tooltips | `Tooltip` |
| Mobile off-canvas navigation | `Drawer` (controlled with `useOverlayState`) + `Button` |

Behaviour worth knowing:

- **Collapse.** The header control switches to a 76px icon-only rail and remembers the choice in `localStorage` under `advo.sidebar.collapsed`. The preference is read on mount, not during render, so the server and first client render agree.
- **Mobile.** Below `lg` the panel is replaced by a sticky top bar with a hamburger that opens the `Drawer`, which always renders expanded. The drawer closes on navigation.
- **Tooltips.** On the rail each row is a single `<a>`: the trigger is rendered *as* the anchor through `Tooltip.Trigger`'s `render` prop, so there is one tab stop and no unnamed wrapper button. HeroUI types that trigger as a `div`, hence the deliberate prop re-cast in `RailLink`. RAC only opens a tooltip for real pointer or keyboard input (`getInteractionModality()` / `isFocusVisible()`), so synthetic events will not open one.
- **Nav links are plain `next/link` anchors, not HeroUI buttons.** Pro's `Sidebar.MenuItem` has no open-source equivalent, and an anchor is required for real navigation (middle-click, copy link, prefetch).

### Theming

`@heroui/styles` is imported after `tailwindcss` in both `globals.css` files, then `@advo/ui/tokens.css`, so the Advo tokens win. A small `@layer base` block maps the brand onto HeroUI's variables — `--radius` (12px), `--field-radius` (16px), `--accent` (Advo blue) — and pins the few HeroUI components that otherwise compute their own radius (`--radius * 2.5`) back to the medium step.

Both `globals.css` files carry `@source "../../../../packages/ui/src"`. Tailwind's automatic source detection is rooted at the app, so without it the utilities used only inside `packages/ui` are never generated and the shared components render unstyled.

`I18nProvider` from React Aria wraps both apps (`en-TZ` for the dashboard, `sw-TZ` for the guest portal) so dates and currency format consistently. HeroUI needs no other provider.

The design tokens in `packages/ui/src/tokens.css` are the single source of truth, and both apps mirror them into Tailwind's `@theme`:

- **Typeface.** Inter everywhere — marketing, auth, Admin, Reseller, Agent and the guest portal.
- **Radius.** One "medium" scale (12px) for every surface and control: cards, panels, tables, menus, buttons and chips. Form controls step up to the "large" step (16px) through `rounded-field`, so inputs, selects and textareas read as fields. `rounded-full` is reserved for status pills and avatars.
- **Colours.** Use the `--advo-*` variables (`--advo-blue`, `--advo-border`, `--advo-muted`, …) rather than raw hex values, so a rebrand stays a one-file change.
