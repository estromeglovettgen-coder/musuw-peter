## ADDED Requirements

### Requirement: Operators can inspect an effective tenant entitlement

The system SHALL expose a SystemAdmin/platform-key snapshot for an explicit
tenant using the existing tenant and entitlement services. The response SHALL
include storage quota/used bytes, configured and effective plan/status,
verified billing period metadata, consumer-period OpenRouter
allowance/used/remaining/reset/status, and explicit provider raw
used/remaining counters. It MUST NOT include provider credentials.

#### Scenario: Provider usage is available

- **WHEN** a permitted operator requests a tenant entitlement snapshot
- **THEN** the response returns the current provider-backed usage and the
  tenant's effective plan and storage state

#### Scenario: Provider usage is unavailable

- **WHEN** OpenRouter management usage cannot be read
- **THEN** the snapshot remains readable and reports
  `openrouter_credits_status=unavailable` without fabricating usage

### Requirement: Tenant status and storage quota use a narrow mutation

The system SHALL accept only `active`/`inactive` status and positive
`storage_quota_bytes` through the SystemAdmin mutation route. It MUST reject
plan, Paddle, credential, and arbitrary tenant fields and SHALL audit success.

#### Scenario: Invalid mutation is submitted

- **WHEN** an operator submits an unsupported status, non-positive quota, or
  no whitelisted field
- **THEN** the request returns 400 and the tenant is unchanged

### Requirement: OpenRouter support adjustment uses the provider authority

The system SHALL adjust an existing tenant child key through the official
OpenRouter KeyManager and SHALL bound manually supplied remaining credits by
the existing Max plan allowance (5,000,000 microusd). `reset:true` SHALL
restore the tenant's current effective plan allowance. It MUST NOT add a
local usage ledger or mutate Paddle state and SHALL audit success.

#### Scenario: Operator resets remaining credits

- **WHEN** a permitted operator submits `{"reset":true}`
- **THEN** the provider-managed key is set to lifetime usage plus the current
  plan allowance and the response reports the refreshed entitlement

#### Scenario: Operator requests an out-of-range amount

- **WHEN** `remaining_microusd` exceeds the Max allowance or is
  negative
- **THEN** the request is rejected without a provider update

### Requirement: Operators can investigate one user without sensitive payloads

The system SHALL expose a bounded read-only investigation projection for an
explicit user and optional tenant. It SHALL reuse existing user/tenant,
entitlement, session/message, audit, knowledge/document, processing-span,
dead-letter, and runtime queue read paths. Session/message entries SHALL
include only IDs, timestamps, request/model/agent/channel/reasoning metadata,
and completion state. Knowledge failures SHALL include document status and
bounded error summaries; processing spans SHALL include correlation IDs,
status and bounded error summaries. The response MUST NOT include prompts,
message content, attachments, span input/output/metadata, provider keys, or
pending/dead-letter raw payloads. Langfuse/OpenRouter trace fields SHALL be
returned when the existing provider-backed data is available; otherwise each
source SHALL explicitly report `available=false` and a reason.

#### Scenario: Support operator investigates a user

- **WHEN** a permitted operator requests
  `GET /api/v1/system/admin/users/:user_id/investigation`
- **THEN** the response returns bounded user/tenant/session/knowledge/audit
  correlations and safe runtime status, with model and reasoning-effort
  metadata where persisted

#### Scenario: Optional observability is not configured

- **WHEN** Langfuse query access or a runtime backend is unavailable
- **THEN** the investigation remains readable and the corresponding section
  reports `available=false` rather than returning an empty success that looks
  authoritative

### Requirement: The local console composes existing authorities safely

The system SHALL provide a loopback-only, source-controlled TDesign operations
console with overview, users, knowledge/documents, billing, identity, storage,
and logs/tracing pages. Operational database queries MUST be read-only. Every
business mutation MUST use the capability-scoped WeKnora routes above, while
provider data MUST come from an official provider API or report an explicit
unavailable reason. The console MUST NOT expose provider or platform keys to
browser code.

#### Scenario: A provider credential is absent

- **WHEN** Supabase Auth Admin, R2 operator, Langfuse query, Paddle, or WeKnora
  server credentials are not configured for the selected environment
- **THEN** the affected capability reports unavailable with a reason and no
  database mirror or empty response is presented as provider success

#### Scenario: An operator submits a mutation

- **WHEN** an operator confirms a supported user or runtime action
- **THEN** the request requires the local SameSite session, exact Origin, CSRF
  token and action-specific confirmation before reaching the existing API

### Requirement: TEST and PRODUCTION are process-level environments

The system SHALL select TEST or PRODUCTION only when the local operations
process starts. PRODUCTION MUST require an explicit unlock phrase, separate
ignored runtime configuration, and a read-only database connection. The
browser MUST NOT switch or mix environment credentials.

#### Scenario: Production is not independently configured

- **WHEN** an operator attempts to start PRODUCTION without the unlock phrase,
  complete runtime file, or a read-only database
- **THEN** startup fails closed before serving the console
