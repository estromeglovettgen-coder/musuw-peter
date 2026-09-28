## Context

Musuw already has one tenant-scoped entitlement module that joins persisted plan state, storage limits, model/content gates, and one provider-managed OpenRouter child key. Paddle-signed lifecycle and recurring-transaction events own `tenants.plan`, `plan_status`, provider identity, billing cadence, paid-term boundaries, and event cursors. The local operations console already exposes capability-scoped, audited tenant mutations through a loopback SameSite/CSRF proxy.

A direct `UPDATE tenants SET plan='pro'` is unsafe: the current resolver does not recognize a complimentary status, paid OpenRouter access requires verified Paddle periods, and overwriting Paddle-owned fields changes webhook ownership, refund recovery, and first-purchase behavior. Custom expiration and replay-safe revoke also cannot be represented by `plan_status` alone.

## Goals / Non-Goals

**Goals:**

- Grant an otherwise Free, Paddle-unbound tenant Plus, Pro, or Max until an exact UTC instant.
- Apply one effective plan consistently to storage writes, model/content gates, consumer/operations projections, and OpenRouter allowance.
- Preserve Paddle as the billing authority and let a later verified initial activation atomically supersede the grant.
- Make grant and revoke row-locked, replay-safe, compare-and-set operations with dedicated audit actions.
- Reuse the current entitlement repository/service, provider key, lazy monthly period mechanism, SystemAdmin capability, operations proxy, and UI drawer.

**Non-Goals:**

- Gifting an active, paused, recovering, refunded, chargeback, or otherwise Paddle-bound subscription.
- Creating Paddle customers, subscriptions, transactions, prices, coupons, invoices, or trials.
- A second membership table, entitlement history ledger, scheduler, background expiry worker, new provider key, or general-purpose plan editor.
- Stacking grants, scheduling future grants, restoring an overwritten grant, or granting arbitrary custom quotas.

## Decisions

### Keep complimentary state separate from Paddle state

Add nullable `complimentary_plan`, `complimentary_expires_at`, and `complimentary_grant_id` columns to the existing tenant row. The grant ID is an opaque client-generated operation ID: an exact replay is a no-op, a reused ID with different payload is a conflict, and revoke compares the expected ID so an old request cannot revoke a later grant.

`plan`, `plan_status`, all Paddle identity/period/cursor fields, and storage data remain untouched. This costs two more scalar columns than overloading `plan_status`, but removes the need to snapshot/restore Paddle state or teach every billing branch that a fake paid plan is not a subscription.

The effective-plan priority is:

1. a verified underlying Paddle plan that is entitled at the requested instant;
2. an unexpired valid complimentary plan;
3. Free.

Grant creation is additionally restricted to an underlying Free tenant with no Paddle customer or subscription binding. This keeps the first release single-state and prevents historical subscription events from interacting with a manual grant. A valid signed initial Paddle activation may arrive while the grant is active; its tenant-row transaction clears the complimentary plan and expiration while preserving the last grant ID for stale-revoke compare-and-set.

### Resolve expiration lazily at every existing enforcement seam

No scheduler mutates a tenant at expiration. `EffectiveConsumerPlanAt` recognizes an active grant only while `expires_at.After(at.UTC())`; the exact expiration instant is already Free. Consumer plan, model, knowledge/document/video, storage-write, checkout, entitlement response, and OpenRouter paths use this time-aware resolver.

An active grant exposes `plan_status=complimentary` and its expiration in the entitlement DTO while the underlying tenant billing status stays unchanged. Expired grant metadata remains visible to operators until replaced or explicitly revoked, but grants no access.

Storage quota is not rewritten. While the grant is active, the storage write limit is the larger of the existing operator-set tenant quota and the granted plan limit. On expiration/revoke, it naturally returns to the underlying limit; existing files are retained and new writes fail when usage is over the restored quota.

Storage admission is recalculated from the tenant row after the storage transaction has acquired that row's lock. The quota passed from the request layer is only an early user-experience check. This prevents an upload that began before revoke/expiry from committing bytes under a stale complimentary quota after the underlying tenant has returned to Free.

### Reuse one OpenRouter key and one durable desired limit

Granting starts one full current-plan allowance above provider-reported lifetime usage. The existing `open_router_credit_period_end` becomes the next complimentary monthly boundary, capped at the grant expiration. For grants longer than one month, the first read/use after each boundary lazily advances exactly one current allowance and never stacks missed periods. At the final boundary, expiration resolves to Free, advances to the next Free registration-anniversary boundary, and sets the durable desired provider limit to lifetime usage plus one Free allowance before inference continues.

Grant-specific repository transitions validate the grant ID, plan, expiration, and underlying Paddle-free state again under `SELECT ... FOR UPDATE`. This prevents a stale complimentary refresh from overwriting a concurrently committed Paddle activation. Database state commits before provider mutation; a provider failure leaves one replayable durable desired target and model use fails closed until convergence.

OpenRouter cannot participate in the tenant database transaction, so every provider-limit mutation is centralized in one convergence helper. It re-reads the durable target before writing and verifies it again afterwards; if Paddle or a grant transition commits while the provider call is in flight, the writer immediately retries the newer target before returning. Repeated contention returns a retryable failure instead of claiming convergence.

A tenant without a managed key receives no extra key at grant time. First OpenRouter use provisions the existing single key with the active complimentary allowance and the capped boundary.

### Add narrow operations mutations

Add `PUT` and `DELETE /api/v1/system/admin/tenants/:id/complimentary-entitlement`. Both stay under SystemAdmin and the existing `system_tenants_manage` platform capability, reject unknown JSON fields, and rely on the explicitly labeled grant/revoke action buttons rather than a second manual confirmation phrase. Grant accepts only Plus/Pro/Max, an RFC3339 timestamp with offset that is strictly in the future, and a bounded opaque grant ID. Revoke requires the current grant ID.

The loopback operations proxy explicitly allowlists these two exact shapes and retains its existing Origin, SameSite session, and CSRF checks. The user drawer shows source, current/expired grant metadata, plan selector, local date-time input converted to UTC, and clearly labeled grant/revoke buttons. Generic tenant PATCH continues to reject all plan fields.

Accepted grant/revoke transitions emit dedicated platform audit actions containing actor, tenant, old/new effective plan, expiration, and grant ID; secrets and Paddle identifiers are not copied into audit details.

## Risks / Trade-offs

- **Provider update succeeds after a newer state wins** → every provider mutation re-reads the durable target before writing and verifies it afterwards; losing writers converge to the winner rather than returning after a stale usage snapshot.
- **Expiration is not a physical row update** → all access uses the time-aware resolver, and the OpenRouter boundary is capped at expiration so the next use must converge to Free before inference.
- **A grant cannot currently target a Paddle-bound account** → the API returns a conflict with an actionable message. This deliberately avoids subscription-overlay semantics and can be expanded later only with a separate requirement.
- **Rollback while grants are active could leave a provider target above Free** → revoke/reconcile active grants with the new binary before rolling back or applying the down migration. The old binary otherwise sees the untouched underlying Free plan and fails closed on paid model access.
- **Audit persistence uses the existing best-effort audit service** → this change adds dedicated events but does not create a second transaction/ledger solely for audit history.

## Migration Plan

1. Apply nullable PostgreSQL and SQLite columns; existing rows remain unchanged and Free/Paddle behavior is identical.
2. Deploy the backend resolver, repository/service transitions, routes, and proxy allowlist.
3. Deploy the operations UI controls.
4. Run grant/revoke/expiry/Paddle-takeover tests in an isolated environment, including provider failure and exact-boundary cases.
5. For rollback, first revoke or reconcile all active complimentary grants, deploy the previous binary, then optionally remove the nullable columns.

## Open Questions

None for the bounded first release. Grants to accounts with any Paddle binding and future-scheduled/stacked grants remain explicitly out of scope.
