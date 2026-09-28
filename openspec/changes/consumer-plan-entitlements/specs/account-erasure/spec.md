> The billing requirement below records the original pre-release behavior and is superseded by the `MODIFIED Requirements` in `allow-paid-account-deletion/specs/account-erasure/spec.md` as of 2026-08-30.

## ADDED Requirements

### Requirement: Account erasure is an operations-only action
The system SHALL expose one account-erasure action only in the local operations console. The backend route SHALL remain inside the existing SystemAdmin control plane and SHALL require either a SystemAdmin session or the existing platform key capability for tenant management. The selected user identifier SHALL come from the managed-user row; the browser SHALL NOT supply a tenant, Paddle, or provider identifier. System-administrator targets, organization owners, and personal workspaces with another active member SHALL fail closed. Ordinary workspace and organization memberships SHALL be removed automatically without deleting shared state.

#### Scenario: Operator confirms deletion
- **WHEN** an authorized operator presses the managed user's visible deletion button, confirms the irreversible action, and the target owns one personal workspace with no other active member
- **THEN** the server accepts one durable deletion request for that target and returns no user, tenant, Paddle, or provider identifier

#### Scenario: Caller, target, or ownership is unsafe
- **WHEN** the caller lacks the SystemAdmin control-plane authority, the target is a system administrator, owns an organization, or another active member depends on the personal workspace
- **THEN** no deletion fence, provider call, token revocation, or local data deletion occurs

### Requirement: Billing remains Paddle-owned before erasure
Before accepting deletion, the system SHALL perform an authoritative read through the configured official Paddle Live/Sandbox client. When a customer is bound, the customer-filtered subscription inventory SHALL be authoritative even if the local subscription ID is absent. A billable active, trialing, past-due, or paused subscription SHALL block deletion so the subscription can be resolved through Paddle's official hosted management surface. A provider-confirmed terminal subscription, empty customer inventory, or official not-found result MAY proceed. An unavailable, malformed, or ambiguous read SHALL fail closed. Account erasure SHALL NOT cancel, refund, charge, transfer, or otherwise mutate Paddle financial state.

#### Scenario: Subscription can still bill
- **WHEN** Paddle reports that the account's bound subscription is active, trialing, past due, or paused
- **THEN** deletion is not accepted, local identity remains active, and the operations UI reports that Paddle billing must be resolved first

#### Scenario: Pre-launch binding is stale
- **WHEN** an authenticated account carries a disposable legacy subscription identifier and the selected Paddle environment authoritatively returns not found
- **THEN** the stale local binding does not require a cross-environment recovery subsystem and deletion may continue without any Paddle write

### Requirement: Accepted erasure is fenced, durable, and idempotent
An accepted request SHALL mark the target user deletion-pending and inactive, revoke every local access and refresh token, and enqueue one deterministic task through the existing task backend before returning HTTP 202 to the operations console. Login, refresh, checkout, inference, and OIDC auto-provisioning SHALL reject a deletion-pending identity. A missed enqueue SHALL be recoverable from the persisted fence by the existing housekeeping path. Retried, archived, or duplicate tasks SHALL converge without creating a second deletion workflow.

#### Scenario: Request is accepted
- **WHEN** deletion preflight passes and the durable marker is committed
- **THEN** every existing session stops authorizing product work and one idempotent cleanup task is accepted or recoverable

#### Scenario: Cleanup dependency fails temporarily
- **WHEN** storage, vector, graph, Supabase, OpenRouter, queue, or database cleanup fails
- **THEN** the account remains fenced, the same task is retried or recovered by existing housekeeping, and the server does not claim erasure complete

### Requirement: Musuw-controlled active product state is removed before final identity deletion
The erasure worker SHALL remove the personal workspace's knowledge, chunks, files, temporary objects, vector and graph material, sessions/messages, models and credentials, API keys, MCP state, sharing and organization links, queued work, OpenRouter child key, entitlement bindings, and other Musuw-controlled tenant/user rows using one explicit dependency order. It SHALL remove the bound Supabase Auth identity through a server-only official Admin API adapter and only then hard-delete the local user and owned personal tenant so email and username uniqueness are released. The browser SHALL never receive admin credentials. Required tax, dispute, anti-fraud, security-log, and bounded-backup retention SHALL be minimized/detached and truthfully disclosed rather than represented as active account data.

#### Scenario: Erasure completes
- **WHEN** every dependent external cleanup and local purge succeeds
- **THEN** the old tokens fail, active product queries return no account or personal-workspace state, provider child credentials no longer exist, and the same email may register a fresh account

#### Scenario: Immutable or delayed retention applies
- **WHEN** a Paddle invoice, legally required minimized record, security log, or bounded backup is subject to a separate retention period
- **THEN** the product does not expose it as an active account, does not promise immediate physical disappearance, and explains the retention boundary in the confirmation UI and legal copy
