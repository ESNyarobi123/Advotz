# Controller capabilities

Every Controller adapter reports 20 capabilities (`packages/omada/src/capabilities.ts`). Each one has a `supported` flag, a `verified` flag and a reason. A package feature may be sold, and a grant pushed, only when the enforcing capability passes `canEnforce`:

- **Production:** `supported && verified`. Verified means an Admin recorded lab evidence for that Controller (Admin → Controllers → capability evidence, audited as `controller.capability_recorded`).
- **Development and tests:** `supported` is enough, and simulated results are clearly labelled.

Which capability gates what:

| Package or grant feature | Capability |
|---|---|
| Any sale or voucher activation | `authorizeClient` |
| Download or upload speed set | `perClientRateLimit` |
| `TOTAL` data quota | `totalTrafficQuota` |
| `DAILY` / `MONTHLY` quota | `dailyMonthlyQuotaWindows` |

## Current values

No capability is **verified** for any Controller yet, because no lab evidence exists. So in production today, no package can be sold until a live Controller has `authorizeClient` verified. Time-based unlimited packages need only that capability.

| Capability | Fake adapter (dev) | Live adapter (before lab evidence) |
|---|---|---|
| `createSite` | simulated | supported if in the Open API contract |
| `readSite` | simulated | contract (`getSite`) |
| `listDevices` | simulated | contract |
| `adoptDevice` | **unsupported** | contract |
| `readDeviceHealth` | simulated | contract (`listDevices`) |
| `provisionSsid` | **unsupported** | contract |
| `configureExternalPortal` | **unsupported** | contract |
| `authorizeClient` | simulated | supported, unverified, when operator credentials, a known version profile and time semantics are set |
| `getClientAuthorization` | simulated | contract |
| `disconnectClient` | simulated | contract |
| `revokeAuthorization` | simulated | contract |
| `blockClient` / `unblockClient` | simulated | contract |
| `perClientRateLimit` | simulated | supported, unverified, when the portal client is available (fields exist only in v6.2.10+; throughput must be measured) |
| `totalTrafficQuota` | **unsupported** | supported, unverified, when the portal client is available (v6.2.10+; enforcement must be measured) |
| `readUsage` | **unsupported** | contract, but the adapter method always raises unsupported |
| `dailyMonthlyQuotaWindows` | **unsupported** | **unsupported** (no verified reset mechanism) |
| `afterLimitReduceSpeed` | **unsupported** | **unsupported** |
| `afterLimitRedirect` | **unsupported** | **unsupported** |
| `reboot` | **unsupported** | contract (`rebootDevice`), but the adapter has no reboot method |

"Simulated" means `supported: true, verified: false`, with the reason "Development simulator — not lab evidence".
"Contract" means supported only if the Controller's Open API contract declares the operation. It is verified only if that contract entry says `verified: true`.

Evidence recorded by an Admin overrides the static view above for that Controller.

## Consequences in the product

- Creating a quota package (`TOTAL`, `DAILY` or `MONTHLY`) is refused with a 422 that lists the missing capabilities. This is covered by an integration test.
- Admin → Controllers shows each Controller's capability list with its reasons. A Reseller who tries to create a package the hardware cannot enforce gets those reasons in the error.
- Adoption is not automated. An approved device claim records the device, and adoption itself must be done in the Omada UI until `adoptDevice` is verified.
