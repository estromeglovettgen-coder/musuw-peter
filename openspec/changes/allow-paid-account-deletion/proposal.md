## Why

The managed account-erasure flow currently rejects every account whose Paddle customer still has an active, trialing, past-due, or paused subscription. Paid status should not prevent account closure, but deleting local identity and product data must not leave an unattended recurring subscription that can renew after the account is gone.

## What Changes

- Let operations accept account-erasure requests for paid accounts after the server has safely initiated cancellation of every relevant Paddle subscription.
- Schedule normal active or trialing subscriptions to cancel at the end of the already-paid billing period, avoiding an automatic immediate refund, then fence the account immediately.
- Treat an already scheduled cancellation or terminal subscription as idempotent success; keep unknown, unreadable, or non-cancelable provider states fail-closed before the account is fenced.
- Keep the existing asynchronous erasure worker from purging the local account until Paddle reports every subscription terminal.
- Update the operations warning and legal lifecycle copy so they describe the combined cancellation-and-erasure behavior.

## Capabilities

### Modified Capabilities

- `account-erasure`: Replace the previous blanket paid-subscription blocker with verified cancellation preparation, immediate fencing, terminal-state cleanup, and post-purge webhook idempotency.

## Impact

- Backend account-erasure billing adapter and service orchestration under `weknora/internal/application/service`.
- Operations-console account-erasure copy and focused frontend contract tests.
- Public subscription/privacy lifecycle copy where it currently says deletion never affects a Paddle subscription.
- The existing Paddle Go SDK, verified webhook sync, housekeeping recovery, and erasure queue are reused; no schema, queue, ledger, or browser-supplied provider identifier is added.
