## Why

Musuw's enforced plan limits no longer match the desired consumer allocation: Free should receive a smaller monthly AI allowance, and all four storage tiers need a new capacity matrix. The server, existing tenants, and consumer-facing plan copy must agree on one set of limits before any later release.

## What Changes

- **BREAKING** Change monthly Free OpenRouter allowance from USD 1.00 to USD 0.40; keep the paid-plan AI allowances unchanged.
- **BREAKING** Change storage limits to Free 1 GiB, Plus 10 GiB, Pro 30 GiB, and Max 100 GiB.
- Apply USD 0.40 to newly provisioned Free keys and the next registration-anchored allowance refresh through the existing entitlement lifecycle; do not claw back an already-issued current period or break explicit operations compensation.
- Migrate existing tenant rows to the storage quota for their persisted plan without deleting data; tenants already above quota keep their data but cannot add more until usage is below the limit.
- Update the existing product and storefront plan descriptions to the same matrix.
- Do not change prices, Paddle products, checkout, subscriptions, webhooks, billing cadence, or paid-plan AI allowances.

## Capabilities

### New Capabilities

- `consumer-plan-limits`: Defines the authoritative Free/Plus/Pro/Max storage matrix, the Free monthly AI allowance, convergence for existing rows and provider keys, and matching consumer copy.

### Modified Capabilities

None.

## Impact

- Server plan-limit definition, tenant defaults, entitlement key reconciliation, and focused tests.
- PostgreSQL and SQLite migrations plus fresh-schema defaults for persisted tenant quotas.
- Product Plans/Checkout and public storefront entitlement copy and their contract tests.
- Existing stored files remain untouched; no new dependency, table, provider layer, cache, payment mutation, or pricing change is introduced.
