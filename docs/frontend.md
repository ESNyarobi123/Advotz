# Frontend

Two Next.js 15 App Router apps (React 19, Tailwind CSS 4) share `@advo/ui` (brand tokens and brand-semantic helpers over HeroUI), `@advo/api-client` and `@advo/contracts`.

## `apps/web` (port 3000)

| Area | Routes |
|---|---|
| Marketing | `/`, `/features`, `/pricing`, `/contact` |
| Auth | `/login` (with the TOTP step for Admins), `/register`, `/verify`, `/forgot-password`, `/invite/[token]` |
| Onboarding | `/onboarding` |
| Admin (16 pages) | Overview, Resellers, Agents, Plans, Commissions, Controllers, Sites & devices, Payments, Withdrawals, Ledger, Listings, Campaigns, Settings, Operations, Support, Audit log |
| Reseller (11 pages) | Overview, Subscription, Sites & devices, Packages, Vouchers, Captive Portal, Customers & access, Payments, Wallet, Support |
| Agent (5 pages) | Overview, Leads & invitations, Commissions, Wallet, Support |

- **Access.** Dashboard layouts check the session with `/auth/me`. Anonymous users go to `/login?next=…`, and users with the wrong role are sent to their own dashboard. The API enforces the same rules again, so the frontend check is only for convenience.
- **Data.** Pages load through a small `useResource` hook over the API client and show loading (`aria-busy`), empty and error states. The Playwright suite opens every page for each role and checks that none of them is stuck loading or shows an error.
- **Actions.** Audited actions use `ActionButton`. With `reasonPrompt` set, the user must type a reason of at least 3 characters before anything is sent, and the API records it.
- **No optimistic UI for money or hardware.** Payment, payout, settlement and authorization results are shown only after the API confirms them.
- **Language.** English only. It does not use `@advo/i18n` yet.
- **Portal design.** Reseller → Captive Portal designs one site at a time. The editor embeds the site's **real** portal — `{NEXT_PUBLIC_PORTAL_URL}/{site.slug}` — in an iframe under **Live preview**, with a Packages / Connected tab that switches the frame between `/{slug}` and `/{slug}/status`, and the URL beside it with Copy, Open and Reload. It is deliberately not a rebuilt mock: a reimplementation drifts from the app a guest actually uses, and a reseller checking their own portal must not be shown a convincing approximation of it. Two consequences are stated in the panel: the embed renders the **saved** design (nothing is published until **Save design**), and the Connected screen needs a real paid session, so with no active order it shows the portal's own state. The guest portal carries its own SW/EN switcher, so both languages are checkable inside the frame.
- **Preview mode (`?preview=1`).** The frame loads one query parameter the Copy and Open URLs deliberately do not. A reseller cannot be on their own WiFi, so the embed can never carry the controller's `clientMac` and can never mint a portal context; without the flag the guest-facing guard fires and the preview reads "connect to this WiFi network" to someone who is looking at the design. The flag relaxes exactly one thing: the real payment dialog opens, so the fields, the network detection from the phone prefix and the layout can all be checked. It is safe because it only ever switches buying **off** — a guest who adds it by hand gets a portal that cannot take their money — and because **it does not fabricate a context token**: `pay()` refuses in preview, so no order is created. A fabricated token would be worse than the confusing message, because it would take real money against a made-up device MAC, i.e. money for a service nobody receives. The panel says plainly that taking money is off in the frame, so the disabled Pay button does not read as a defect.
- **Logo and background upload.** Both go through `POST /reseller/media/logo` and `POST /reseller/media/background` as raw `image/*` bodies (no multipart, no base64). The panel previews the file from a local object URL the moment it is chosen, then replaces it with the served URL and reports the server's own before/after sizes, so the saving shown is measured rather than estimated. Logos are boxed to 512 px; backgrounds to 1280 px WebP behind a fixed readability wash. Publishing still happens on **Save design**; uploading only stores the asset.
- **Colour control.** Six reviewed combinations (`PORTAL_COLOR_PRESETS`) give a readable portal in one tap; the three hex fields below them fine-tune the brand, accent and page colours. Each field shows its contrast against white text and refuses a combination a guest could not read, and the package-card style and arrangement pickers only offer what the reseller's plan allows — a locked option is shown disabled with the plan that set it.
- **Fonts.** Inter is the only typeface in the product. It is self-hosted through `next/font/google` in `app/layout.tsx` (no runtime request to Google) and exposed to the design tokens as `--advo-font-inter`.

## `apps/portal` (port 3001)

The captive portal guests see after connecting to the Reseller's SSID.

| Route | Purpose |
|---|---|
| `/[brandSlug]` | The guest's landing screen: the package list for the site, with the sponsored banner above it. It reads the EAP redirect parameters (`clientMac`, `apMac` or `gatewayMac`, `ssidName`, `radioId` or `vid`), exchanges them for a server-side portal context, then removes them from the URL |
| `/[brandSlug]/payment/[orderToken]` | Waits for payment confirmation (polling), then shows "Your WiFi is ready to use." |
| `/[brandSlug]/voucher` | Voucher redemption |
| `/[brandSlug]/status` | Access status. Opening the recovery link here joins another device to the same access |

- **A guest is a phone number.** The payment dialog asks for the mobile-money number and nothing else — the network chip lights up from its prefix as it is typed. There are no guest accounts: a device is authorized by RADIUS, so a name and an email would have been collected, stored and never used for anything. The payer's real name is not lost, it just arrives later and from somewhere that knows it — Snippe reports the mobile-money account holder with the payment, and that fills the Reseller's customer list. See `providerCustomerDetails` in the backend for what Snippe is sent in the meantime.
- **No welcome screen and no progress rail.** A guest who has just joined a WiFi network wants a price, not an introduction: the journey is **Choose → Pay → Connect** and the first screen is the package list. The promotional surfaces that used to sit on a separate welcome screen now ride on the landing screen, in the order the plan agreement expects — sponsored banner, then the site's own advert banners, then the site description, then the packages. Both bands collapse to nothing when they have no content, and neither blocks buying. The journey is also not narrated: the numbered step indicator and the "Stage 1 of 3" captions were removed, because each screen already says what it is and a rail above the price list was decoration on the one screen that has to sell.
- **Swahili by default** (`<html lang="sw">`), with an English toggle remembered on the device. Strings come from `@advo/i18n`. The header shows both languages by name rather than a single mystery button, so a first-time guest can read the choice before pressing it.
- **`@advo/ui` holds no copy.** The portal components in that package take every customer-facing word as a prop (`sponsoredLabel`, `labels.upTo`, `labels.slideAria`, …) instead of a literal. A literal there is invisible to `@advo/i18n`, so it ships as English on a Swahili page — which is exactly how "Sponsored" and "Up to 5 Mbps" used to leak onto the guest portal. Prices, allowances and durations arrive already formatted and translated by the caller; the components only place them.
- **Mobile first.** Playwright runs the portal on a Pixel 7 profile.
- Fully themed from the site's plan-resolved design: brand colours, page colour, uploaded background photo, the package card style (five styles) and the card arrangement (`list`, `grid-2`, `grid-3`). Each value is clamped to what the reseller's plan allows on the server, so the guest can never see a style the plan excludes.
- **Stage flow.** Packages are sold on the landing screen only. Once the guest is connected, the screens show their active session and the sponsored **Explore** discovery section — the package list is not re-shown to someone who has already paid.
- Without a WiFi context (for example the page opened directly, not from an EAP redirect), the Buy button is disabled and the real reason is given inside the payment dialog — the only place a guest actually hits it.
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
