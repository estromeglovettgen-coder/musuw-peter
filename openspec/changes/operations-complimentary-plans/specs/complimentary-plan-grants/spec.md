## ADDED Requirements

### Requirement: Operators can grant one time-bounded paid plan
An authorized platform operator SHALL be able to grant Plus, Pro, or Max to an underlying Free tenant with no Paddle customer or subscription binding. The grant SHALL contain an opaque grant ID and an expiration timestamp parsed from RFC3339 with an explicit offset, normalized to UTC, and strictly later than the server's current time. The system SHALL NOT create or mutate Paddle objects or fields.

#### Scenario: Operator grants Pro
- **WHEN** an authorized operator submits Pro, a new grant ID, and a future RFC3339 expiration for a Paddle-unbound Free tenant through the dedicated grant action
- **THEN** Pro becomes effective immediately through the existing entitlement service and the grant ID, plan, and UTC expiration are stored atomically on that tenant

#### Scenario: Operator grants any supported tier
- **WHEN** the same valid request selects Plus, Pro, or Max
- **THEN** the corresponding existing plan limits, storage/model/content gates, and monthly OpenRouter allowance apply without a second key or entitlement table

#### Scenario: Invalid grant input
- **WHEN** the plan is Free or unknown, the expiration is missing, offset-free, zero, or not in the future, the grant ID is invalid, a legacy confirmation field is supplied, or an unknown request field is present
- **THEN** the request is rejected without changing tenant or provider state

#### Scenario: Paddle-bound account
- **WHEN** a grant targets a tenant with an underlying non-Free plan or any Paddle customer or subscription binding
- **THEN** the request is rejected as a conflict and no billing, entitlement, storage, or provider state changes

### Requirement: Grant and revoke are replay-safe compare-and-set operations
Grant and revoke SHALL serialize on the tenant row. An exact grant replay SHALL return the existing result without adding allowance, while reuse of a grant ID with different plan or expiration SHALL conflict. A different grant SHALL NOT replace a currently active grant until it is revoked. Revoke SHALL require the current grant ID, SHALL clear only complimentary plan/expiration state, and SHALL preserve the last grant ID so delayed duplicate or stale revoke requests cannot affect a later grant or Paddle subscription.

#### Scenario: Exact grant replay
- **WHEN** the same tenant, grant ID, plan, and expiration are submitted again after the first request committed
- **THEN** the system returns the same effective grant and does not add provider allowance or write a second audit success

#### Scenario: Grant ID payload conflict
- **WHEN** an existing grant ID is reused with a different plan or expiration
- **THEN** the request conflicts and the existing grant remains unchanged

#### Scenario: Active grant replacement attempt
- **WHEN** a new grant ID is submitted while another grant is still active
- **THEN** the request conflicts and instructs the operator to revoke the active grant first

#### Scenario: Matching revoke
- **WHEN** an authorized operator submits the current grant ID through the dedicated revoke action
- **THEN** complimentary access ends immediately, the underlying Free entitlement resumes, data is preserved, and the provider target converges to the Free allowance

#### Scenario: Stale revoke
- **WHEN** a revoke contains a grant ID that does not identify the current or last revoked grant
- **THEN** the request conflicts and cannot revoke a later grant or a real Paddle subscription

#### Scenario: Duplicate revoke
- **WHEN** the matching revoke is repeated after that grant is already cleared
- **THEN** the request is handled idempotently without changing provider allowance again

### Requirement: Complimentary grants expire without a scheduler
The effective plan SHALL be the granted tier only while its expiration is strictly after the evaluation instant. At and after expiration, the tenant SHALL receive the underlying Free entitlement, paid models and content features SHALL be rejected, storage writes SHALL use the restored quota without deleting existing data, and the managed OpenRouter key SHALL converge to one Free allowance before further inference.

#### Scenario: Request immediately before expiration
- **WHEN** a plan-gated request evaluates at an instant before the grant expiration
- **THEN** the granted plan remains effective

#### Scenario: Request at expiration
- **WHEN** a plan-gated request evaluates exactly at the grant expiration
- **THEN** the effective plan is Free and no granted paid capability is accepted

#### Scenario: Usage exceeds restored storage quota
- **WHEN** a grant expires while stored bytes exceed the underlying Free quota
- **THEN** existing data is retained and new storage writes are rejected until usage or quota is brought within the effective limit

### Requirement: Complimentary grants receive bounded monthly provider allowance
The system SHALL reuse the tenant's one provider-managed OpenRouter child key and provider lifetime usage. A grant SHALL start with exactly one granted-plan monthly allowance, SHALL lazily renew one allowance at each stored monthly boundary without stacking skipped periods, and SHALL cap every boundary at the grant expiration. Provider synchronization SHALL follow the committed durable desired limit and SHALL fail closed when convergence cannot be verified.

#### Scenario: Grant with an existing child key
- **WHEN** a valid grant is applied to a tenant with an existing managed key
- **THEN** the durable absolute target becomes provider lifetime usage plus exactly one granted-plan allowance before the provider key is synchronized

#### Scenario: Grant without a child key
- **WHEN** a valid grant is applied before the tenant's first OpenRouter-backed request
- **THEN** no second or eager key is created and first use provisions the existing one-key design with the granted allowance and capped boundary

#### Scenario: Long grant crosses a monthly boundary
- **WHEN** the first entitlement read or inference occurs after an intermediate grant boundary but before expiration
- **THEN** exactly one current allowance is granted and the next boundary is advanced no later than expiration

#### Scenario: Provider failure after durable commit
- **WHEN** provider synchronization fails after a grant, revoke, renewal, or expiration transition commits
- **THEN** the durable desired target remains replayable and inference fails closed until a later read/use converges the provider

### Requirement: Verified Paddle activation supersedes a grant
A correctly signed and otherwise valid first Paddle activation SHALL retain its existing authority over real paid access. When it commits for a tenant with an active grant, the same tenant-row transaction SHALL clear complimentary plan and expiration state, SHALL keep the last grant ID for stale-revoke protection, and SHALL establish the Paddle plan, cadence, paid period, and provider target normally. Later cancellation, refund, chargeback, or revoke SHALL NOT revive the superseded grant.

#### Scenario: Activation wins a race with grant
- **WHEN** a verified Paddle activation and operator grant race for the same Free tenant
- **THEN** row locking produces either a rejected grant after activation or an activation that clears the earlier grant, and the final state is the real Paddle subscription

#### Scenario: Stale revoke follows activation
- **WHEN** a revoke for the superseded grant arrives after the Paddle activation committed
- **THEN** it cannot change the Paddle plan, provider identity, billing periods, allowance, or event cursors
