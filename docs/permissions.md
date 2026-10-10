# Permissions

Roles are `ADMIN`, `RESELLER` and `AGENT`. Guests have no account: they use the portal with a short-lived portal context (from the EAP redirect), an order token, or a recovery token.

Enforcement happens in `SessionAuthGuard` + `RolesGuard` on each controller (`@Roles(...)`), and in the services, which take `resellerId` and `agentId` from the session only. A record belonging to another tenant returns **404**, not 403, so its existence is not revealed.

## Route groups

| Prefix | Who | Notes |
|---|---|---|
| `/api/v1/auth/*` | Public / any session | Register, login, logout, verify email, forgot and reset password, `me`, invitation preview and accept |
| `/api/v1/auth/mfa/setup`, `/auth/mfa/enable` | Admin | TOTP enrolment |
| `/api/v1/admin/*` | Admin **with MFA passed** | Returns `403 MFA_REQUIRED` until the session has passed TOTP (`ADMIN_MFA_REQUIRED=true`) |
| `/api/v1/reseller/*` | Reseller (the owner user) | Scoped to the session's Reseller. `POST /reseller/media/logo` takes a raw `image/*` body, not JSON (see [Media](#media)) |
| `/api/v1/agent/*`, `POST /agent/invitations` | Agent | Scoped to the session's Agent |
| `/api/v1/portal/*` | Guests | Token-based; rate limited by IP, phone and MAC |
| `GET /api/v1/media/:id` | Public | Uploaded portal images, by unguessable uuid. Immutable, cached for a year (see [Media](#media)) |
| `/api/v1/webhooks/snippe` | Snippe | HMAC signature on the raw body; exempt from CSRF |
| `/api/v1/dev/simulate/*` | Development only | 403 unless the payment provider is fake and `NODE_ENV` is not production |
| `/api/v1/health/*` | Public | `live`, `ready` |
| `/api/v1/internal/metrics` | Bearer `METRICS_TOKEN` | 404 when unset. The proxy returns 404 for `/api/v1/internal/*` |

## Capability matrix

| Operation | Admin | Reseller | Agent |
|---|---|---|---|
| Create Agents; suspend or close Agents and Resellers | Yes (reason required) | No | No |
| Register a Reseller | No direct creation | Self sign-up | Sends invitations; accepting one binds attribution |
| Correct a Reseller's Agent attribution | Yes (reason required, effective-dated) | No | No |
| Platform plans and prices, sale fee, withdrawal fee | Yes (versioned; settings need a reason) | Read plans | No |
| Commission policies; reverse an accrual | Yes (reason required for reversal) | No | No |
| Controllers: create, edit, inspect, record capability evidence | Yes | No | No |
| Sites, device claims | Review claims (reason required) | Own sites and claims | No |
| Packages, vouchers | No Admin screen yet | Own | No |
| Guest phones, grants, sessions | Orders and payments only; no grant screen yet | Own; revoke needs a reason | No |
| Payments and webhooks | All; reconcile; settle the fee (reason required) | Own orders | No |
| Wallet and withdrawals | Approve or reject all (reason required) | Own | Own commission wallet |
| Agent commission | All | Not visible | Own |
| Ledger trial balance, audit log, outbox, sweepers | Yes | No | No |
| Support tickets | All; reply; change state | Own | Own |

Agent attribution never gives an Agent access to the Reseller's devices, customers, passwords or wallet. An Agent sees only the business name, status and subscription state of the Resellers it referred, plus its own leads and commission.

## Audited actions

Every row below writes an `AuditEvent` with actor, target, tenant, optional reason and metadata:

`admin.bootstrapped`, `agent.created`, `agent.<status>`, `reseller.<status>`, `reseller.registered`, `invitation.accepted`, `attribution.corrected`, `auth.login`, `auth.mfa_enabled`, `plan.versioned`, `plan.archived`, `setting.updated` (before and after values), `commission_policy.created`, `commission.reversed`, `controller.created`, `controller.updated`, `controller.capability_recorded`, `site.created`, `device_claim.submitted`, `device_claim.approved`, `device_claim.rejected`, `package.created`, `package.revised`, `package.archived`, `voucher_group.created`, `voucher_group.exported`, `voucher_group.unused_deleted`, `voucher_group.archived`, `grant.revoked`, `grant.device_retry`, `payment.settled`, `webhook.conflicting_duplicate`, `subscription.trial_started`, `subscription.activated`, `payout_destination.created`, `withdrawal.requested`, `withdrawal.approved`, `withdrawal.rejected`, `withdrawal.completed`, `withdrawal.failed`, `withdrawal.reversed`, `support.state_changed`, `media.logo_uploaded` (original and stored byte counts).

## Media

Uploaded portal images live in `MediaAsset` (the bytes in Postgres, not on disk) so every API replica serves the identical asset.

- `POST /api/v1/reseller/media/logo` — the body **is** the image: send the raw file with its own `Content-Type` (`image/png`, `image/jpeg`, …), not multipart or base64. `main.ts` registers buffer parsers for `image/*` with a 6 MB limit, separate from the 1 MB JSON cap. Gated on `features.branding.logo_upload`; a locked plan gets `403 FEATURE_LOCKED_BY_PLAN`.
- Optimisation happens once, at upload: resize to a 512 px box, strip metadata, encode lossless and quality-90 WebP, and store whichever is smaller. The response reports `originalBytes`, `byteSize` and `savedPercent` from the real result, so a saving is never invented.
- `GET /api/v1/media/:id` serves the stored bytes to anyone holding the id. The id is a uuid and a replacement logo is a new row, so the URL is treated as immutable: `Cache-Control: public, max-age=31536000, immutable`, plus an `ETag` derived from the sha256 of the stored bytes.
- Retention is bounded per reseller, so re-uploading a logo repeatedly cannot grow the table without limit. The newest upload is always kept.

## Portal preferences

`PATCH /api/v1/reseller/sites/:id/portal-preferences` carries only the plan-governed appearance choices; identity fields are edited through the site endpoint. Absent keys are left alone, and **`""` is the explicit "clear this" sentinel** — the designer sends every appearance field it owns on every save, so an emptied input arrives as `""` rather than as a missing key.

- `branding.background_color`, `branding.logo_url` and `branding.background_url` accept `""` to revert to the template's own colour and assets. A whitespace-only value counts as cleared. Any other value must still be a `#rrggbb` colour or a full URL.
- Clearing is always allowed, even when the plan no longer includes the capability: a reseller who uploaded a logo on a higher plan must be able to remove it after a downgrade. *Setting* a locked value is still `403 FEATURE_LOCKED_BY_PLAN`, and the rejection is whole — a partly-allowed patch writes nothing.
- Colours are additionally checked for contrast, since the portal puts text on them: `primary_color` and `accent_color` against white button text, `background_color` against the portal's own ink.

## Rate limits

Fixed windows. Counters are stored in Redis (shared by all API replicas), with a per-process memory fallback when Redis fails. Exceeding a limit returns 429.

| Bucket | Key | Limit |
|---|---|---|
| `register-ip` | IP | 10 / hour |
| `login-ip` / `login-email` | IP / email | 30 / 15 min, 10 / 15 min |
| `verify-ip` | IP | 30 / 15 min |
| `forgot-ip` / `forgot-email` | IP / email | 10 / 15 min, 3 / 15 min |
| `reset-ip` | IP | 10 / 15 min |
| `mfa-enable` | user | 10 / 15 min |
| `agent-invite` | Agent user | 30 / hour |
| `invite-preview` / `invite-accept` | IP | 30 / 15 min, 10 / 15 min |
| `sub-checkout` | Reseller | 10 / 10 min |
| `voucher-generate` | Reseller | 20 / hour |
| `payout-dest` / `payout-dest-verify` | user | 5 / hour, 10 / 15 min |
| `withdraw` | user | 10 / hour |
| `portal-context` | IP | 60 / min |
| `portal-order-ip` / `portal-order-phone` | IP / phone | 20 / 10 min, 5 / 10 min |
| `portal-retry` | order | 5 / 10 min |
| `voucher-redeem-ip` / `voucher-redeem-mac` | IP / client MAC | 10 / 10 min each |
| `grant-join` | IP | 20 / 10 min |
| `media-logo` | Reseller | 20 / hour |

**Not implemented:** account lockout after repeated failed logins (only the rate limits above), and idle session expiry.
