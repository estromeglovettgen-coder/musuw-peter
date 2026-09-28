## Context

Managed erasure is an operations-only flow. It loads the user, home tenant, identity binding, Paddle customer/subscription coordinates, and ownership constraints on the server; fences login immediately after preflight; and reuses the existing asynchronous cleanup worker. Today its Paddle adapter is read-only and refuses every non-terminal subscription, so paid status is an absolute blocker.

The product must allow an account owner to close a paid account without silently preserving automatic renewal or using immediate cancellation as a hidden refund path. Paddle remains the authority for subscription state and the existing signed webhook remains the authority for entitlement changes.

## Goals / Non-Goals

**Goals:**

- Accept managed erasure for accounts with active or trialing Paddle subscriptions after cancellation is safely scheduled.
- Stop future renewal without issuing an immediate prorated refund.
- Fence product access as soon as provider cancellation is confirmed or already scheduled.
- Preserve idempotency across retries, multiple subscriptions, partial provider success, and delayed webhooks.
- Purge local identity and product data only after every Paddle subscription is terminal.

**Non-Goals:**

- Self-service deletion in the consumer profile.
- Refunds, credits, adjustments, or immediate cancellation of an active paid period.
- A new subscription table, queue, reconciliation daemon, or browser-supplied Paddle identifier.
- Bypassing workspace ownership, system-admin, identity-binding, or legal-retention constraints.

## Decisions

### Reuse one billing adapter for preparation and terminal verification

Extend the existing server-only account-erasure billing guard with a preparation method. The request phase loads Paddle inventory by the stored customer ID (or the stored subscription when no customer ID exists), and the worker keeps the existing terminal read. This preserves the current provider ownership boundary and catches additional subscriptions attached to the customer.

Alternative considered: remove the billing guard. Rejected because it would purge the account while Paddle could continue renewing an orphaned subscription.

### Schedule active/trialing cancellation at period end

For `active` and `trialing`, call the official Paddle SDK cancel operation with `effective_from=next_billing_period`. A subscription that is already terminal or already has `scheduled_change.action=cancel` is idempotent success. `paused` subscriptions are canceled immediately because Paddle does not bill them and its cancel API treats immediate cancellation as the supported terminal path. Unknown, unreadable, past-due, or otherwise non-cancelable states fail before the local account is fenced.

Alternative considered: cancel every subscription immediately. Rejected because an active paid subscription may create a prorated refund and would turn account closure into an undeclared financial adjustment.

### Fence after provider preparation, purge after provider terminal state

Only after all discovered subscriptions are terminal or cancellation-prepared does the service persist the existing deletion fence, revoke sessions, and enqueue the existing deterministic task. The worker continues to return a retryable result while period-end cancellation is pending. Existing housekeeping re-enqueues archived deterministic work from the durable fence, so no new scheduler or state column is required.

If cancellation of multiple subscriptions partially succeeds, the request returns failure without fencing. A retry rereads Paddle, skips already scheduled cancellations, and continues the remaining subscriptions.

### Keep webhook authority unchanged

The synchronous cancel result proves only that cancellation was accepted. It does not directly downgrade the local plan. Existing signed `subscription.updated` and `subscription.canceled` handling remains the only entitlement authority.

### Treat signed events for an already-erased tenant as terminal no-ops

The erasure worker reads Paddle before its final purge, so a signed lifecycle or renewal event may already be queued when the tenant row disappears. Entitlement repositories map only a genuinely missing tenant to the existing `ErrTenantNotFound` sentinel, and the Paddle worker acknowledges that sentinel without settling a billing operation. Malformed payloads, unbound HTTP events, provider errors, and ordinary database failures keep their existing reject-or-retry behavior.

## Risks / Trade-offs

- [An annual subscription is scheduled far in the future] → The account is inaccessible immediately, while provider and minimum local cleanup state remain until terminal cancellation; housekeeping keeps the durable erasure request recoverable.
- [Paddle is unavailable or returns an unknown state] → Fail before fencing, return a stable billing-unavailable error, and permit a safe retry.
- [A subscription is past due and Paddle rejects modification] → Keep the account active rather than delete it while dunning may continue; operations must resolve the provider state and retry.
- [Only some customer subscriptions accept cancellation] → Do not fence; a retry is idempotent because already scheduled cancellation is recognized.
- [A cancellation webhook is delayed] → The worker reads Paddle directly before purge and therefore does not depend on local webhook timing for erasure safety; a signed event already queued after purge is an idempotent no-op.
- [A scheduled cancellation lasts longer than one task retry budget] → The fenced database row remains the durable outbox; the existing five-minute housekeeping sweep replaces an archived deterministic task with a fresh retry budget until Paddle becomes terminal.

## Migration Plan

1. Add focused failing tests for active/trialing scheduling, paused termination, already-scheduled idempotency, multi-subscription partial failure, and worker terminal gating.
2. Deploy the adapter/service and operations copy with no schema migration.
3. Verify against Paddle Sandbox with a disposable paid account; do not delete a production account during release verification.
4. Roll back code if needed. Any cancellation already accepted by Paddle remains scheduled, while an unfenced local account remains usable until the provider webhook updates entitlement.

## Open Questions

None. Provider states Paddle does not permit canceling remain explicit retryable blockers rather than being converted into unsafe local-only deletion.
