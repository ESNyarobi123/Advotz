# Omada contracts

**Status:** the live adapter (`packages/omada/src/live.adapter.ts`) is implemented, but **no call has been made to a real Omada Controller**. No lab hardware was available. Every end-to-end run used `FakeOmadaAdapter`. Nothing below is lab-verified.

Omada exposes two unrelated APIs, and Advo keeps them separate.

## 1. Management Open API (sites, devices, clients)

The exact routes of the Omada Open API differ between Controller versions and deployments, and they are published only in each Controller's own "Online API Document". **Advo does not hard-code them.** An operator transcribes the routes they have checked into a JSON **contract**, validated by `openApiContractSchema` in `packages/omada/src/openapi-client.ts`:

```json
{
  "controllerVersion": "5.15.x (from the Controller's About page)",
  "documentSource": "Online API Document, fetched from https://<controller>/… on <date>",
  "token": {
    "method": "POST",
    "path": "<token path from the document>",
    "query": { "grant_type": "client_credentials" },
    "bodyTemplate": { "omadacId": "{{omadacId}}", "client_id": "{{clientId}}", "client_secret": "{{clientSecret}}" },
    "accessTokenPath": "result.accessToken",
    "expiresInPath": "result.expiresIn"
  },
  "operations": {
    "createSite": { "method": "POST", "path": "<path from the document>", "bodyTemplate": { "name": "{{name}}" }, "resultPath": "result.siteId", "verified": false },
    "adoptDevice": { "method": "POST", "path": "<path from the document>", "bodyTemplate": { "deviceMac": "{{deviceMac}}", "username": "{{deviceUsername}}", "password": "{{devicePassword}}" }, "verified": false }
  }
}
```

The values above are **placeholders showing the shape**, not real Omada routes.

- **Auth:** OAuth client credentials (`clientId`, `clientSecret` from the Controller's Open API page). The access token is sent as `Authorization: AccessToken=<token>`, which is Omada's format, not `Bearer`. Tokens are cached until 60 s before they expire.
- **Placeholders:** `{omadacId}`, `{siteId}`, `{clientMac}`, `{deviceMac}` in paths, and `{{field}}` in body templates. For `adoptDevice`, `{{deviceUsername}}` and `{{devicePassword}}` are the device's own login that the Reseller captured on the claim; they are empty strings when none was given, so a template that omits them is unaffected.
- **Supported operations:** an operation missing from the contract is **unsupported**, and calling it raises `UnsupportedCapabilityError`. An operation present with `"verified": false` is supported but not verified, which is enough outside production but not in production (see [capabilities](capabilities.md)). Set `verified: true` and `evidence` only after it has been run on lab hardware.
- **Where the contract lives:** in the Controller's encrypted credentials (Admin → Controllers). `OMADA_OPENAPI_CONTRACT_PATH` is a fallback for Controllers without one, and it is also what `pnpm verify:integrations` validates.
- **Operation names the adapter calls:** `controllerInfo`, `createSite`, `listSites`, `getSite`, `listDevices`, `adoptDevice`, `listClients`, `provisionSsid`, `configureExternalPortal`, `getClientAuthorization`, `disconnectClient`, `revokeAuthorization`, `blockClient`, `unblockClient`. `readUsage` and `rebootDevice` affect only the capability report: `readUsage()` always raises unsupported, and there is no reboot method.

## 2. External portal: Hotspot Operator API (guest authorization)

Used to authorize a guest's MAC after payment. The paths are documented by TP-Link for external portal servers:

| Step | Request |
|---|---|
| Operator login | `POST /{omadacId}/api/v2/hotspot/login` with body `{ name, password }`. The response sets a session cookie and returns `result.token` |
| Authorize client | `POST /{omadacId}/api/v2/hotspot/extPortal/auth` with header `Csrf-Token: <token>`, the session cookie, and the client, AP or gateway, SSID and radio from the portal context, plus time and limits |

The operator session stays on the server and is never forwarded to browsers. On HTTP 401, 403 or 302 it is refreshed under a lock, so concurrent workers do not log each other out.

### Version profiles

The field formats changed between Controller versions. The serializer is chosen from the Controller's configured `version`, and **an unknown version is refused** rather than guessed:

| Profile | Versions | `time` unit | Rate and quota fields | Source |
|---|---|---|---|---|
| `v6.2.10+` | 6.2.10 and later | milliseconds | yes | Omada document 132060 |
| `v5.0.15-v6.2.0` | 5.0.15 – 6.2.0 | microseconds | no | Omada FAQ 3231 family |

Older than 5.0.15: refused.

**Time semantics** (`portalTimeSemantics` on the Controller: `absolute_epoch` or `duration`) must be set by an Admin after checking on the lab Controller whether `time` means "authorized until this epoch" or "authorized for this long". **There is no default.** The live adapter will not authorize anyone until it is set.

## Transport

- HTTPS, 10 s timeout per request, and an optional private CA via `OMADA_CA_CERT_PATH`. Production requires an `https://` Controller URL.
- Timeouts and network errors are **unknown outcomes**: the grant device stays pending and is reconciled with the same candidate expiry. A definite rejection fails the device.

## Inspection

`POST /admin/controllers/:id/inspect` is read-only. It uses the contract's `controllerInfo` operation when present. Otherwise it only checks TLS reachability, and in that case it reports the **configured** version, not a detected one. Results feed `advo_controller_reachable` and `advo_controller_last_inspected_age_seconds`.

## Environment

At runtime, Controllers are **database rows** managed by an Admin, each with its own encrypted credentials. Of the `OMADA_*` variables in `.env.example`, only `OMADA_CA_CERT_PATH` and `OMADA_OPENAPI_CONTRACT_PATH` (the fallback contract) are read by the API and worker. `OMADA_MODE` is echoed in `/health/ready`. The rest (`OMADA_BASE_URL`, `OMADA_CONTROLLER_ID`, `OMADA_CLIENT_ID`, …) are used only by `pnpm verify:integrations` for a read-only check.

## Before going live

1. Record the Controller type (software, hardware or cloud), version and `omadacId`.
2. Download the Online API Document from that Controller and write the contract, with `verified: false` everywhere.
3. Run each operation against a lab site, then set `verified: true` with evidence (date, Controller version, request and response summary).
4. Confirm the time semantics and the version profile with a real `extPortal/auth`. Measure the actual session length and throughput, and record them as capability evidence.
