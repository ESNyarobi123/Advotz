# Captive portal API (RFC 8908) and the connected page

## The problem this solves

A guest pays in the captive portal, reads "You are connected", and the page
vanishes. On a phone that is not a bug in the portal: the operating system owns
that window.

Legacy captive portals are shown in a restricted WebView (`CaptivePortalLogin`
on Android, the Captive Network Assistant on iOS). That window is destroyed the
moment the OS decides the network is no longer captive — which is exactly what
paying causes, because Advo then authorizes the device. Navigating the page
somewhere else makes it worse; that is why the portal no longer does it.

The only standards-based fix is to have the OS open the portal in the guest's
**real browser** and keep it there.

## What Android supports

Android 12+ with the `CaptivePortalLogin` Mainline module of **January 2026 or
newer** (Google Play system update) supports the Captive Portal API and a
browser **Custom Tab** instead of the system WebView. A Custom Tab is an
ordinary browser tab: it survives authorization, app switches and the mobile
money app. The portal opts in by adding one key to the RFC 8908 response:

```json
{
  "captive": true,
  "user-portal-url": "https://wifi.example.com/login",
  "venue-info-url": "https://wifi.example.com/connected",
  "x-android-use-custom-tabs": 361335020
}
```

`361335020` is the minimum Mainline module version that implements the flow.
Devices older than that (and iPhones) keep the WebView behaviour. There is
nothing a web page can do to prevent an OS from closing its own captive window.

References:

- <https://source.android.com/docs/core/connect/android-custom-tabs-captive-portal>
- <https://developer.android.com/about/versions/11/features/captive-portal>
- <https://www.rfc-editor.org/rfc/rfc8908> (Captive Portal API)
- <https://www.rfc-editor.org/rfc/rfc8910> (DHCP option 114)

## Requirements

All of these are needed; missing any one drops the phone back to the legacy
window.

1. **DHCP option 114** (RFC 8910) advertises the API URL on the guest VLAN.
2. The API URL is **HTTPS with a publicly valid certificate**. A self-signed or
   wrong-name certificate makes Android and iOS abandon the portal entirely.
3. The API answers `GET` with `Content-Type: application/captive+json`,
   `Cache-Control: no-store`, and a JSON body as above.
4. The **portal host is reachable before the guest pays** (walled garden), or
   the API can never be read.

## What Advo serves

Two endpoints answer RFC 8908. Both are public and neither returns a session
token.

| URL | Purpose |
|---|---|
| `https://<portal-host>/api/captive/<slug>` | Portal origin, same certificate and host as the login page. Preferred: the walled garden only needs one hostname. |
| `https://<api-host>/api/v1/portal/captive/<slug>` | Backend endpoint, for a gateway that already allows the API host. |

Both accept:

- `?mac=<client mac>` — preferred. RouterOS can substitute `$(mac)`; other
  gateways can pass the MAC from their client table.
- `?ip=<client local ip>` — used when the MAC is unavailable. The backend maps
  it to the most recent portal context from that address.

The answer is computed from the device's live grant:

- **Not online yet** (`PENDING_ACTIVATION`, failed, expired, or no grant):
  `captive: true` and `user-portal-url` points at the package page.
- **Online** (`AUTHORIZED` device on an unexpired `ACTIVE` grant):
  `captive: false`, `venue-info-url` points at the connected page, and
  `seconds-remaining` carries the time left.

`venue-info-url` is the `/<slug>/status` page. Android surfaces it in the Wi-Fi
settings after login ("Open portal page"), and the Custom Tab stays on it after
authorization.

## Router configuration

### MikroTik RouterOS (hotspot)

RouterOS advertises option 114 automatically, but **only** when the hotspot
profile has a DNS name, `login-by=https`, and a valid certificate:

```rsc
/ip hotspot profile set [find] \
    dns-name=wifi.example.com \
    login-by=https,http-chap \
    ssl-certificate=wifi.example.com
```

The API file is `hotspot/api.json` on the router (Files menu). Replace it with
[`infra/mikrotik/api.json.example`](../../infra/mikrotik/api.json.example), substituting
`<PORTAL_HOST>` and `<SLUG>`. Keep the RouterOS variables — they are expanded
per client. After editing, re-run "Reset HTML" only if the file was missing
before RouterOS 7.3; editing the file in place is enough on current releases.

Clients must use the router as DNS (`allow-remote-requests=yes`), otherwise they
cannot resolve `wifi.example.com` before they are authorized.

> **Which layout applies here:** Advo authorizes guests through the Omada
> Hotspot Operator API. A RouterOS hotspot that terminates login itself is not
> wired to that path, so in this repository the working layout is the
> DHCP-only one below. The `api.json` template is for a RouterOS hotspot whose
> login page is Advo's external portal (or for reference); it does not by itself
> make RouterOS hotspot login call Advo.

### MikroTik as DHCP server only (Omada EAPs, no RouterOS hotspot)

This is the layout the backend already targets: TP-Link Omada authorizes the
guest, while a MikroTik router hands out addresses on the guest VLAN. There is
no `api.json` in play — point DHCP option 114 straight at Advo:

```rsc
/ip dhcp-server option add name=advo-captive code=114 \
    value="'https://wifi.example.com/api/captive/<slug>'"
/ip dhcp-server option-set add name=advo-captive options=advo-captive
/ip dhcp-server set [find] dhcp-option-set=advo-captive
```

The portal host must be allowed in the walled garden so the pre-payment API
query succeeds.

### Omada / other gateways

Set the DHCP server's option 114 to the portal URL:

```
114 = https://wifi.example.com/api/captive/<slug>
```

If the gateway has no custom DHCP option field, it cannot take part in this flow
and phones will keep using the legacy window. Advo does not change that.

## Walled garden

Before payment the guest may reach the portal host and its API only. Allow:

- `https://<portal-host>/<slug>` and everything under it
- `https://<portal-host>/api/captive/`
- the payment provider's domains, as today

## What changed in the portal

- `PaymentStatus` and `StatusPage` no longer run `window.location.assign(...)`
  when the device becomes `ACTIVE`. That navigation was what removed the
  connected page on devices whose tab survives.
- The "Browse internet" link opens the destination in a **new** tab, so the
  connected page (and its Explore menus and adverts) stays open behind it.
- The connected page is still recovered from `localStorage['advo:last-order:<slug>']`.
  When the portal runs in a Custom Tab that storage belongs to the guest's real
  browser, so the page survives even after the tab is closed and reopened.

### `/<slug>/preview` — the shareable connected page

Because the pre-payment window belongs to the OS, adverts should not depend on
it. The portal now has a public screen that needs no order and no token:

```
https://<portal-host>/<slug>/preview
```

It renders the real `ConnectedStage` — package card, remaining-time bar, Explore
menus, promotion tile — drawn from the location's own businesses, jobs and
adverts, with a "this is a preview" note at the top. It is safe to print as a QR
code, send on WhatsApp, or link from a poster.

It is deliberately **not** `/<slug>/status`: a status page belongs to a guest
with an order, and showing a made-up session there would mislead someone whose
token was simply lost. The reseller's designer Copy/Open buttons for its
"Connected" screen point at `/<slug>/preview` for the same reason.

## Limits

- **Android 12+ with the January 2026 Mainline module** is the only configuration
  that guarantees the browser tab survives. Older Android keeps the WebView and
  the OS will still close it when the device goes online.
- **iOS** has no Custom Tabs equivalent. The connected page remains reachable
  from Wi-Fi settings via `venue-info-url`, but the Captive Network Assistant
  can still close on its own.
- The `CONNECT_HOLD_MS` hold still applies: a guest who never taps "Connect" is
  authorized after 90 seconds so they are not left paid-but-offline. On a
  Custom Tab that is harmless; on the legacy window it is when the page closes.

### When the window still closes, the adverts are not lost

The paid-for advert surfaces never depended on that window; they are on screens
the phone reaches again:

| Surface | Where it survives |
|---|---|
| Banner (`ads.banner`) | The package page `/<slug>`, which the OS reopens the next time the network is captive |
| Explore feed (`ads.explore`) | `/<slug>/preview`, the connected page, and any link or QR the reseller shares |
| Promotion requests | `/<slug>/preview` and the connected page |
| Post-payment receipt | The order page `/<slug>/payment/<token>`, which reopens from `localStorage` or the SMS link |

That is the honest answer to "the window closed": no web page can keep an
operating system's captive window alive, so the content has to live somewhere a
normal browser can open.

## Testing

```sh
# Before paying: captive true, user-portal-url present
curl -s -H 'Accept: application/captive+json' \
  'https://wifi.example.com/api/captive/<slug>?mac=AA:BB:CC:DD:EE:FF'

# After the device is AUTHORIZED: captive false, seconds-remaining present
curl -s -H 'Accept: application/captive+json' \
  'https://wifi.example.com/api/captive/<slug>?mac=AA:BB:CC:DD:EE:FF'
```

On a phone, the check that matters is the browser chrome: if the portal opens
with the normal address bar and tab strip, the Custom Tabs flow is active. If it
opens in a minimal window with only "Done"/"Connect", the router or the device
did not negotiate it and the page will still close.

Two more checks, both from a normal browser:

```
https://<portal-host>/<slug>/preview     # the connected page, no order needed
https://<portal-host>/api/captive/<slug> # the RFC 8908 answer itself
```
