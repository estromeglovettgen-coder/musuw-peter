## MODIFIED Requirements

### Requirement: Billing remains Paddle-owned before erasure
Before accepting deletion, the system SHALL read the complete subscription inventory for the stored Paddle customer through the configured official Paddle Live/Sandbox client and validate the whole inventory before its first provider write. For each active or trialing subscription the server SHALL request cancellation at the next billing period; for each paused subscription it SHALL request immediate cancellation; and it SHALL require the response to confirm the same subscription is canceled or has a valid scheduled cancel change. A provider-confirmed terminal subscription, an already scheduled cancellation, empty customer inventory, or official not-found result MAY proceed idempotently. A past-due, unknown, unreadable, mismatched, malformed, or otherwise non-cancelable state SHALL fail closed before the local account is fenced. Account erasure SHALL NOT refund, charge, credit, adjust, transfer, or directly grant or revoke an entitlement.

#### Scenario: Active or trialing subscription can renew
- **WHEN** an eligible account has an active or trialing subscription
- **THEN** the server schedules period-end cancellation without an immediate refund and accepts erasure only after Paddle confirms the cancellation preparation

#### Scenario: Paused subscription remains bound
- **WHEN** an eligible account has a paused subscription
- **THEN** the server requests immediate provider cancellation and accepts erasure only after Paddle confirms terminal cancellation

#### Scenario: Cancellation was already scheduled
- **WHEN** a retry sees an active subscription whose scheduled change action is already `cancel`
- **THEN** the service does not issue a second cancellation mutation and continues account erasure

#### Scenario: Customer has multiple subscriptions
- **WHEN** the authoritative customer inventory contains multiple subscriptions
- **THEN** the service validates every subscription and prepares every cancellable subscription before fencing the account

#### Scenario: Provider state cannot be safely canceled
- **WHEN** Paddle reports a past-due or unknown state, mismatched coordinates, a malformed response, or an unavailable read or mutation
- **THEN** the service leaves the account usable and unqueued for a safe retry after provider resolution

#### Scenario: Pre-launch binding is stale
- **WHEN** an authenticated account carries a disposable legacy subscription identifier and the selected Paddle environment authoritatively returns not found
- **THEN** the stale local binding does not require a cross-environment recovery subsystem and deletion may continue without any Paddle write

### Requirement: Accepted erasure is fenced, durable, and idempotent
After provider cancellation preparation succeeds, an accepted request SHALL mark the target user deletion-pending and inactive, revoke every local access and refresh token, and enqueue one deterministic task through the existing task backend before returning HTTP 202 to the operations console. Login, refresh, checkout, inference, and OIDC auto-provisioning SHALL reject a deletion-pending identity. A missed or exhausted enqueue SHALL be recoverable from the persisted fence by the existing five-minute housekeeping path, including replacement of an archived deterministic task with a fresh bounded retry budget. Retried, archived, or duplicate tasks SHALL converge without creating a second deletion workflow or cancellation mutation.

#### Scenario: Paid request is accepted
- **WHEN** deletion preflight and provider cancellation preparation pass and the durable marker is committed
- **THEN** every existing session stops authorizing product work and one idempotent cleanup task is accepted or recoverable

#### Scenario: Period-end cancellation outlives one queue retry budget
- **WHEN** the erasure task is archived before Paddle reaches a distant cancellation boundary
- **THEN** housekeeping re-enqueues the still-fenced account with a fresh retry budget

#### Scenario: Cleanup dependency fails temporarily
- **WHEN** storage, vector, graph, Supabase, OpenRouter, queue, database, or terminal Paddle verification fails
- **THEN** the account remains fenced, the same task is retried or recovered by existing housekeeping, and the server does not claim erasure complete

### Requirement: Musuw-controlled active product state is removed before final identity deletion
The erasure worker SHALL verify that every subscription in the authoritative Paddle customer inventory is canceled or absent before removing the personal workspace's knowledge, chunks, files, temporary objects, vector and graph material, sessions/messages, models and credentials, API keys, MCP state, sharing and organization links, queued work, OpenRouter child key, entitlement bindings, and other Musuw-controlled tenant/user rows using one explicit dependency order. A subscription whose period-end cancellation is merely scheduled SHALL remain non-terminal. The worker SHALL remove the bound Supabase Auth identity through a server-only official Admin API adapter and only then hard-delete the local user and owned personal tenant so email and username uniqueness are released. The browser SHALL never receive admin credentials. Required tax, dispute, anti-fraud, security-log, and bounded-backup retention SHALL be minimized/detached and truthfully disclosed rather than represented as active account data.

#### Scenario: Scheduled cancellation is still active
- **WHEN** the erasure worker runs before Paddle reaches the scheduled cancellation boundary
- **THEN** it leaves the fenced account pending without deleting provider identity, tenant, or user rows

#### Scenario: Erasure completes
- **WHEN** every Paddle subscription is terminal and every dependent external cleanup and local purge succeeds
- **THEN** the old tokens fail, active product queries return no account or personal-workspace state, provider child credentials no longer exist, and the same email may register a fresh account

#### Scenario: Immutable or delayed retention applies
- **WHEN** a Paddle invoice, legally required minimized record, security log, or bounded backup is subject to a separate retention period
- **THEN** the product does not expose it as an active account, does not promise immediate physical disappearance, and explains the retention boundary in the confirmation UI and legal copy

## ADDED Requirements

### Requirement: Late signed billing events are idempotent after purge
The Paddle task worker SHALL acknowledge a valid queued lifecycle or renewal event when its entitlement mutation reports the explicit missing-tenant sentinel after erasure, SHALL NOT settle a billing operation for that no-op, and SHALL continue retrying every other database or provider error.

#### Scenario: Signed event was queued before final purge
- **WHEN** the entitlement worker executes after the account-erasure worker has removed the referenced tenant
- **THEN** the event is completed as a no-op and no billing operation is settled

#### Scenario: Entitlement storage is temporarily unavailable
- **WHEN** an entitlement mutation fails for any reason other than the explicit missing-tenant sentinel
- **THEN** the Paddle task remains failed and eligible for its existing bounded retry behavior

### Requirement: Operations communicates the combined lifecycle
The operations confirmation and public lifecycle copy SHALL explain that accepted paid-account closure stops future renewal through Paddle, does not itself issue a refund, immediately removes product access, and may defer final purge until cancellation is terminal.

#### Scenario: Operator reviews paid-account deletion
- **WHEN** the operator opens the destructive account-erasure confirmation
- **THEN** the UI states the cancellation, access, refund, and deferred-purge consequences without instructing the operator to cancel the subscription first
