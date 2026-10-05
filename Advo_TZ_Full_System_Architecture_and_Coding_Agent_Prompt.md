# Advo TZ — Complete WiFi Billing & Network Management System

**Deliverable:** architecture, folder structure, business flows, integration specification, installation guide and a master implementation prompt for a coding AI agent.

**Prepared:** 30 September 2026. **Brand:** Advo TZ. **Primary market:** Tanzania. **Currency:** TZS. **Business timezone:** Africa/Dar_es_Salaam.

## Jinsi ya kutumia faili hii

Faili hii ni specification na prompt ya utekelezaji; si system ambayo tayari imejengwa au imejaribiwa kwenye hardware. Mpe coding agent faili nzima, kisha tumia launch prompt iliyo hapa chini. Agent aanze kwa kukagua repository na nyaraka, halafu ajenge system kwa hatua. Commands zilizo chini ni commands ambazo repository itakayojengwa lazima isupport; project scripts ambazo bado hazipo zimeelezwa wazi.

Majina ya biashara, domain, subscription prices, commission rates na withdrawal fees hayajathibitishwa. Yamewekwa kama configuration au demo examples, si bei rasmi. Logo uliyotuma imeandikwa “Advowifi”; tumia **Advo TZ** kwenye product copy na uiweke logo asset kama configurable mpaka artwork ya mwisho ipatikane. Mradi huu uwe tofauti na WoteFy na Lubfy.

### Launch prompt — copy this into your coding agent

> Read the attached `Advo_TZ_Full_System_Architecture_and_Coding_Agent_Prompt.md` completely and use it as the implementation specification. Build Advo TZ with the stated Next.js, NestJS, PostgreSQL, Redis/BullMQ, Snippe and Omada architecture. Inspect the existing repository first. Preserve useful existing work and implement the phases in order. Start with repository foundations, database migrations, authentication, tenant isolation and a working registration flow. Then continue through payments, Omada authorization, commissions, withdrawals and the complete dashboards. Do not stop after a plan or a UI mockup. Keep a checkpoint document, run the acceptance tests and report verified behavior and remaining integration dependencies honestly. Re-read the official integration docs and the actual Controller's API documentation before implementing provider calls. Never invent an endpoint, a webhook signature, a rate limit, an account balance, a commission rate or a successful hardware result.

---

## 1. Master implementation mandate

You are the senior full-stack engineer implementing **Advo TZ — Smart WiFi Billing & Network Management**.

Build a complete, maintainable application with a public website, an Admin dashboard, a Reseller dashboard, an Agent dashboard, a guest captive portal, a NestJS backend API and background workers. Integrate real Snippe collections and mobile money payouts, and integrate TP-Link Omada SDN Controller for supported EAP management and external portal authentication.

There are exactly three authenticated business roles:

1. **ADMIN** — manages the platform, controllers, resellers, agents, billing policies and operations.
2. **RESELLER** — manages their own WiFi business, sites, EAP devices, packages, vouchers, customers, sessions and earnings.
3. **AGENT** — introduces or registers reseller leads, tracks attributed resellers and earns commission according to an Admin-controlled policy.

Guest WiFi customers are public portal customers with narrowly scoped portal sessions. Do not give them a dashboard business role or make every paying customer an authenticated Reseller account.

The expected outcome is functioning business flows with real persistence, validated integrations and polished responsive interfaces. Development simulations are necessary for repeatable tests, but production must reject simulated providers and simulated controller successes.

### Mandatory implementation behavior

- Use TypeScript in the backend and frontend with strict checking.
- Start with a modular monolith, one relational database and a small set of independently runnable applications.
- Keep payment, ledger, subscription, commission and network authorization decisions in backend services.
- Render UI from actual API responses. Never show a successful payment, payout or controller action because a user clicked a button.
- Treat billing state, paid access entitlement and Omada authorization state as separate records and separate state machines.
- Implement registration through both direct self-registration and Agent invitation.
- Use one shared implementation of each business rule between the API and workers.
- Record tenant ownership on every reseller-owned resource and enforce it in backend reads, writes, jobs, exports and events.
- Prefer small, reviewable changes. Commit progress when repository policy permits it.
- Maintain `docs/implementation-status.md` so implementation can continue safely across agent sessions.
- Do not leave critical handlers as TODOs while claiming the feature is complete.
- Mark an unavailable vendor capability with a clear unsupported state and documented reason.
- Complete a working vertical slice before expanding every table, chart and settings screen.

## 2. Scope and explicit assumptions

### 2.1 Included scope

Implement:

- Marketing website, product explanation, configurable pricing and contact page.
- Secure authentication and Admin-created Agent accounts.
- Reseller self-registration, referral-code registration and Agent invitation acceptance.
- Reseller trial and paid platform subscriptions.
- Multiple network sites per Reseller, within plan limits.
- A configurable Controller registry; start with one shared Controller.
- Tenant-to-Controller-site mappings, Controller health and capability profiles.
- EAP inventory, verified device ownership requests and supported management actions.
- SSID and external portal provisioning when supported by the selected Controller API.
- WiFi packages by time, speed, concurrent-device limits and verified quota capabilities.
- Snippe mobile money collections for customer WiFi purchases and reseller subscriptions.
- Voucher groups, voucher redemption, revoke and applicable disconnect jobs.
- Paid access entitlements, network sessions, expiry and reconciliation.
- Agent referrals, commission rules, commission history and withdrawals.
- Reseller revenue, append-only financial journals and withdrawals.
- Admin approval and Snippe payout processing.
- Notifications, support tickets, audit logs, operational alerts and reports.
- English and Swahili user-facing strings.
- Development setup, migrations, fixtures, tests, container deployment and recovery documentation.

### 2.2 Business defaults to implement

| Decision | Default implementation | Configuration or extension |
|---|---|---|
| Brand name | Advo TZ | App settings; final logo asset pending |
| Controller type | Omada Software Controller on a reachable server | Adapter metadata for Hardware/CBC after verification |
| Initial tenancy | Shared Controller, separate Controller site mappings per Reseller | Multiple Controllers supported by registry |
| Payment account | One platform-controlled Snippe merchant account | Separate merchant credentials only after a separately designed flow |
| Customer payment | Snippe mobile money USSD push | Hosted checkout optional, not required for first release |
| Currency | Integer TZS | Reject other currencies in this release |
| Commission trigger | Verified reseller platform-subscription payment | Separate first-payment and renewal policies |
| Registration commission | None just for opening an account | Agent attribution is stored immediately; earnings require paid eligibility |
| Self-registration | Supported | Optional valid Agent referral code |
| Agent-created registration | Invitation that the Reseller accepts | Agent does not set or receive the Reseller password |
| Customer sale commission | No Agent commission by default | Separate policy, if explicitly enabled later |
| Withdrawal | Beneficiary requests; Admin approves; worker submits | Automatic payouts may be enabled later through policy |
| Commission rates | Unset until Admin configures them | Fixed TZS or percentage in basis points |
| Trial | One configurable trial per verified Reseller | Admin policy, duration not hard-coded |
| Paid-access clock | Starts on the first confirmed authorization | Bounded activation window and explicit retry rules |
| Subscription expiry | Stop new customer sales/grants | Honor already purchased grants until their paid expiry by default |
| Hardware-dependent features | Disabled until their capability is verified | Runtime capability matrix and lab evidence |

Do not silently assume the company has approved a particular subscription price, commission percentage, withdrawal charge or provider-fee allocation. Demo seeds must clearly label sample policies. Production must require configuration for policies that allocate money.

### 2.3 Terms that must remain distinct

- **Platform subscription plan:** the monthly or other periodic plan a Reseller buys from Advo TZ.
- **WiFi package:** internet access a guest customer buys from a Reseller.
- **Entitlement:** the right to a purchased package or redeemed voucher.
- **Authorization:** Controller acceptance of a command to grant a particular client access.
- **Network session:** an observed client connection; it may end while its entitlement remains valid.
- **Wallet:** the platform's ledger of amounts owed, not the Snippe account balance.
- **Agent commission:** a liability created by an eligible subscription payment, not an inferred percentage of every WiFi sale.
- **Omada SDN Controller:** the network-management Controller. “CDN” in the project discussion refers to this Controller, not a content-delivery network.

## 3. Technology stack and compatibility policy

| Layer | Technology | Purpose |
|---|---|---|
| Runtime | Node.js 24 LTS baseline | API, workers and Next.js runtime |
| Package management | pnpm workspace | Shared packages and one lockfile |
| Task orchestration | Turborepo | Build, development and CI dependency graph |
| Website/dashboard | Next.js App Router + React + TypeScript | Public website and three business dashboards |
| UI components | HeroUI React | Dashboard forms, overlays and reusable controls |
| Styling | Tailwind CSS + semantic CSS tokens | Consistent Advo TZ branding |
| Server-state UI | TanStack Query | Dashboard API state and cache invalidation |
| Forms | React Hook Form + Zod | Form state and shared validation contracts |
| Tables | TanStack Table with application UI | Filtering, pagination and exports |
| Charts | Recharts, loaded on chart screens | Revenue and operational summaries |
| Icons | Lucide React | Consistent interface iconography |
| Backend | NestJS + Fastify adapter | REST API, validation, guards and Swagger |
| Database | PostgreSQL + Prisma | Transactional persistence and migrations |
| Background work | Redis + BullMQ through Nest integration | Durable job scheduling, retries and workers |
| Payments | Official `@snippe/sdk` behind an adapter | Collections, status lookup, payout and verification |
| Omada transport | Server-side HTTP client with cookie-jar support | Open API and version-specific portal operations |
| Authentication | Backend-owned opaque sessions | Secure HttpOnly cookies and server-side revocation |
| Passwords | Argon2id | Password hashing |
| Logs/metrics | Structured logs + Prometheus/OpenTelemetry-compatible instrumentation | Integration traces and worker health |
| Tests | Vitest or Jest; Playwright for browser flows | Domain, integration and user-flow verification |
| Deployment | Docker Compose + reverse proxy | API, worker, web, portal, database and Redis |

Node.js lists v24 as an LTS branch. Select exact compatible versions at implementation time, write them to `docs/dependency-versions.md`, pin the package-manager version and commit the lockfile. Do not install “latest” again during a production build. [Runtime reference: S10]

Use the HeroUI documentation for the selected major version. HeroUI v2 and v3 setup differs; do not mix providers, theme APIs or style imports from different major versions. Use the Prisma configuration, client generator and PostgreSQL adapter appropriate to the installed Prisma major. [Compatibility references: S11–S14]

Next.js owns the presentation and routing layer. NestJS owns business decisions. Portal and dashboard may call the API directly through the reverse proxy; Next.js route handlers must not duplicate billing or Omada logic.

## 4. Runtime architecture

```mermaid
flowchart TD
  Web["Website and business dashboards"] --> API["NestJS API"]
  Portal["Guest captive portal"] --> API
  API --> DB["PostgreSQL"]
  API --> Outbox["Transactional outbox"]
  Outbox --> Queue["Redis and BullMQ"]
  Queue --> Worker["Background workers"]
  Worker --> DB
  API --> Snippe["Snippe collections"]
  Snippe --> Hook["Verified webhook inbox"]
  Hook --> DB
  Hook --> Outbox
  Worker --> Payouts["Snippe payouts"]
  Payouts --> Hook
  Worker --> Omada["Omada SDN Controller"]
  Omada --> EAP["Adopted TP-Link EAPs"]
```

This diagram shows application control and financial processing. Customer internet traffic stays in the local network path through the EAP and gateway/ISP; it is not proxied through the Advo TZ API server. An EAP still needs a functioning upstream network, DHCP, DNS and internet routing.

### Applications

- `apps/web`: marketing website, login, onboarding and Admin/Reseller/Agent dashboards.
- `apps/portal`: guest packages, purchase, voucher redemption and access status. Deploy separately so guest traffic does not inherit dashboard bundles.
- `apps/api`: NestJS HTTP bootstrap, controllers, validation and request security.
- `apps/worker`: headless NestJS bootstrap for BullMQ consumers, reconciliation and scheduled maintenance.

### Shared services

Keep business modules in `packages/backend`. Both API and worker bootstraps import the relevant modules from this package. A worker must not reach into `apps/api/src` to reuse business logic.

Use synchronous API responses to acknowledge a request and return a durable operation ID. Execute long Controller provisioning and financial workflows using persisted operations and workers. A portal authorization request may wait briefly for a fast worker result, but the result must remain recoverable if the request closes.

### Suggested domain layout

Domains below are placeholders, not purchased domains:

| Public origin | Service |
|---|---|
| `https://advo.example` | Marketing and dashboards |
| `https://portal.advo.example` | Guest captive portal |
| `https://api.advo.example` | Backend, including Snippe webhook |
| Private management address | Omada management/Open API endpoint |

Prefer reverse-proxy paths `/api/*` on each frontend origin for browser requests. This lets the API issue host-only HttpOnly cookies per origin and avoids broad parent-domain session cookies. Keep the public Snippe webhook on the backend origin. Document the equivalent explicit CORS configuration if cross-origin requests are chosen instead.

The API must choose a Controller endpoint from the Admin-configured registry. Never use a Controller hostname passed in a guest query string as a destination for server-side requests.

## 5. Monorepo and folder structure

The following tables describe actual folder responsibilities. Create the files required for working features; do not create hundreds of empty files just to imitate the structure.

### 5.1 Top-level structure

| Path | Contents |
|---|---|
| `apps/web/` | Website and authenticated dashboards |
| `apps/portal/` | Lightweight guest portal |
| `apps/api/` | NestJS Fastify HTTP entry point |
| `apps/worker/` | Queue and reconciliation entry point |
| `packages/backend/` | Shared Nest business modules |
| `packages/db/` | Prisma schema, migrations, seed and database client |
| `packages/contracts/` | Zod schemas, API types, enums and public DTO contracts |
| `packages/ui/` | Dashboard component wrappers and design tokens |
| `packages/api-client/` | Typed frontend client generated from OpenAPI or maintained against contracts |
| `packages/payments/` | Server-only Snippe adapter and deterministic test adapter |
| `packages/omada/` | Server-only Controller adapters, transport and capability definitions |
| `packages/config/` | Validated server/frontend environment schemas |
| `packages/i18n/` | English and Swahili message catalogues |
| `packages/test-kit/` | Tenant factories, signed-webhook fixtures and provider simulators |
| `infra/docker/` | Container Dockerfiles and Compose configuration |
| `infra/proxy/` | Reverse-proxy routing, TLS and header configuration |
| `infra/observability/` | Metrics scrape configuration and alert rules |
| `scripts/` | Bootstrap, verification, seed and backup helpers |
| `docs/` | Architecture, decisions, installation, integrations and runbooks |
| `tests/e2e/` | Browser and API acceptance workflows |
| `tests/hardware/` | Real Controller/EAP test procedure and evidence templates |
| `package.json` | Workspace scripts and pinned package manager |
| `pnpm-workspace.yaml` | `apps/*` and `packages/*` |
| `pnpm-lock.yaml` | Reproducible dependency graph |
| `turbo.json` | Build, typecheck, test and dev pipelines |
| `.env.example` | Documented non-secret configuration template |
| `.gitignore` | Secrets, generated artifacts and build outputs excluded |

### 5.2 Frontend route map

Use route groups for layouts and keep actual paths unambiguous.

| Application path | Screens |
|---|---|
| `apps/web/src/app/(marketing)/page.tsx` | Home |
| `apps/web/src/app/(marketing)/pricing/` | Platform subscription pricing |
| `apps/web/src/app/(marketing)/features/` | Billing and verified hardware support |
| `apps/web/src/app/(marketing)/contact/` | Contact and support entry |
| `apps/web/src/app/(auth)/login/` | Business login |
| `apps/web/src/app/(auth)/register/` | Direct Reseller registration with optional referral code |
| `apps/web/src/app/(auth)/invite/[token]/` | Invitation acceptance |
| `apps/web/src/app/(auth)/verify/` | Contact verification |
| `apps/web/src/app/(auth)/forgot-password/` | Password recovery |
| `apps/web/src/app/(dashboard)/admin/` | Admin shell and pages |
| `apps/web/src/app/(dashboard)/reseller/` | Reseller shell and pages |
| `apps/web/src/app/(dashboard)/agent/` | Agent shell and pages |
| `apps/web/src/app/(onboarding)/onboarding/` | Reseller setup wizard |
| `apps/web/src/features/` | Business-oriented UI feature modules |
| `apps/web/src/lib/` | UI-side API initialization and helpers |
| `apps/portal/src/app/[brandSlug]/` | Site or brand portal entry |
| `apps/portal/src/app/[brandSlug]/payment/[orderToken]/` | Purchase status |
| `apps/portal/src/app/[brandSlug]/voucher/` | Voucher redemption |
| `apps/portal/src/app/[brandSlug]/status/` | Entitlement and connection status |

Frontend feature directories: `auth`, `onboarding`, `admin-overview`, `resellers`, `agents`, `referrals`, `commissions`, `sites`, `devices`, `ssids`, `packages`, `vouchers`, `customers`, `sessions`, `payments`, `subscriptions`, `wallets`, `withdrawals`, `reports`, `support`, `settings` and `audit`.

Each feature may contain `components/`, `hooks/`, `queries.ts`, `mutations.ts`, `schemas.ts` and feature tests where needed. Large route files should compose feature components rather than contain the entire screen implementation.

### 5.3 Backend structure

| Path | Responsibility |
|---|---|
| `apps/api/src/main.ts` | Fastify bootstrap, raw-body support, proxy trust, shutdown and listening |
| `apps/api/src/http-app.module.ts` | Imports request-facing modules |
| `apps/worker/src/main.ts` | Headless worker bootstrap and graceful job shutdown |
| `apps/worker/src/worker-app.module.ts` | Imports consumers and scheduler modules |
| `packages/backend/src/common/guards/` | Session, role, permission and tenant guards |
| `packages/backend/src/common/filters/` | Consistent safe error responses |
| `packages/backend/src/common/interceptors/` | Request IDs and sanitized logs |
| `packages/backend/src/common/context/` | Authenticated actor and tenant context |
| `packages/backend/src/modules/` | Domain modules listed below |
| `packages/backend/src/jobs/` | BullMQ consumers and job contracts |
| `packages/backend/src/outbox/` | Reliable event dispatch and re-dispatch |
| `packages/backend/src/inbox/` | Durable verified provider-event processing |
| `packages/backend/src/health/` | Readiness, liveness and dependency health |

Every substantial module should have a module declaration, controller where applicable, service/use-cases, DTO schemas, repository access and tests of its meaningful invariants. Keep SDK calls out of HTTP controllers.

Backend modules: `auth`, `users`, `resellers`, `agents`, `referrals`, `commission-policies`, `commissions`, `platform-plans`, `subscriptions`, `sites`, `controllers`, `device-claims`, `devices`, `ssids`, `portal-config`, `wifi-packages`, `customers`, `vouchers`, `portal-contexts`, `orders`, `payments`, `access-grants`, `network-sessions`, `usage`, `ledger`, `wallets`, `withdrawals`, `notifications`, `reports`, `support`, `audit`, `settings` and `operations`.

### 5.4 Integration packages

`packages/payments/src/`: `payment-provider.ts`, `snippe.provider.ts`, `snippe.schemas.ts`, `snippe-webhook-verifier.ts`, `fake.provider.ts` and contract fixtures.

`packages/omada/src/`: `controller-adapter.ts`, `capabilities.ts`, `registry.ts`, `openapi-client.ts`, `portal-client.ts`, `cookie-session-manager.ts`, `transport.ts`, `versions/`, `schemas/`, `errors.ts` and lab fixtures. Add an isolated `legacy-admin-api/` only if an operation is actually required and verified.

Use package exports to prevent browser applications from importing `packages/backend`, `packages/db`, `packages/payments` or `packages/omada`. CI must detect leaked server imports and secrets in frontend bundles.

## 6. Roles, permissions and tenant isolation

### 6.1 Permission matrix

| Operation | Admin | Reseller | Agent |
|---|---|---|---|
| Configure Controllers and credentials | Yes | No | No |
| Manage platform plans and commission policy | Yes | View own eligible plans | View their applicable commission terms |
| Create/invite Agents | Yes | No | No |
| Register a Reseller | Yes | Self-registration | Create an invitation/lead |
| View reseller business data | All with audited access | Own business only | Limited attributed reseller status |
| Manage sites, devices and SSIDs | Authorized platform operations | Own and within plan/capabilities | No by default |
| Manage WiFi packages and vouchers | Support operations, audited | Own | No |
| View guest phone numbers and sessions | Authorized support access | Own customers | No |
| View WiFi payments and revenue | Platform-wide | Own | No guest financial detail |
| View Agent commission | All | No unrelated Agent data | Own |
| Request withdrawal | Own eligible ledger account if applicable | Own | Own |
| Approve withdrawals | Yes | No | No |
| View audit logs | Platform-wide | Own relevant activity | Own relevant activity |
| Change referral attribution | Admin exception with reason | No | No |

An Agent may help a Reseller onboard, but attribution does not grant access to the Reseller's devices, passwords, customers or money. Future delegated support access requires a separate explicit permission model.

### 6.2 Backend enforcement

- Derive the actor, role and `resellerId` from the authenticated session and trusted memberships.
- For public portal actions, derive the owner from a validated portal context and server-side site mapping.
- Never trust `role`, `resellerId`, `agentId` or `controllerSiteId` supplied by an unprivileged client.
- Perform tenant-scoped lookups before all updates, exports and Controller calls.
- A UUID's unguessability is not authorization.
- Jobs must carry a persisted operation ID and resolve authorized ownership from the database before execution.
- Enforce composite tenant-aware relationships so a package from Reseller A cannot be assigned to a site or voucher belonging to Reseller B.
- Protect realtime channels and report download URLs using the same permissions as REST.
- Use explicit Admin override services with reason codes and audit entries.
- Prevent a Reseller from claiming an already owned Controller site or EAP by entering its MAC.
- Test access across two Resellers, two Agents and an Admin.

## 7. Authentication, onboarding and referral flow

### 7.1 Authentication

Use backend-owned opaque sessions with high-entropy session tokens. Store token hashes in the database, set secure HttpOnly cookies, rotate on login and privilege changes, revoke on logout and password reset, and implement server-side expiry. Do not put privileged sessions in localStorage.

Require contact verification before trial activation and payout-destination use. Implement verification through a notification-provider interface. Provider credentials not supplied must remain explicit dependencies; do not claim SMS delivery when using a fake transport.

Provide Argon2id password hashing, login throttling, recovery tokens with single use and expiry, CSRF protection for cookie-authenticated writes, trusted origin validation and Admin MFA. Agents and Resellers can enable MFA as well. Create the first Admin using an explicit bootstrap script, with no seeded shared production password.

### 7.2 Reseller self-registration

1. User enters business name, owner contact details, password and optional Agent referral code.
2. Backend validates contact uniqueness and creates the User, Reseller and registration-source record transactionally.
3. If a referral code is supplied, validate active Agent status and bind the eligible attribution on the server.
4. Complete contact verification.
5. Start the onboarding wizard: business profile, plan/trial, first site and device setup.
6. Create a local site with provisioning state; dispatch a Controller provisioning operation after commit.
7. Track provisioning independently of registration so a temporary Controller outage does not erase the account.
8. Direct registration without an eligible referral has no Agent attribution and no Agent commission.

### 7.3 Agent registration/invitation

1. Admin activates the Agent, gives them a referral code and assigns an effective commission policy.
2. Agent enters a prospective Reseller's business and contact details with their consent to the invitation.
3. Backend creates a Lead and Invitation, not a logged-in Reseller with a password chosen by the Agent.
4. Generate a single-use invitation token, store its hash and expiry, and deliver through the configured notification transport.
5. Reseller opens the link, verifies contact details, creates their own password and accepts terms.
6. Bind attribution from the server-owned invitation, ignoring tampered query parameters.
7. Agent sees conversion status and subscription eligibility, not credentials or customer records.
8. Commission can accrue after a qualifying subscription payment and policy checks.

### 7.4 Attribution rules

- One eligible attribution per Reseller by default.
- Invitation attribution takes precedence over an optional referral code on invitation acceptance.
- For self-registration, an explicitly supplied valid referral code is stored at verified registration.
- Do not award attribution through browser fingerprinting or an unverified cookie alone.
- Prevent Agent self-referrals and duplicate reseller conversion credit.
- Existing Resellers cannot attach a referral code later through a public API.
- Admin may correct attribution with a reason and an audit record; already posted commissions keep their original source snapshots.
- Define a configurable referral eligibility period. Store expiry without silently paying commission after eligibility ends.
- Registration/invitation retries must not create duplicate accounts or duplicate referrals.

### 7.5 Reseller lifecycle

Keep independent lifecycle fields: account `pending_verification/active/suspended/closed`, onboarding progress, platform subscription status and site provisioning status. A Reseller may have an active account while provisioning is pending or a subscription is overdue.

Suspension stops new purchases and grants. Existing paid entitlement handling follows an explicit policy. An emergency security suspension can revoke current access through a separate Admin action and an audited operation; never implement it by simply deleting rows.

## 8. Platform subscription billing

Implement platform plans with configurable price, billing period, trial eligibility, maximum sites, EAP count, package count, notification allowance and feature permissions.

Subscription records must snapshot the plan price and entitlements for each invoice. A later plan edit must not rewrite an already paid invoice or commission calculation.

Flow:

1. Reseller selects a plan.
2. Backend creates a subscription invoice and an Order with purpose `PLATFORM_SUBSCRIPTION`.
3. Backend creates a Snippe payment attempt for that immutable amount.
4. Verified payment processing marks the invoice paid once.
5. Extend from the later of current active expiry or the effective activation time, according to a documented upgrade/renewal policy.
6. Emit an outbox event for subscription activation and commission evaluation.
7. Evaluate first-payment versus renewal commission independently.
8. Send receipt/notification and update the dashboard from persisted state.

Define subscription states `trialing`, `active`, `past_due`, `expired`, `suspended` and `cancelled`. Use UTC timestamps and the business timezone for displayed dates and calendar rules. Do not grant a fresh trial by changing email capitalization or reusing an already verified business identity.

When a subscription expires, disable new paid sales by default, show a clear renewal prompt to the Reseller and honor already sold access until its paid expiry. The guest portal should explain temporary unavailability without exposing the Reseller's platform invoice.

## 9. Data model and persistence

### 9.1 Core entities

| Entity | Critical fields and relationships |
|---|---|
| `User` | ID, role, contact, password hash, verification, status, MFA metadata |
| `AuthSession` | User, token hash, expiry, revocation, device metadata |
| `VerificationToken` | Purpose, subject, hash, expiry, used time |
| `Reseller` | Owner User, business name, slug, lifecycle, registration source |
| `Agent` | User, referral code, status, policy assignment |
| `Lead` | Agent, consent metadata, contact, conversion status |
| `ResellerInvitation` | Lead, Agent, token hash, expiry, accepted Reseller |
| `ReferralAttribution` | Reseller, Agent, source, effective dates, audit reference |
| `PlatformPlan` | Versioned price, period, feature and resource limits |
| `Subscription` | Reseller, state, current period, trial and suspension metadata |
| `SubscriptionInvoice` | Plan snapshot, amount, due date, paid Order, period |
| `Controller` | Type, address, Controller ID, version, encrypted credential reference, health |
| `ControllerCapability` | Operation, version profile, supported flag, tested bounds, evidence |
| `Site` | Reseller, name, location, timezone, portal configuration, local state |
| `ControllerSiteMapping` | Site, Controller, remote site ID, remote display name, provisioning state |
| `DeviceClaim` | Requested EAP identity, claimant, verification and approval state |
| `Device` | Site, Controller, MAC, model, hardware version, firmware, observed state |
| `Ssid` | Site, remote ID, name, desired/observed config, sync state |
| `PortalConfiguration` | Slug, branding, allowed landing destinations, enabled methods |
| `WifiPackage` | Reseller, duration, price, speed, quota type, after-limit action, status |
| `PackageSiteAssignment` | Tenant-safe package/site relation |
| `PackageRevision` | Immutable values used for purchases and vouchers |
| `Customer` | Reseller-owned identity/contact, consent and verification metadata |
| `PortalContext` | Site, EAP/client MAC, SSID, radio, client IP, verified binding, expiry |
| `Order` | Purpose, owner, price snapshot, currency, status, fulfillment state |
| `PaymentAttempt` | Order, provider account, reference, request hash, stable idempotency key, status |
| `WebhookInboxEvent` | Provider account/event ID, validated payload, received time, processing state |
| `VoucherGroup` | Reseller, package revision, name, lifecycle |
| `Voucher` | Code HMAC/hash, encrypted export value if needed, activation and entitlement |
| `AccessGrant` | Source Order/voucher, package snapshot, activation window, active/expiry state |
| `AccessGrantDevice` | Grant, client MAC, slot reservation, lease and authorization state |
| `NetworkSession` | Grant/device, connection observations, start/end, termination category |
| `UsageSample` | Session/grant, remote counter identity, bytes, capture time, confidence |
| `QuotaWindow` | Grant, daily/monthly boundaries, accumulated usage and enforcement state |
| `CommissionPolicy` | Version, fixed/percentage mode, trigger, basis, hold and eligibility |
| `CommissionAccrual` | Agent, invoice/payment source, policy snapshot, earned amount, lifecycle |
| `LedgerAccount` | Owner, currency, account type and normal balance |
| `Journal` | Immutable business source, posting/reversal metadata |
| `JournalLine` | Journal, account, debit/credit, currency and integer amount |
| `PayoutDestination` | Owner, verified recipient name/phone, history and status |
| `Withdrawal` | Owner, reserve, requested amount, fee snapshot, approval and state |
| `PayoutAttempt` | Withdrawal, provider reference, stable key, dispatch and reconciliation state |
| `WithdrawalAllocation` | Withdrawal, earning/commission source, reserved amount and settlement state |
| `OutboxEvent` | Event ID, aggregate, payload version, attempts, dispatch state |
| `NetworkOperation` | Tenant, intended action, idempotency marker, attempts, observed result |
| `AuditEvent` | Actor, target, action, reason, safe before/after metadata, request ID |
| `Notification` | Recipient, channel, template, dedup key and delivery state |
| `SupportTicket` | Owner, assigned Admin, messages and lifecycle |
| `SystemSetting` | Typed key, scope, version and audit reference |

Use archival/soft deletion for business resources referenced by historical transactions. Financial journals and payment facts must not be deleted through ordinary CRUD.

### 9.2 Types and constraints

- Money: integer TZS, stored as `BIGINT` or a suitable integer type with explicit bounds. No floating-point financial arithmetic.
- Percentages: integer basis points; `10000` means 100%.
- Quota: `BIGINT` bytes. Explicitly choose decimal MB/GB or binary MiB/GiB in the UI and document conversion.
- Time: UTC timestamps; package duration stored in seconds; calendar windows use the Site's IANA timezone.
- Bandwidth: canonical integer Kbps; display Mbps with one documented conversion. Never confuse Kbps, Mbps and bytes/sec.
- API JSON: serialize BigInt amounts and byte counters as validated decimal strings where required by the public contract.
- Provider calls: convert to safe integers only after bounds validation against provider requirements.
- MAC address: normalize consistently; preserve original values in diagnostic metadata where useful.
- Preserve SSID names as valid strings; avoid case folding or destructive trimming that changes the real SSID identity.
- Financial and fulfillment mutations use database transactions, row locks/optimistic versions and unique constraints.

Required uniqueness includes `(providerAccountId, providerReference)`, `(providerAccountId, eventId)`, `ReferralAttribution.resellerId`, `(sourcePaymentId, agentId, commissionTrigger)`, journal business-source key, withdrawal active reserve key and remote Controller-site mapping. Voucher code lookup must be scoped and collision-safe.

Prevent cross-tenant foreign-key combinations with composite constraints or equivalent verified database constraints. Add indexes for tenant/status/time listing, inbox/outbox processing, pending operations, active-grant expiry, payout reconciliation and voucher lookup.

### 9.3 State-machine boundaries

Do not overload a single `status` field to represent everything. Persist at least:

- Payment attempt: `created`, `dispatching`, `pending`, `unknown`, `completed`, `failed`, `voided`, `expired`, `needs_review`.
- Order payment state: `unpaid`, `paid`, `overpaid`, `cancelled`, `refund_pending`, `refunded`, `needs_review`.
- Order fulfillment: `not_started`, `pending`, `fulfilled`, `failed`, `needs_review`.
- Grant: `pending_activation`, `active`, `expired`, `quota_exhausted`, `revoked`, `activation_failed`.
- Grant-device authorization: `reserved`, `authorizing`, `authorized`, `unknown`, `revoke_pending`, `revoked`, `failed`.
- Withdrawal: `requested`, `approved`, `processing`, `unknown`, `completed`, `failed`, `reversed`, `rejected`, `needs_review`.

Local states are application contracts. Map documented provider/controller states into them without pretending the external system uses the same enum.

## 10. Omada Controller integration

### 10.1 Integration contract discovery

Implement two distinct transports: **management Open API** and **external portal authentication API**. They may use different credentials, authentication headers and sessions.

For the actual Controller, record type, full version, Controller ID, API access address and the applicable API specification. In the Controller's global view, the official guide describes creating an Open API application under Settings → Platform Integration → Open API, choosing role/site privileges and opening Online API Document. Client Credentials mode is suitable for this system-to-system integration. The guide uses an `AccessToken=` authorization prefix; do not replace it with Snippe's Bearer scheme. The direct Controller documentation is the source for exact management paths. [S7]

Build `docs/integrations/omada-contracts.md` with an operation table: method, path, auth scheme, request/response schema, units, supported versions and lab evidence. Operations without evidence remain unsupported.

### 10.2 Version changes that require explicit handling

The official external-portal guide for v6.2.10+ documents `clientIp`, `totalTrafficLimitBytes`, `downloadRateLimitKbps` and `uploadRateLimitKbps`, and describes `time` as an expiration in milliseconds. The older guide describes expiration in microseconds and a different payload. Use separate serializers; test absolute-versus-duration semantics and expiry behavior on the actual Controller/EAP. Do not carry an older “1 Mbps maximum” assumption into every Controller profile. [S8, S9]

The v6.2.10 article has code examples whose login/auth URL placement does not match its prose. Treat this as a documentation inconsistency: use the stated login/auth endpoints, verify them in a lab and keep evidence. Never copy the sample blindly. [S8]

### 10.3 Adapter design

```ts
type CapabilityResult = {
  supported: boolean;
  verified: boolean;
  reason?: string;
  limits?: Record<string, string | number>;
};

interface OmadaControllerAdapter {
  inspectController(): Promise<ControllerInspection>;
  getCapabilities(): Promise<ControllerCapabilities>;
  createSite(input: CreateSiteInput): Promise<RemoteSiteResult>;
  getSite(input: RemoteSiteLocator): Promise<RemoteSiteResult>;
  listDevices(input: RemoteSiteLocator): Promise<RemoteDevice[]>;
  adoptDevice(input: VerifiedAdoptionInput): Promise<RemoteOperationResult>;
  listClients(input: RemoteSiteLocator): Promise<RemoteClient[]>;
  provisionSsid(input: DesiredSsidInput): Promise<RemoteOperationResult>;
  configureExternalPortal(input: DesiredPortalInput): Promise<RemoteOperationResult>;
  authorizeClient(input: ClientAuthorizationInput): Promise<AuthorizationResult>;
  getClientAuthorization(input: ClientLocator): Promise<AuthorizationObservation>;
  disconnectClient(input: ClientLocator): Promise<RemoteOperationResult>;
  revokeAuthorization(input: ClientLocator): Promise<RemoteOperationResult>;
  blockClient(input: ClientLocator): Promise<RemoteOperationResult>;
  unblockClient(input: ClientLocator): Promise<RemoteOperationResult>;
  readUsage(input: UsageReadInput): Promise<UsageObservation>;
}
```

These are **internal interfaces**, not assertions that Omada supports every operation. Unsupported methods return typed unsupported errors. Optional advanced features need capability checks before UI rendering or order creation.

Portal login uses a dedicated Hotspot Operator, a cookie session and CSRF handling according to the applicable guide. [S8]

For the documented portal profile, verify these Controller-relative paths: `POST /{controllerId}/api/v2/hotspot/login` and `POST /{controllerId}/api/v2/hotspot/extPortal/auth`. [S8]

Keep cookie sessions isolated by Controller/operator. Use a session refresh lock to avoid simultaneous worker logins invalidating each other. Do not forward Controller cookies or credentials to browsers. Validate TLS with a trusted certificate or configured CA; do not globally disable verification.

### 10.4 Capability matrix

Build a runtime matrix for:

- Create/read site.
- Discover and adopt an eligible EAP.
- Read device health/model/firmware.
- Create/edit SSID.
- Configure and assign external portal.
- Authorize a client and read authorization state.
- Disconnect, revoke, block and unblock as distinct operations.
- Set per-client download/upload limits and their tested bounds.
- Apply total traffic quota.
- Obtain reliable usage counters and their reset semantics.
- Enforce daily/monthly quota windows.
- Reduce speed after quota or redirect to renewal.
- Reboot or firmware management, if explicitly supported.

Each capability is qualified by Controller version, API route, EAP model/hardware revision/firmware and relevant network settings. A successful Controller response is not evidence of measured throughput or quota enforcement.

### 10.5 Site provisioning flow

1. Reseller creates a site within plan limits; backend persists local desired state.
2. Reserve a suitable Controller from the registry.
3. Create a provisioning operation with an external identity marker.
4. Worker creates the Controller site through a verified route.
5. Save the remote ID separately from the human-readable site name.
6. Provision SSID and external portal policy where supported.
7. Read back observed configuration; mark local state ready only when required settings exist.
8. Return device setup instructions tailored to this site and selected Controller.
9. If a call times out, reconcile remote state before reissuing a create request.
10. If automation is unsupported, expose a clearly named manual configuration task and require observed configuration before enabling sales.

A site may be `requested`, `provisioning`, `awaiting_device`, `ready`, `failed` or `needs_review`. Retries reuse the same local operation and cannot create duplicate remote sites.

### 10.6 Device claim and adoption

- Collect MAC, model, hardware revision and optional serial from the Reseller.
- Verify physical ownership/eligibility through an Admin-approved claim or a documented Controller discovery/claim mechanism.
- Typing a MAC address is not sufficient proof of ownership.
- EAP must have a functioning upstream internet/network connection and be able to reach the Controller's required adoption/management services.
- Produce a network setup checklist from official documentation for the exact versions; do not hard-code a universal port list.
- Keep device claim, adoption and connected status separate.
- If already adopted elsewhere, return a clear state requiring an authorized migration rather than issuing an automatic factory reset.
- A failed adoption API must preserve a retryable local claim and the actual sanitized error.

### 10.7 Captive portal context validation

Read expected redirect fields for the selected Controller profile. Resolve `brandSlug` to a local Site and Controller mapping; cross-check remote site, EAP, SSID and client presence against the Controller where available.

Omada query parameters should be treated as untrusted input; a MAC address is not a password. If the vendor redirect is not signed, do not describe it as cryptographically authenticated. Use Controller-side corroboration where supported, a short-lived server-created portal context and a high-entropy context token. If binding cannot be established sufficiently, request a fresh WiFi redirect or a configured support recovery flow.

After storing the context, keep raw identifiers out of later URLs. Permit only configured post-login landing destinations; reject arbitrary redirect URLs and server-side destinations. Context expiry must allow a pending payment to be recovered safely through a fresh validated context without transferring an unrelated customer's entitlement.

### 10.8 Guest access authorization

1. A verified payment or valid voucher creates an entitlement; never grant access on payment-intent creation.
2. Reserve a device slot transactionally under the grant's concurrency limit.
3. Persist an authorization attempt before the network request.
4. Serialize the expected fields and units through the Controller version adapter.
5. Submit the grant with bounded timeouts and interpret both HTTP status and documented business error fields.
6. Persist the Controller response and effective expiry, with secrets redacted.
7. If confirmation is ambiguous, use `unknown` and reconcile; do not create a fresh payment or extend validity indefinitely.
8. Mark authorization accepted only on a confirmed accepted result or verified observed state.
9. Display “Connected” only when the available evidence supports it; otherwise show “Access enabled — checking connection” or “Payment received — activating WiFi”.
10. Release failed slot reservations and retain recoverable entitlements.

The first successful activation sets a fixed `activatedAt/expiresAt`. Reconnects, worker restarts and duplicate events do not restart the purchased duration. Pending activation has a bounded deadline and a documented refund/support path.

Persist a candidate activation time and intended expiry before the first external authorization call. If the Controller accepts but the worker crashes before committing confirmation, reconcile and adopt that original expiry. Never calculate a fresh full-duration expiry for an ambiguous retry. Only a definitely unaccepted activation may start a new candidate clock. Keep `confirmedAt` separate from that clock and explain the small dispatch-time difference in the documented policy.

### 10.9 Expiry, disconnection and data limits

Send Controller-enforced expiry where supported and reconcile periodically; a BullMQ timer alone must not be the only internet-expiry mechanism.

Distinguish disconnecting a current WiFi connection from revoking its authorization and from blocking a client. A kick can allow immediate reconnection if the entitlement is still active. Tests must prove the intended behavior for revoke and expiry.

For data packages:

- Unlimited: no advertised quota.
- Total: one quota for the lifetime of the entitlement.
- Daily: independent calendar-day windows in the Site timezone.
- Monthly: independent calendar-month windows in the Site timezone.

Store usage uncertainty and remote counter resets. Cumulative counters may reset on reboot or reconnect; identify their epoch/session and never double-count samples. Quota enforcement across multiple devices consumes one shared entitlement allowance unless the package explicitly says otherwise.

If a quota requires polling, measure the possible overrun and do not advertise a strict hard cap without verified enforcement. Polling is insufficient evidence for exact quota enforcement during worker/controller outages. Daily/monthly windows need a verified mechanism for reset/re-authorization; otherwise disable sale of those package types for that site.

For `Disconnect`, `Reduce Speed` and `Redirect to Renew`, enable only validated after-limit actions. Do not simulate a network redirect through a frontend message while the client still has unlimited access.

If promised speed/quota enforcement cannot be applied, use the configured failure policy: hold activation or explicitly sell a compatible unlimited package. Never silently authorize an advertised capped package without its cap.

## 11. Snippe integration — verified contract baseline

Use the requested documentation version: **2026-01-25**. Re-read the relevant pages and SDK types during implementation; retain source URLs and date in the repository.

### 11.1 Authentication and server boundary

The documented API host is `https://api.snippe.sh` and API-key requests use `Authorization: Bearer <api_key>`. Collection and disbursement permissions are separate scopes. Keep the API key and signing secret server-side; browser applications get only public application endpoints. Do not use merchant dashboard JWT endpoints as though they were API-key endpoints. [S1]

### 11.2 Collections and lookups

Use `POST /v1/payments` for mobile collection and `GET /v1/payments/{reference}` for verification. Documented mobile creation requires `payment_type: mobile`, `details.amount`, `details.currency: TZS`, `phone_number`, and customer firstname/lastname/email; it supports `webhook_url` and metadata. The documented TZS minimum is 500. Do not invent a customer's email to bypass required fields; collect real required details or obtain a verified alternative contract. [S2, S3]

Use a PaymentProvider interface so SDK transport does not own order or ledger rules. Save the exact normalized request and its hash before dispatch; a retry uses that saved request.

### 11.3 Idempotency and ambiguous requests

Snippe documents `Idempotency-Key` with a maximum of 30 characters, a 24-hour validity period, reuse for the same body and conflict for a changed body. Generate a compact persisted key, such as a fixed prefix plus a random 24-character identifier. Do not send a 36-character UUID directly as the header. [S3]

App-level idempotency must remain permanent even after provider-key expiry. Persist unique payment/order effects locally. A timeout is an unknown outcome, not proof of failure. Reconcile before another attempt; never blindly resubmit an unresolved create after the provider's deduplication window.

Separate HTTP-request idempotency keys from provider-attempt keys. Repeated submit/clicks return the existing pending attempt. An intentionally new payment attempt requires an explicit state transition and duplicate-payment handling.

### 11.4 Webhook contract

For this version, the envelope contains `id`, `type`, `api_version`, `created_at` and `data`; money is read from `data.amount.value/currency`. Verify `X-Webhook-Timestamp` and `X-Webhook-Signature` over the exact raw body using HMAC-SHA256 of `timestamp.rawBody`, with constant-time comparison. Do not parse and stringify before verification. Verify signatures in production and use a bounded clock/replay policy consistent with actual delivery retries. [S4]

The SDK documents a raw-Buffer verification helper. NestJS supports `rawBody: true` with Fastify. Preserve that buffer and adapt the SDK helper to Nest; do not paste Express middleware into the Fastify bootstrap. [S5, S15]

### 11.5 Application webhook processing

1. Receive bounded-size raw bytes on `POST /api/v1/webhooks/snippe`.
2. Validate signature, timestamp, JSON schema and configured provider account.
3. Persist a verified inbox event and an outbox dispatch transactionally.
4. Acknowledge only after durable receipt; database failure returns retryable failure.
5. If an already verified event ID is stored, return success without processing again.
6. Worker resolves the corresponding provider reference and immutable local payment attempt.
7. Validate amount/currency/account against the saved Order; treat metadata as a lookup hint, not authority to choose a beneficiary.
8. Quarantine unexpected, unmatched or amount-mismatched events for reconciliation.
9. Atomically apply the permitted state transition, journal entries and fulfillment outbox events.
10. If the process crashes, a lease/retry reprocesses the inbox without duplicating effects.

Use DB uniqueness, not a race-prone “check then insert”. Do not acknowledge and rely solely on an in-memory callback. Protect against failed/expired events arriving after a completed payment. Unknown events should be stored and classified, not crash the service.

Store an event payload hash. A repeated ID with conflicting signed content requires an audit exception. If a legitimate delivery fails the configured freshness policy, reconcile its payment/reference through an authenticated provider lookup; do not weaken verification or strand the receipt indefinitely.

### 11.6 Provider expiry and conflicts

The Snippe payments page describes a four-hour timeout; the webhook event table describes a different default. Prefer `expires_at` returned for the actual payment and reconcile provider status rather than hard-coding one timeout globally. [S3, S4]

Likewise, avoid copying example fees as production tariffs. Fee allocation comes from an approved application policy and actual provider settlement data. Do not infer every network's capabilities from one incomplete network-code table.

### 11.7 Payout integration

Documented mobile payouts use `POST /v1/payouts/send` with integer `amount`, `channel: mobile`, recipient phone/name and optional narration/webhook/metadata. Read status using `GET /v1/payouts/{reference}`. A creation response is pending processing, not proof the beneficiary received money. [S6]

The payout API describes fee lookup through `GET /v1/payouts/fee` and states pending/completed/failed/reversed. Use the installed SDK or full endpoint docs to confirm fee-query parameters. The SDK exposes a payout-fee method; do not guess its response normalization. [S5, S16]

Refunds are a separate business operation. Do not invent a Snippe refund endpoint or automatically label a normal payout as a refund. Implement an audited refund workflow only through a verified mechanism, preserving the original payment and its reversal entries.

## 12. Customer purchase, voucher and session flows

### 12.1 Paid WiFi purchase

```mermaid
sequenceDiagram
  participant C as Customer
  participant P as Portal
  participant B as Backend and worker
  participant S as Snippe
  participant O as Omada
  C->>P: Open WiFi login and select package
  P->>B: Validated context and purchase request
  B->>S: Create one payment attempt
  S-->>C: USSD authorization request
  S->>B: Signed completion webhook
  B->>B: Persist payment and entitlement once
  B->>O: Authorize client with verified package limits
  O-->>B: Accepted result or error
  P->>B: Fetch payment and access status
  B-->>P: Payment state and activation state
```

1. Validate portal context and list enabled site packages with capability-compatible terms.
2. Customer chooses a package; backend snapshots its price, duration, limits and revision.
3. Collect required payment contact fields and normalize Tanzania phone format.
4. Create the Order and PaymentAttempt with request idempotency.
5. Backend initiates Snippe collection.
6. Portal displays pending payment and advises the customer to authorize the prompt.
7. Portal polls Advo TZ status with bounded backoff; it does not poll Snippe using a private key.
8. Payment handler validates completion and creates ledger effects and one entitlement.
9. Worker authorizes the reserved client/device.
10. Portal shows payment received separately from activation success/failure.
11. A reconnect recovers remaining entitlement; it does not restart paid time.
12. Another device can join only through a secure entitlement-bound flow and within the package's concurrent-device allowance.

If two attempts both complete for the same Order, record both receipts and an overpayment liability/review case. Do not create two grants, extend time unintentionally or discard the second receipt.

If payment completes after a local UI countdown expired, reconcile it as a real receipt. Recover fulfillment safely or route to refund/support; never silently lose the money.

### 12.2 Voucher management and redemption

- Generate random high-entropy human-readable codes with a server-side keyed lookup hash.
- Support naming/renaming groups, exporting printable vouchers and deleting unused vouchers.
- Preserve financial/audit history when archiving groups.
- Keep export values encrypted if later re-download is required; hashing alone cannot reproduce codes.
- Use package-revision snapshots so editing a package does not change old vouchers.
- Implement first-redemption activation deadline, purchased duration and maximum devices.
- Redemption reserves/creates its grant under a transaction and uniqueness constraint.
- Repeated redemption by the same authorized context returns the existing entitlement.
- Concurrent first redemption cannot consume the same single-use code twice.
- `Revoke & Disconnect` marks entitlement revoked and dispatches verified revocation/disconnection operations; show pending network enforcement until confirmed.
- Never trust the client to choose a voucher's tenant or package.

### 12.3 Customer identity and recovery

A phone number alone is not proof that a visitor owns a prior paid grant. Use a high-entropy purchase token, validated portal context and a configured verification/recovery mechanism. Mask private customer data in public responses.

If MAC randomization produces a new client identity, treat it as a new device slot unless a verified transfer flow releases the old slot. Do not auto-authorize any arbitrary MAC submitted with a phone number.

### 12.4 Session accounting

Keep controller-reported connections separate from package lifetime. A radio disconnect, roaming event or lost-carrier observation does not prove a purchased entitlement has expired. Use known termination categories: user disconnected, observed loss of connection, entitlement expiry, quota action, explicit revoke and unknown.

Reconciliation must handle reconnects, AP roaming, stale Controller telemetry and counter resets. UI should show “last observed” timestamps when realtime certainty is unavailable.

## 13. Agent commission engine

### 13.1 Commission policies

Admin can configure effective-dated policies for:

- First successful reseller subscription payment.
- Subsequent successful subscription renewal.
- Fixed TZS commission or percentage of an explicit eligible base.
- Eligible plan list, referral eligibility period and payout hold duration.
- Gross-versus-net base and exclusions such as taxes/fees/credits, if present.
- Maximum commission per invoice and an optional referral cap.
- Handling Agent suspension, refunds, reversals and already paid commission.

Default to commission from Reseller platform subscriptions. Registration alone, a trial, a failed payment or a customer WiFi payment does not generate Agent earnings unless a separate enabled policy says so.

### 13.2 Calculation and accrual

For percentage policy use integer arithmetic:

```text
commissionTzs = floor(eligibleBaseTzs * commissionBasisPoints / 10000)
```

Use a bounded/BigInt intermediate and validate the result. Fixed amounts and percentages must not exceed the configured eligible cap.

Transactionally resolve attribution, select the effective policy, snapshot policy/base/rate, create one accrual per qualifying source and post a pending commission liability. Apply a database constraint to stop concurrent duplicates.

Commission lifecycle: `pending_hold`, `available`, `reserved_for_withdrawal`, `paid`, `reversed`, `needs_review`. Do not mutate historic rates when Admin changes the current policy.

Track pending, available, reserved and paid amounts per accrual, with withdrawal allocations supporting partial withdrawals and multiple accruals per payout. A partial withdrawal does not mark the entire original commission as paid. Lifecycle labels may be derived from these amounts.

### 13.3 Explicit demo example

**Demo only:** subscription eligible base 20,000 TZS, percentage 10% = 2,000 TZS commission. Neither 20,000 TZS nor 10% is an approved production policy.

A first-payment fixed commission can be configured separately; do not hard-code rates from another product's history.

### 13.4 Refund and reversal behavior

- If pending/available commission is reversed before payout, post reversing journal entries.
- If a payout has been reserved, coordinate reversal under the same beneficiary lock.
- If commission has already been paid, create a recoverable adjustment/debt or Admin review according to policy; never pretend an external payout was undone.
- A payout reversal restores the actual returned funds through ledger entries and makes any re-payout an explicit new operation.
- Agent reports display earned, pending, available, withdrawn and reversed amounts distinctly.

## 14. Financial ledger and wallets

### 14.1 Ledger rules

Implement append-only double-entry journals with balanced debits and credits per currency. Keep business-source uniqueness, timestamps, actor/source references and reversing entries. A mutable `wallet.balance += amount` must not be the source of truth.

Accounts should distinguish provider clearing/receivables, platform subscription revenue, platform sale-fee revenue, reseller payable, Agent pending/available payable, commission expense, withdrawal reserves, fee expense and refund/adjustment liabilities as required by the final policy.

Wallet balances may be cached transactionally for efficient reads, with ledger reconciliation proving equivalence. Protect debit/reservation operations through row locking or equivalent serialization so concurrent withdrawal requests cannot overspend.

### 14.2 WiFi collection example

The following allocation is a **demo example**, not a Snippe tariff or approved platform price:

| Item | Example TZS |
|---|---:|
| Customer gross payment | 1,000 |
| Actual provider fee assumed for this example | 25 |
| Platform sale fee assumed for this example | 75 |
| Reseller payable | 900 |

Example balanced postings when the Reseller bears both fees:

1. Debit provider clearing 1,000; credit reseller payable 1,000.
2. Debit reseller payable 25; credit provider clearing 25 for the actual fee withheld.
3. Debit reseller payable 75; credit platform sale-fee revenue 75.

Do not credit available funds using estimated settlement fees and quietly overwrite later. If net/fees are not known, post to a pending settlement state and reconcile before availability, or use a documented reserve policy.

Provider account funds and the sum of platform wallets are related through the ledger, but not interchangeable. In-flight receivables, fees and reserved payouts require reconciliation.

### 14.3 Subscription and commission example

A Reseller platform subscription is platform revenue, not a credit to the same Reseller's earnings wallet. Agent commission is posted as commission expense and Agent payable based on the eligible subscription receipt.

Pending commission moves to available through a journal transition after the configured hold. Payout reservations move available liability to reserved liability without making money vanish from the accounting history.

### 14.4 Reconciliation

Regularly compare provider transactions, successful local receipts, fee allocations, wallet liabilities and withdrawal results. Produce actionable exception records for unmatched references, fee differences, duplicate receipts, stale processing and provider-balance shortages.

Use non-destructive correction journals. Never “fix” disagreement by editing a posted journal line or resetting wallets to the provider's balance.

## 15. Withdrawals and payouts

Support Reseller earnings withdrawals and Agent commission withdrawals through the same financial engine with separate eligibility policies.

1. Beneficiary selects a verified payout destination and requested recipient amount.
2. Backend obtains a provider-fee quote and calculates any configured platform withdrawal fee.
3. Present recipient amount, provider fee, platform fee and total wallet debit clearly.
4. Persist the fee-policy/quote snapshot and approved maximum debit.
5. Under a transaction and beneficiary lock, reserve available funds and create the withdrawal.
6. Admin approves or rejects with a reason. Rejection releases the reserve transactionally.
7. Worker revalidates eligibility, destination snapshot, quote age and provider balance.
8. If actual required fees exceed the approved debit, do not silently increase the charge; hold for a new approved quote or a configured platform-funded difference.
9. Persist a PayoutAttempt and stable key before calling Snippe.
10. Interpret pending as processing. A network timeout is `unknown` and retains the reserve.
11. Confirm completion through a verified webhook/status lookup, then post the payout and fee journal once.
12. Confirm failure and the actual returned funds before releasing the appropriate reserve; account for any fee that was not refunded.
13. Process reversed payouts with actual reversal evidence and compensating journals.
14. Never retry an uncertain payout with a new key merely because the worker restarted.

Store the payout destination snapshot used for each attempt. Changing the profile phone number must not redirect an already approved withdrawal.

An Admin click must not directly call a live payout API without the persisted withdrawal/approval/reservation workflow. Financial review is an application behavior; routine code implementation and tests proceed without requesting extra approval.

## 16. Durable events, queues and retries

Use an outbox in the same PostgreSQL transaction as the business change that requires work. An outbox dispatcher sends BullMQ jobs with stable application IDs. Redis downtime must not lose completed payment fulfillment.

Design for at-least-once delivery and idempotent effects. Do not claim end-to-end exactly-once behavior across PostgreSQL, Redis, Snippe and Omada.

Job groups:

| Queue | Work |
|---|---|
| `network-provisioning` | Site/SSID/portal operations and readback |
| `network-access` | Authorize/revoke/disconnect and device-slot cleanup |
| `network-reconciliation` | Clients, sessions, expiry and usage observation |
| `payment-events` | Verified inbox processing and order settlement |
| `payment-reconciliation` | Pending/unknown payments, missing webhook lookup |
| `commissions` | Eligibility, holds, release and reversals |
| `withdrawals` | Approved payout dispatch and result reconciliation |
| `notifications` | Receipts, invitations, reminders and delivery status |
| `reports` | Large authorized exports |
| `maintenance` | Expiry cleanup, retention and consistency checks |

BullMQ/Nest integrates persistent queue data with Redis. Keep Redis persistence/retention appropriate to jobs and keep durable business truth in PostgreSQL. [S17]

Per-Controller concurrency and backoff must prevent overload. Prioritize paid access over bulk inventory sync. Use exponential backoff with jitter, provider-specific retry classification and dead-letter/review states.

Do not retry permanent validation errors indefinitely. For uncertain creates, query observed state first. Job completion must only follow a durable final or consciously scheduled-next state. Store operation attempt counts, last error code, next retry time and an audit-safe response summary.

Outbox dispatch must tolerate a crash after enqueue but before marking dispatched; consumers remain idempotent. Re-dispatch stale operations based on database state even if a Redis job key was removed after completion.

Use stable BullMQ IDs compatible with its ID restrictions; avoid colon-delimited custom IDs. Do not rely on queue deduplication alone for financial safety.

## 17. API design

Use REST under `/api/v1` and generate a usable OpenAPI specification. All endpoints below are **Advo TZ application endpoints**, not Snippe or Omada vendor paths.

### 17.1 Endpoint groups

| Area | Representative routes |
|---|---|
| Auth | `POST /auth/register`, `/auth/login`, `/auth/logout`, `/auth/verify`, `/auth/forgot-password`, `/auth/reset-password`; `GET /auth/me` |
| Invitations | `POST /agent/invitations`; public invite preview/accept using a scoped token |
| Admin | `/admin/resellers`, `/admin/agents`, `/admin/controllers`, `/admin/platform-plans`, `/admin/commission-policies`, `/admin/audit` |
| Sites | `/reseller/sites`, `/reseller/sites/:id/provision`, `/reseller/sites/:id/health` |
| Devices | `/reseller/device-claims`, `/reseller/devices`, `/reseller/devices/:id/operations` |
| SSIDs | `/reseller/sites/:id/ssids` and observed configuration |
| WiFi packages | `/reseller/packages`, package-site assignments, preview and revision history |
| Vouchers | `/reseller/voucher-groups`, `/reseller/vouchers`, authorized exports and revoke operations |
| Customers/sessions | `/reseller/customers`, `/reseller/sessions`, `/reseller/sessions/:id/revoke` |
| Subscriptions | `/reseller/subscription`, `/reseller/subscription/invoices`, `/reseller/subscription/checkout` |
| Agent | `/agent/overview`, `/agent/referrals`, `/agent/commissions`, `/agent/policy` |
| Wallets | `/reseller/wallet`, `/agent/wallet`, transaction/history views |
| Withdrawals | Owner create/list; Admin approval/rejection; operation status |
| Public portal | `/portal/:slug/bootstrap`, `/portal/orders`, `/portal/orders/:token/status`, `/portal/vouchers/redeem` |
| Webhook | `POST /webhooks/snippe` |
| Operations | Authorized `GET /operations/:id` and controlled retries |
| System | `/health/live`, `/health/ready`, internal metrics |

Design state-changing network actions as operations, not misleading immediate CRUD successes. For example, a revoke request returns `202` plus operation state until observed enforcement is confirmed.

### 17.2 Contract conventions

- Validate requests using DTO schemas and a single chosen validation path.
- Return consistent `code/message/requestId/details` errors without provider secrets.
- Use clear error codes: `TENANT_ACCESS_DENIED`, `CONTROLLER_UNAVAILABLE`, `CAPABILITY_UNSUPPORTED`, `PAYMENT_PENDING`, `PAYMENT_AMOUNT_MISMATCH`, `ACTIVATION_PENDING`, `DEVICE_LIMIT_REACHED`, `INSUFFICIENT_BALANCE` and `PAYOUT_NEEDS_REVIEW`.
- Require application idempotency keys for order creation, redemption, withdrawal and other repeated financial actions.
- Return immutable resource/operation identifiers and ownership-safe status responses.
- Use bounded pagination and safe sort/filter allowlists; large exports run as jobs.
- Apply no-store/private cache rules to financial, session and public order-status responses.
- Scope TanStack query keys by authenticated identity/tenant and clear caches on logout or tenant switch.
- Use high-entropy tokens for public order status; internal sequential IDs or phone numbers must not unlock it.

## 18. Frontend screens and experience

### 18.1 Admin dashboard

Provide overview KPIs: active/trial/overdue Resellers, active Agents, customer sales, platform subscription revenue, pending commission, withdrawal reserves, Controller health and activation failures. Keep provider gross collection separate from platform revenue and reseller earnings.

Screens:

- Reseller list/detail, verification, subscription, sites and audited suspension.
- Agent creation/activation, referral attribution and assigned commission terms.
- Plans, commission policies and effective-date history.
- Controllers, capability matrix, version/contracts, health and provisioning operations.
- Payment inbox/reconciliation, mismatches and duplicate receipt cases.
- Ledger views and wallet reconciliation.
- Withdrawal review with beneficiary/fee/amount snapshot and approve/reject reason.
- Network-operation retries with observed state.
- Reports, notification settings, support and audit history.

Never make irreversible factory reset/firmware actions a casual toolbar button. If such actions are implemented, require explicit authorized intent, operation tracking and model-specific instructions.

### 18.2 Reseller dashboard

Provide today's gross sales, net earnings, active entitlements, observed connected clients, device health, subscription expiry and pending withdrawals.

Screens:

- Onboarding checklist and first-site setup.
- Sites and device claim/adoption progress.
- SSIDs and captive portal branding preview.
- Packages with capability-aware speed/quota controls.
- Voucher groups, printable export, rename/delete unused/revoke used.
- Customer and session detail with remaining time/usage confidence.
- Payments, receipts, settlement fees and net revenue.
- Wallet and withdrawal request/history.
- Platform subscription, invoices and renewal.
- Sales reports, support and business settings.

Treat AP offline status as observed telemetry with last-seen time. Do not claim all users are disconnected just because one poll failed.

### 18.3 Agent dashboard

Provide referral code/link, invitation creation, leads, accepted Resellers, qualifying subscription conversions, pending/available commissions and withdrawal history.

Show current policy terms and the policy snapshot behind each accrual. Show clear reasons for ineligible or reversed commission. Restrict Reseller information to name/business, attribution status and allowed conversion metadata.

### 18.4 Guest portal

Mobile-first screens:

- Business logo/name and simple package choices.
- Duration, price, speed, quota and maximum-device terms clearly visible.
- Mobile money payment form using real required details.
- Voucher field and clear validation feedback.
- Payment pending, payment confirmed/activation pending, activated, failed and recovery states.
- Remaining entitlement time and supported usage display.
- A support entry with an opaque order reference.

Example Swahili messages:

- “Chagua kifurushi chako.”
- “Weka namba ya simu ya kufanya malipo.”
- “Thibitisha ombi la malipo kwenye simu yako.”
- “Malipo yamepokelewa. Tunaunganisha WiFi yako.”
- “WiFi yako iko tayari kutumika.”
- “Tumepokea malipo, lakini kuunganisha WiFi bado kunaendelea.”
- “Voucher hii imeshatumika au imeisha muda.”

Host portal fonts, icons and compiled assets on allowlisted application origins. Do not depend on external font/CDN scripts before authentication. Walled-garden requirements must be based on actual browser/payment flow; Snippe server-to-server API traffic does not automatically mean guests need access to the API hostname.

Avoid service-worker caching of payment/access state. Keep a small initial bundle and render package content on the server where practical. A new portal visit must safely handle missing/invalid redirect context. Test real Android/iOS captive login windows; Playwright alone cannot prove captive-browser behavior.

### 18.5 Data and UI behavior

- Implement loading, empty, validation, permission-denied, stale and failure states.
- Disable duplicate financial submissions while a request is pending; backend idempotency remains the real protection.
- Use URL-based filters and pagination for shareable dashboard views.
- Provide keyboard navigation, visible focus, accessible labels and responsive tables.
- Use skeletons when useful, clear inline errors and restrained notifications.
- Optimistic updates are appropriate for reversible UI preferences, not payment/payout or hardware-success states.
- Localize money/date labels; store UTC and display business/site timezone explicitly where it matters.
- Explain customer terms using plain language rather than raw API field names.

## 19. Advo TZ brand and color system

Colors are practical UI approximations from the provided gradient logo, not an official brand-manual measurement.

| Token | Hex | Intended use |
|---|---|---|
| `brand-charcoal` | `#111213` | Sidebar, header and marketing hero |
| `brand-blue` | `#1B5EA4` | Primary interactive color |
| `brand-blue-hover` | `#2176C2` | Hover, charts and secondary emphasis |
| `brand-gold` | `#FBA102` | Highlight, pricing emphasis and warm accents |
| `brand-orange` | `#F16304` | Marketing accent and gradient |
| `surface-page` | `#F7F9FC` | Dashboard background |
| `surface-card` | `#FFFFFF` | Cards, inputs and tables |
| `text-main` | `#18212F` | Main body text |
| `text-muted` | `#526174` | Secondary readable text |
| `border-default` | `#DFE5EC` | Separators and input borders |
| `status-success` | `#166534` | Success text and icons |
| `status-warning` | `#92400E` | Warning text and icons |
| `status-danger` | `#B91C1C` | Errors and destructive actions |

```css
:root {
  --advo-charcoal: #111213;
  --advo-blue: #1b5ea4;
  --advo-blue-hover: #2176c2;
  --advo-gold: #fba102;
  --advo-orange: #f16304;
  --advo-page: #f7f9fc;
  --advo-card: #ffffff;
  --advo-text: #18212f;
  --advo-muted: #526174;
  --advo-border: #dfe5ec;
  --advo-brand-gradient: linear-gradient(135deg, #fba102, #f16304);
}
```

Map these application tokens to the selected HeroUI/Tailwind theming API. Do not paste a v2 theme configuration into a v3 project.

Design direction: light dashboard surfaces, dark sidebar, blue primary actions and a small amount of gold/orange. Use white text on the darker blue; use dark text on bright gold/orange and verify contrast on hover/focus variants. Reserve the gradient for a small marketing highlight or pricing element, keeping forms/tables easy to read.

Use a consistent self-hosted font family, approximately 14–16px body text, clear headings, 8px-based spacing and restrained card radii/shadows. Logo text and product brand must be configurable; do not rebuild the supplied bitmap as inaccurate CSS artwork.

## 20. Environment configuration

Create a documented `.env.example`. Placeholders below are not real credentials; validation must reject required placeholders in production.

```dotenv
NODE_ENV=development
APP_NAME="Advo TZ"
BUSINESS_TIMEZONE=Africa/Dar_es_Salaam
DEFAULT_CURRENCY=TZS

WEB_PORT=3000
PORTAL_PORT=3001
API_PORT=4000
WEB_PUBLIC_URL=http://localhost:3000
PORTAL_PUBLIC_URL=http://localhost:3001
API_PUBLIC_URL=http://localhost:4000
API_INTERNAL_URL=http://api:4000

POSTGRES_DB=advo
POSTGRES_USER=advo
POSTGRES_PASSWORD=replace_for_your_environment
DATABASE_URL=postgresql://advo:replace_for_your_environment@localhost:5432/advo
REDIS_URL=redis://localhost:6379

AUTH_COOKIE_SECURE=false
AUTH_SESSION_TTL_SECONDS=86400
CSRF_TRUSTED_ORIGINS=http://localhost:3000,http://localhost:3001
TRUST_PROXY=false
SECRETS_ENCRYPTION_KEY=replace_with_generated_key
VOUCHER_LOOKUP_HMAC_KEY=replace_with_generated_key

PAYMENT_PROVIDER=fake
PAYMENTS_MODE=centralized
SNIPPE_BASE_URL=https://api.snippe.sh
SNIPPE_API_KEY=
SNIPPE_WEBHOOK_SECRET=
SNIPPE_WEBHOOK_URL=
SNIPPE_API_DOC_VERSION=2026-01-25
ALLOW_LIVE_FINANCIAL_TESTS=false

OMADA_MODE=fake
OMADA_CONTROLLER_TYPE=software
OMADA_BASE_URL=
OMADA_CONTROLLER_ID=
OMADA_CONTROLLER_VERSION=
OMADA_CLIENT_ID=
OMADA_CLIENT_SECRET=
OMADA_HOTSPOT_OPERATOR_USERNAME=
OMADA_HOTSPOT_OPERATOR_PASSWORD=
OMADA_CA_CERT_PATH=

NOTIFICATION_PROVIDER=fake
SMS_PROVIDER_API_KEY=
EMAIL_PROVIDER_API_KEY=
PUBLIC_SUPPORT_CONTACT=
LOG_LEVEL=info
```

For multiple Controllers, use encrypted registry secrets or a secrets-manager reference per Controller; the initial environment values may bootstrap the first entry. Keep encryption keys separate from stored ciphertext and record key versions for rotation.

Public frontend environment variables contain only public presentation values. Provider secrets, database URLs and session signing/encryption material must not use the `NEXT_PUBLIC_` prefix.

Inside Docker Compose, database/Redis hosts must be service names (`postgres`, `redis`), not localhost. Keep a clearly documented host-development configuration and a Compose runtime override. The scripts must load environment files consistently rather than assuming all tools automatically read the same `.env`.

Production startup must reject fake payment/controller providers, insecure session cookies, missing signing secrets and live integrations with an unverified critical capability profile. Health/readiness should distinguish missing credentials from a transient downstream outage.

## 21. Installation and developer setup

### 21.1 Required prerequisites

Install a supported Node.js LTS runtime, pnpm and Docker with Compose. Baseline Node.js 24; verify compatibility for the selected dependencies. Record OS-specific installation links instead of silently assuming one workstation OS. [S10, S14]

If pnpm is not installed, one documented option is installing it through npm, then pinning the selected version in `package.json`. Do not require an unreviewed pipe-to-shell script.

```bash
node --version
npm --version
npx get-pnpm
pnpm --version
docker --version
docker compose version
```

The official installer currently selects the pnpm 12 release line. Select and pin an exact compatible patch before finalizing the repository. If the existing repository uses a working supported pnpm version, retain it unless a migration is justified. [S14]

### 21.2 Scaffolding requirements for the coding agent

Inspect the repository before scaffolding. In an empty repository, create the workspace root and package manifests before dependency installation. Set package names consistently: `@advo/web`, `@advo/portal`, `@advo/api`, `@advo/worker`, `@advo/backend`, `@advo/db`, `@advo/contracts`, `@advo/ui`, `@advo/payments` and `@advo/omada`.

Next.js applications should be generated/configured with TypeScript, App Router, ESLint and Tailwind. NestJS uses Fastify and consistent package/module settings. Do not allow independent scaffolds to create nested Git repositories or conflicting lockfiles.

Representative dependency commands after those packages exist:

```bash
pnpm add -Dw turbo typescript prettier
pnpm --filter @advo/web add @heroui/react @heroui/styles @tanstack/react-query @tanstack/react-table react-hook-form @hookform/resolvers zod lucide-react recharts
pnpm --filter @advo/backend add @nestjs/common @nestjs/core @nestjs/config @nestjs/swagger @nestjs/bullmq bullmq reflect-metadata rxjs argon2
pnpm --filter @advo/api add @nestjs/platform-fastify @fastify/cookie @fastify/helmet
pnpm --filter @advo/db add @prisma/client @prisma/adapter-pg pg dotenv
pnpm --filter @advo/db add -D prisma @types/pg
pnpm --filter @advo/payments add @snippe/sdk
pnpm --filter @advo/omada add tough-cookie
```

These show package placement, not a substitute for peer-dependency checks. The agent must choose one compatible HeroUI major, verify actual installed peer requirements, align Prisma CLI/client/adapter versions and add required workspace dependencies with `workspace:*`. Set ESM/CommonJS and TypeScript build strategy consistently. Configure approved lifecycle scripts for native dependencies rather than disabling all security controls.

### 21.3 Workspace scripts the implementation must create

| Root script | Expected behavior |
|---|---|
| `pnpm dev` | Run web, portal, API and worker after prerequisites |
| `pnpm build` | Generate DB client and build packages/apps in dependency order |
| `pnpm lint` | Check source using the selected ESLint version |
| `pnpm typecheck` | Strict check all workspaces |
| `pnpm test` | Meaningful domain/unit tests |
| `pnpm test:integration` | DB/queue/provider-contract workflows |
| `pnpm test:e2e` | Browser acceptance workflows |
| `pnpm db:generate` | Prisma client generation |
| `pnpm db:migrate:dev` | Developer migrations only |
| `pnpm db:migrate:deploy` | Apply committed production migrations |
| `pnpm db:seed:demo` | Clearly marked fake demo environment |
| `pnpm admin:bootstrap` | Explicit first Admin creation from protected input |
| `pnpm verify:config` | Validate environment and dependency versions |
| `pnpm verify:integrations` | Safe contract/readiness checks; live writes opt-in |

Do not claim these scripts exist until they are implemented and exercised.

### 21.4 Local startup once the repository is implemented

```bash
cp .env.example .env
pnpm install --frozen-lockfile
docker compose -f infra/docker/compose.dev.yml up -d postgres redis
pnpm verify:config
pnpm db:generate
pnpm db:migrate:dev
pnpm db:seed:demo
pnpm dev
```

Use frozen installation after the first committed lockfile. Initial scaffolding must generate that lockfile with a normal installation first.

Expected local services: web on 3000, portal on 3001 and API on 4000. Provide fake-provider fixtures that simulate delayed completion, duplicate webhook, authorization failure and payout timeout without real financial traffic.

### 21.5 Real Snippe development checks

- Obtain appropriate development credentials and signing secret from the authorized merchant account.
- Confirm whether the account actually provides a sandbox; do not invent a sandbox host.
- Expose a development webhook through an HTTPS tunnel if needed, without exposing the database or Controller management console.
- Update the configured webhook URL and verify a correctly signed test delivery.
- Any live collection/payout test must use an explicit controlled opt-in and a documented amount/recipient; do not run one automatically during seed or CI.
- Verify required customer-field behavior and settlement data on the actual account.

### 21.6 Real Omada development checks

- Record Controller type/version and compatible EAP model, hardware revision and firmware.
- Create a scoped Open API app and a dedicated portal operator.
- Fetch the actual online API specification.
- Use a test site/SSID/EAP, trusted Controller TLS and a working local network.
- Validate site identity, redirect context, authorization lifetime, speed and total quota.
- Produce a sanitized evidence report; keep credentials and cookies out of it.
- Use authorized test hardware for adoption/reboot tests; no production-wide exploratory mutations.

## 22. Deployment and operations

Deploy separate containers for web, portal, API and worker. Use PostgreSQL and Redis volumes with tested persistence. Keep the Controller independently managed and reachable through the verified network design; do not bundle an unverified Omada image into the application Compose file.

Suggested initial production topology: application services on one adequately sized host, Controller on its own host/service when possible, with resource monitoring. Choose CPU/RAM from measured workloads; do not promise production performance on a 1 vCPU/2GB host running everything.

Production build requirements:

- Multi-stage builds with a pinned runtime and lockfile.
- Non-root application users and read-only runtime mounts where practical.
- TLS on public origins and trusted TLS for Controller communication.
- Proxy routing that preserves raw webhook bytes and trusted original request metadata.
- One controlled migration task before new application instances become ready.
- Backward-compatible expand/migrate/contract schema changes.
- Authenticated/protected operational dashboards and metrics.
- Graceful shutdown: stop accepting new work, finish/lease running jobs and preserve retry state.
- Independent scaling of API and workers with database/Controller concurrency limits.
- Scheduled backups and a documented, exercised restore procedure.

Provide runbooks for Controller outage, Snippe outage, Redis outage, delayed webhook, unknown payout, paid-but-not-connected, wrong quota enforcement, stuck adoption, missing settlement data and restore from backup.

Alert on activation failure rate, paid Orders without fulfillment, unknown/stale payouts, outbox lag, inbox failures, Controller latency/error codes, mismatched ledgers and expired grants still observed authorized.

Log request/operation/order/provider-reference correlations with masked PII and no passwords, cookies, keys or full authorization tokens. Preserve sanitized vendor business error bodies sufficient for diagnosis; method/status/latency alone are insufficient for troubleshooting Omada behavior.

## 23. Security and correctness requirements

Implement these as concrete application controls and tests, not as an unrelated checklist page in the product:

- Strong session cookies, CSRF/origin controls and backend authorization.
- Contact verification, controlled invite acceptance and Admin MFA.
- Tenant-safe relationships and query scoping.
- Encrypted server-only credentials and controlled key rotation.
- Raw-body webhook verification and durable event deduplication.
- Authoritative amount/currency/reference validation.
- Server-controlled referral attribution and commission policy selection.
- Locked wallet reservations and immutable journals.
- Controller endpoint allowlisting and no arbitrary server-side fetch destinations.
- Escaped portal branding, upload validation and safe logo storage.
- Voucher/code abuse protection without making codes guessable.
- Rate limits for login, invitation, public checkout and voucher redemption.
- Safe report exports, including CSV formula-injection protection.
- Sanitized audit logs and appropriate retention for PII/provider payloads.
- No production fake providers, hard-coded success, shared seeded password or demo wallets.

## 24. Tests and acceptance gates

Use tests that prove business behavior and failures. Avoid tests that simply repeat the implementation structure.

### 24.1 Registration and authorization

- Direct Reseller registration without referral succeeds and creates no commission attribution.
- Valid referral registration attributes once; tampered role/agent/tenant values are ignored/rejected.
- Invitation acceptance binds the original Agent and prevents token reuse.
- Agent cannot access guest phone/session/payment data.
- Reseller A cannot read/write/export/revoke Reseller B resources.
- Jobs and report download endpoints preserve tenant boundaries.
- Password reset revokes affected sessions and recovery tokens cannot be reused.

### 24.2 Payments and event processing

- Initial mobile collection creates one attempt and one persisted request/key.
- Same application request returns the same pending attempt.
- Duplicate concurrent signed events post money and entitlement once.
- Invalid/missing signature, malformed amount, wrong currency or wrong account cannot fulfill.
- Failure event after completion cannot roll back a genuine receipt accidentally.
- Payment completes before create response is saved: inbox/reconciliation resolves it safely.
- Snippe create timeout retains unknown state and does not issue blind fresh attempts.
- Completion after UI timeout recovers fulfillment/refund review.
- Two successful attempts create overpayment handling and one entitlement.
- API crash after DB receipt but before enqueue is recovered by the outbox.
- Redis restart/outage does not lose paid fulfillment.
- Raw body with different whitespace still verifies only for the actual signed bytes.
- Timestamp tolerance tests cover future skew and delayed retry policy.

### 24.3 Omada and access

- Version fixtures prove each serializer's fields/types/units and reject unknown profiles.
- Failed site creation does not duplicate remote sites on retry.
- Controller accepts authorization only after verified payment/voucher.
- Payment remains completed if activation fails.
- Worker retry/reconnect does not restart grant duration.
- Controller accepts but worker crashes before DB confirmation: the original expiry is recovered, not extended.
- Multiple concurrent devices cannot exceed package device limit.
- Counter reset/roaming does not double-count quota.
- Total/daily/monthly quota behavior is enabled only with verified enforcement.
- Revoke/expiry prevents unauthorized reconnection in the actual tested setup.
- Controller timeout produces uncertain state and reconciliation.
- Offline Controller does not cause unlimited soft-fail access.
- Invalid public redirect context cannot authorize an unrelated client or site.

### 24.4 Commission and wallet

- Registration/trial/failed subscription payment generates no payable commission.
- First eligible subscription and renewal use the correct versioned policies.
- Duplicate paid events create one accrual per trigger/source.
- Rate changes do not rewrite old commission.
- Refund before payout reverses the correct liability.
- Refund after payout creates the explicit adjustment/review path.
- Journal debits equal credits and cached wallets reconcile.
- Concurrent withdrawals cannot overspend.
- Unknown payout holds its reserve.
- Payout webhook retries cannot debit twice.
- Partial withdrawals allocate earnings without marking an entire accrual paid or losing its remaining balance.
- Fee changes cannot exceed an approved debit silently.
- Payout failure/reversal reconciles returned funds before releasing/crediting them.

### 24.5 UI and hardware evidence

Playwright should cover all three role journeys, onboarding, package purchase states, voucher redemption, subscription checkout, Agent commission history and withdrawal review. Inspect mobile/desktop screenshots for overflow, readable tables, contrast and truthful status labels.

Real-device acceptance must separately record Controller version, EAP identity/firmware, package, submitted expiry/rates/quota, returned business response, actual observed lifetime, measured throughput and quota/reconnect outcome. Do not replace these observations with mock tests.

Manual payment tests must be limited and deliberate; CI uses simulations/signed fixtures, never real charges or payouts.

## 25. Implementation phases and checkpoints

### Phase 0 — Repository and contracts

Inspect existing code and instructions. Document supported dependency versions, architecture decisions, Omada profile/unknowns and Snippe contracts. Create manifests, workspace boundaries, local infrastructure, validated env templates and CI foundation.

**Gate:** clean install, database/Redis health, TypeScript build and no server-package leakage into browsers.

### Phase 1 — Identity, tenancy and registration

Build authentication, role guards, tenant constraints, self-registration, Agent invitation/acceptance, verification and onboarding shell. Bootstrap Admin safely. Include two Resellers/two Agents in test fixtures.

**Gate:** direct and Agent registration work; cross-tenant and role tests pass.

### Phase 2 — Catalog and local billing model

Implement plans/subscriptions/invoices, sites/mappings, device claims, packages/revisions, Orders, ledger primitives and voucher model. Build core dashboard CRUD from actual API data.

**Gate:** ownership-safe CRUD, immutable order snapshots and balanced ledger tests.

### Phase 3 — Snippe collection and durable fulfillment

Implement SDK adapter, saved requests/keys, raw-body signature checks, inbox/outbox, payment reconciliation and one simulated end-to-end purchase. Then validate the documented account contract with a controlled integration test.

**Gate:** duplicate/timeout/crash tests pass; no real-world success claimed from a fake transport.

### Phase 4 — Omada provisioning and access

Implement version profile, site/SSID/portal capability checks, device workflow, redirect-context validation and grant authorization. Build the guest portal and voucher journey. Run lab expiry/rate/quota checks before enabling compatible package features.

**Gate:** verified paid purchase authorizes a test client; failure is recoverable; rates/expiry have real evidence.

### Phase 5 — Sessions, quota and commission

Implement observed sessions, expiry/revoke reconciliation, supported quotas, attribution eligibility, commission accrual/hold/release and Agent dashboard.

**Gate:** reconnect duration is fixed; device/quota rules work within tested capability; commission triggers once.

### Phase 6 — Withdrawals and Snippe payouts

Implement payout destination verification, fee disclosure, locked reservations, Admin review, payout dispatch/status/reversal and both beneficiary dashboards.

**Gate:** unknown outcomes retain reserves; retries do not pay twice; accounting reconciles.

### Phase 7 — Full UI and operations

Complete marketing, all required screens, localization, reporting, support, notifications, audit and operational visibility. Add screenshot inspection and runbooks.

**Gate:** all role journeys work without fabricated data; failures are understandable.

### Phase 8 — Production readiness and handover

Exercise production build/migrations, configuration guards, backup restore, outage drills and acceptance workflows. Document supported Controller/EAP combinations and remaining dependencies.

**Gate:** reproducible deployment and truthful implementation status with lab-tested hardware claims.

After every phase, update `docs/implementation-status.md` with completed features, commands actually run, verification results, known gaps, migrations, integration fixtures and exact next tasks. Continue through the authorized phases instead of ending after an architecture proposal.

## 26. Focused continuation prompts

Use these when the agent's context becomes too large. They supplement the master specification; they do not override its invariants.

### Prompt A — Foundation and role flows

> Implement Phases 0–1 of the Advo TZ specification in the existing repository. Create the pnpm workspace and app/package boundaries, configure NestJS/Fastify and both Next.js apps, add PostgreSQL/Redis development setup, strict types and validated configuration. Implement backend-owned sessions, Admin/Reseller/Agent authorization, self-registration, Agent invitations, contact verification interfaces and tenant-safe persistence. Build usable login/register/onboarding screens with the Advo TZ colors. Test two-tenant isolation and invitation attribution. Record actual commands and remaining dependencies in the checkpoint file.

### Prompt B — Billing and Snippe

> Implement Phases 2–3 against the existing identity/tenant model. Build versioned platform plans, WiFi package snapshots, Orders, PaymentAttempts, ledger primitives, a durable webhook inbox and transactional outbox. Read Snippe 2026-01-25 and installed SDK types, implement mobile collections/status lookup and raw-body signature verification without exposing keys. Persist compact idempotency keys and request hashes, reconcile unknown requests, handle duplicate/late events and overpayments. Produce a complete simulated customer checkout and subscription renewal; only make live financial tests with explicit controlled opt-in.

### Prompt C — Omada and captive portal

> Implement Phase 4 and the network portion of Phase 5. Inspect the actual Omada Controller type/version and online API docs, separate Open API management from hotspot-operator portal authentication and implement only verified routes. Add Controller/site mappings, provisioning operations, device claims, capabilities, portal context validation, grants and fixed-lifetime reconnects. Treat v6.2.10+ rate/quota fields and older time units through separate tested serializers. Never authorize an advertised capped package without verified enforcement. Build the mobile portal and voucher flow, preserve paid-but-not-activated recovery and document real Controller/EAP lab results separately from mock tests.

### Prompt D — Agent earnings and withdrawals

> Implement commission and payout flows using the existing ledger. Agent attribution alone earns nothing; qualify verified Reseller subscription receipts through effective-dated fixed/percentage policies. Snapshot the eligible base and enforce accrual uniqueness. Add hold/release/reversal behavior, both beneficiary wallets, destination verification, fee disclosure, locked reserves and Admin approval. Integrate Snippe payout dispatch/status with stable keys and uncertain-outcome reconciliation. Test overspend races, fee changes, duplicate payout events, failed/reversed payouts and already-paid commission reversals.

### Prompt E — Finish the product and deployment

> Complete remaining Admin, Reseller, Agent, marketing and support screens using real endpoints and the Advo TZ design tokens. Add English/Swahili strings, stateful tables, truthful metrics, notifications and operational dashboards. Run Playwright journeys and visually inspect mobile/desktop results. Finish Docker deployment, controlled migrations, production configuration guards, monitoring and exercised backup restore. Report supported hardware/features only where lab evidence exists. Keep implementation-status current and produce a concise handover with commands, tests and remaining external dependencies.

## 27. Definition of done

The system is complete only when:

- All three business roles have working scoped dashboards.
- Resellers can register directly or accept an Agent invitation.
- Plan/subscription and WiFi-package concepts remain separate.
- Snippe collections, verified event processing and reconciliation are implemented.
- Paid or voucher entitlements survive retries and reconnects without duplicate value.
- Omada integration uses the actual Controller's supported contracts and tracked operations.
- Supported EAP authorization, expiry and advertised limits have lab evidence.
- Agent commissions derive from configured eligible receipts and immutable policy snapshots.
- Wallets and withdrawals are backed by balanced journals and safe reservations.
- Payout uncertainty, failure and reversal are recoverable without duplicate transfers.
- Website/dashboard/portal use the specified brand and work on mobile/desktop.
- Production credentials and startup guards are documented; fake success cannot enter production.
- Repository setup, migrations, test commands, deployment and recovery are reproducible.
- The final report explicitly separates implemented, simulated, lab-verified and externally blocked behavior.

## 28. Required repository documentation

Create or update:

| Document | Contents |
|---|---|
| `README.md` | Product, stack, setup, commands and local journeys |
| `docs/architecture.md` | Service/module diagram and boundaries |
| `docs/database.md` | Schema, tenant constraints and money/time units |
| `docs/permissions.md` | Role/action matrix and override rules |
| `docs/business-rules.md` | Subscription, attribution, commission and fee policy |
| `docs/integrations/snippe.md` | Actual SDK/endpoints, signatures, idempotency and reconciliation |
| `docs/integrations/omada-contracts.md` | Version-qualified endpoints and hardware evidence |
| `docs/integrations/capabilities.md` | Supported/unsupported feature matrix |
| `docs/frontend.md` | Routing, UI tokens, localization and captive-browser constraints |
| `docs/dependency-versions.md` | Exact versions and compatibility decisions |
| `docs/deployment.md` | Docker/proxy/secrets/migrations and scaling |
| `docs/runbooks.md` | Outages, payment/access failures, payout recovery and restore |
| `docs/acceptance-results.md` | Tests actually run and lab results |
| `docs/implementation-status.md` | Current checkpoint and unfinished tasks |

## 29. Official references and evidence boundaries

Reviewed for this specification on 30 September 2026. These sources establish vendor/framework contracts, not the commercial commission rates or performance of a deployed system. Most architecture, data model, business defaults and acceptance criteria above are design recommendations for Advo TZ.

| ID | Official source | Used for |
|---|---|---|
| S1 | [Snippe authentication](https://docs.snippe.sh/docs/2026-01-25/authentication) | API host, Bearer key and scope boundary |
| S2 | [Snippe mobile money](https://docs.snippe.sh/docs/2026-01-25/payments/mobile-money) | Collection request requirements |
| S3 | [Snippe payments](https://docs.snippe.sh/docs/2026-01-25/payments) | Status lookup, currency/minimum, idempotency and expiry |
| S4 | [Snippe webhooks](https://docs.snippe.sh/docs/2026-01-25/webhooks) | Event envelope, signatures and delivery behavior |
| S5 | [Snippe JavaScript/TypeScript SDK](https://docs.snippe.sh/docs/2026-01-25/sdks/javascript) | Official package, raw-body verification and SDK methods |
| S6 | [Snippe mobile disbursements](https://docs.snippe.sh/docs/2026-01-25/disbursements/mobile-money) | Mobile payout fields and lookup |
| S7 | [Omada site creation through Open API](https://support.omadanetworks.com/us/document/109315/?app=aginet) | App creation, access privileges and authentication |
| S8 | [Omada external portal v6.2.10+](https://support.omadanetworks.com/nordic/document/132060/) | Current portal fields and version changes |
| S9 | [Omada earlier external portal guide](https://support.omadanetworks.com/hk/document/13080/?app=kasa) | Legacy fields/time-unit contrast |
| S10 | [Node.js releases](https://nodejs.org/en/about/previous-releases) | Supported LTS runtime selection |
| S11 | [Next.js App Router](https://nextjs.org/docs/app) | Frontend framework |
| S12 | [HeroUI framework setup](https://heroui.com/en/docs/react/getting-started/frameworks) | Next.js integration and major-version consistency |
| S13 | [Prisma PostgreSQL quickstart](https://www.prisma.io/docs/v7/prisma-orm/quickstart/postgresql) | Database setup and adapter/client alignment |
| S14 | [pnpm installation](https://pnpm.io/installation/) | Package-manager/runtime compatibility |
| S15 | [NestJS raw body](https://docs.nestjs.com/faq/raw-body) | Exact-byte webhook verification with Fastify |
| S16 | [Snippe disbursements](https://docs.snippe.sh/docs/2026-01-25/disbursements) | Payout state and fee lookup |
| S17 | [NestJS queues](https://docs.nestjs.com/application/queues) | BullMQ/Redis worker integration |
| S18 | [Tailwind with Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs) | Styling setup |
| S19 | [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview) | Dashboard server-state management |

### Final instruction to the coding agent

Build the system through the implementation phases, not just its appearance. Preserve financial and tenant invariants, verify external contracts, keep recovery paths working and report evidence honestly. A polished dashboard, a completed payment and a Controller response are different outcomes; implement and verify the relationship between them.
