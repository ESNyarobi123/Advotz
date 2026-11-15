# Google sign-in

"Continue with Google" uses the OAuth 2.0 **authorization-code** flow. The
browser goes to Google, Google redirects back with a one-time `code`, and the
API exchanges it server-side. The client secret never reaches the browser and no
token is exposed to client script.

## What to paste into the Google console

Create the credential at
[console.cloud.google.com → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
with **Application type: Web application**.

### Authorized JavaScript origins

Used by Google to know which pages may start the flow.

```
https://advowifi.com
http://localhost:3010
```

`http://localhost:3010` is the web dev server (`WEB_PORT` in `.env`); Google
accepts plain HTTP on `localhost` only. Add `https://www.advowifi.com` too if
that host is ever served.

### Authorized redirect URIs

The API's callback. **This must match `GOOGLE_OAUTH_REDIRECT_URL` exactly** —
one character out and Google answers `redirect_uri_mismatch`.

```
https://advowifi.com/api/v1/auth/google/callback
http://localhost:4000/api/v1/auth/google/callback
```

Production deliberately uses the **web** origin (`advowifi.com`), not
`api.advowifi.com`: Caddy proxies `/api/*` on the web host to the API, so the
session cookie is first-party for the dashboard exactly like a password login.
`http://localhost:4000` is the API dev port.

### OAuth consent screen

- User type: **External** (unless the business runs on Google Workspace).
- Scopes: `openid`, `email`, `profile`. These are non-sensitive and need no
  Google verification review.
- While the app is in **Testing**, only test users you add can sign in. Publish
  the app ("In production") before real customers use it.
- It can take 5 minutes to a few hours for console changes to apply.

#### Branding / app domain fields

These are the exact values to paste into **Google Auth Platform → Branding**:

| Field | Value |
| --- | --- |
| App name | `Advo WiFi` |
| User support email | `support@advotz.com` |
| App logo | `https://advowifi.com/brand/google-oauth-logo-120.png` (120×120 PNG, ~10 KB) |
| Application home page | `https://advowifi.com` |
| Application privacy policy link | `https://advowifi.com/privacy` |
| Application terms of service link | `https://advowifi.com/terms` |
| Authorized domains | `advowifi.com` |
| Developer contact email | `support@advotz.com` |

The logo source is committed at `apps/web/public/brand/google-oauth-logo-120.png`
(and a 512×512 `advo-logo-square-512.png` beside it). Regenerate either with
Pillow from `advo-mark.png` if the brand mark changes; Google wants a square
image, at least 120×120, under 1 MB, in JPG, PNG or BMP.

`/privacy` and `/terms` are server-rendered pages in the marketing group, so
Google's reviewer reaches them without signing in.

## Environment variables

| Variable | Example | Notes |
| --- | --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` | `1234-abc.apps.googleusercontent.com` | Public value. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | `GOCSPX-…` | Server only. Never in `NEXT_PUBLIC_*`. |
| `GOOGLE_OAUTH_REDIRECT_URL` | `https://advowifi.com/api/v1/auth/google/callback` | Must equal the console URI. |

Both id and secret are needed for the button to work. With either missing,
`GET /api/v1/auth/google/status` returns `enabled: false` and the button explains
itself instead of sending anyone to a broken Google page.

## What happens on a click

1. `GET /api/v1/auth/google/start?intent=login|register&next=/path`
   signs `{ next, intent }` into the OAuth `state` and redirects to Google with
   `prompt=select_account` (the person always sees the account chooser).
2. `GET /api/v1/auth/google/callback?code&state`
   checks the signature, exchanges the code, and reads the profile from
   `openidconnect.googleapis.com/v1/userinfo` — the email is used only because
   Google just served it, and `email_verified` must be `true`.
3. **Existing account** → a session cookie is set (same cookie a password login
   sets) and the browser lands on the role dashboard or the safe `next` path.
4. **New account** → a signed 30-minute ticket redirects to
   `/register/google?ticket=…&email=…&name=…`, which asks for the account type,
   phone number and (for a reseller) the business name, then
   `POST /api/v1/auth/google/complete` creates the user, the reseller/agent row,
   and the session in one transaction.

## Rules worth knowing

- **Admins cannot use Google.** Admin accounts require the password plus a TOTP
  code; an OAuth redirect is not a place to weaken that.
- A Google user has no password. The stored hash is of a random throwaway
  secret, so the account can only be entered through Google until the person
  sets a password with "Forgot password".
- The email is taken from the signed ticket, never from the `POST` body, so a
  request cannot claim a mailbox Google did not prove.
- `next` is accepted only as a same-site path; `//host`, absolute URLs and
  backslash variants are dropped.
