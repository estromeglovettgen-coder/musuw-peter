## Why

Operators need a safe way to grant time-bounded Plus, Pro, or Max access without creating a fake Paddle subscription or directly editing tenant rows. The current billing mirror correctly treats signed Paddle events as the paid-plan authority, so an operator grant needs its own narrow, auditable entitlement state that expires automatically and yields to a later real subscription.

## What Changes

- Add an operator-only grant/revoke flow for Plus, Pro, and Max with an explicit future expiration time.
- Reuse the tenant's existing limits, OpenRouter child key, storage enforcement, and entitlement service. Keep the Paddle-owned `plan` and `plan_status` untouched and add only three tenant scalars: complimentary plan, expiration, and an opaque grant ID for idempotency/revoke compare-and-set. Add no second membership table, billing ledger, scheduler, or provider key.
- Enforce complimentary expiration on every entitlement read/use, refresh its monthly OpenRouter allowance lazily within the grant term, and fail closed after expiration.
- Keep Paddle customer, subscription, cadence, transaction, and event fields untouched by operator grants. A verified Paddle activation replaces a complimentary grant; an operator grant cannot overwrite an existing Paddle binding.
- Add exact, capability-scoped operations APIs, audit entries, and clearly labeled console controls for grant and revoke. Generic tenant editing remains unable to change plans; the dedicated buttons do not require a second manual confirmation phrase.

## Capabilities

### New Capabilities
- `complimentary-plan-grants`: Time-bounded, auditable operator grants for Plus, Pro, and Max that reuse the existing entitlement authority without impersonating Paddle.

### Modified Capabilities
- `consumer-plan-entitlements`: Effective plan, storage, model, and OpenRouter enforcement also recognize an unexpired complimentary term and let a later verified Paddle activation take ownership.
- `system-admin-operations`: The local operations console gains narrow grant/revoke controls with explicit action buttons and audit records.

## Impact

- Tenant schema and SQLite/PostgreSQL migrations gain nullable complimentary plan, UTC expiration, and opaque grant-ID columns.
- Existing entitlement types, repository, service, Paddle synchronization, and tests gain complimentary-state handling.
- Existing SystemAdmin routing/handlers, Lite route gate, local admin proxy, operations API/types/UI, audit actions, and tests gain two narrow mutations.
- No new dependency, service, scheduler, table, provider credential, Paddle object, public consumer plan-mutation endpoint, or generic tenant-plan field is introduced.
