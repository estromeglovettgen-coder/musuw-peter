## Why

Musuw's production billing integration is deliberately pinned to Paddle Sandbox even though the existing Live account already contains the intended catalog, public client, approved app domain, and notification destination. The separately authorized Live cutover must replace that fixed launch boundary as one reviewed, fail-closed deployment unit and prove the real checkout and webhook paths without creating a charge or changing payout details.

## What Changes

- Require production to use one internally consistent Paddle Live unit: Live SDK mode, one existing active client token, the existing six active recurring prices, one existing server-only API key with the verified required scopes, and the signing secret for the one production destination.
- Reuse and verify the approved app domain, set the default payment link to the public Paddle.js `/pay` route, and use Paddle's automatic transaction API plus Paddle.js `transactionId` checkout, official subscription update and customer portal APIs, signed webhooks, retry, ordering, and idempotency paths. Musuw keeps only one tenant-scoped durable active-operation fence to prevent duplicate tabs; Paddle remains the payment and subscription authority.
- Define an explicit fail-closed refund and dispute entitlement policy using Paddle adjustment notifications and authoritative provider reads, without adding a parallel billing ledger or creating a financial transaction for testing.
- Move the local production operations view and deployment contracts from Sandbox to Live while keeping Sandbox development/test resources isolated and available.
- Record provider, protected-runtime, CI, production smoke, rollback, and secret-leak evidence. No payout account, real payment method, charge, refund, transfer, or fabricated production event is in scope.

## Capabilities

### New Capabilities

- `paddle-live-production`: Atomic Paddle Live configuration, provider-state verification, no-charge checkout acceptance, signed lifecycle/adjustment processing, protected secret delivery, production operations, deployment, and rollback boundaries.

### Modified Capabilities

None. The repository has no synchronized base capability for the previously deferred Paddle Live authorization; this change records it as a new capability and reuses the existing consumer entitlement implementation.

## Impact

- Production runtime contract and static release preflight under `integration/weknora-production` and `scripts/weknora-production`.
- Existing Paddle webhook and entitlement worker paths in `weknora`, plus their focused tests if the required adjustment policy needs a minimal extension.
- Local Musuw operations provider selection, external-credential metadata, deployment/runbook documentation, and the exact-SHA GitHub/server release.
- Paddle Live Dashboard/API configuration for catalog verification, default payment link, notification event selection, webhook simulation, and protected server secret files; payout settings remain untouched.
