## ADDED Requirements

### Requirement: Optional question limits supplement usage allowances
The Fire administrator SHALL be able to set a nonnegative question limit on a plan or individual membership. Zero SHALL mean no question cap. Existing token limits and exact provider metering SHALL remain in effect. Plan edits SHALL NOT retroactively change issued memberships. Users SHALL continue to see remaining percentage without Token amounts or detailed call records; when capped, the lower remaining fraction SHALL determine the displayed allowance.

#### Scenario: Ten-question plan
- **WHEN** an administrator creates a plan with ten questions and provisions an account from it
- **THEN** the account can receive ten answered turns within its other package limits, irrespective of internal tool/model call count

#### Scenario: Concurrent final question
- **WHEN** two requests compete for one remaining question
- **THEN** only one request reserves the slot and starts generation; a failed unanswered request releases it

#### Scenario: Partial delivery and process recovery
- **WHEN** a user stops after answer text has been produced
- **THEN** the delivered partial answer consumes one question; stopping without answer text releases the slot
- **WHEN** the process is interrupted
- **THEN** recovery uses persisted assistant delivery evidence to settle or release the reservation once, without permanently locking allowance

#### Scenario: Independent user adjustment
- **WHEN** an administrator adds questions or changes the cap on one user
- **THEN** the operation is idempotent and auditable, preserves other users and existing usage, rejects a cap below already used/reserved questions, and allows zero to remove the cap

#### Scenario: Renewal and legacy compatibility
- **WHEN** an active capped package renews
- **THEN** valid additional questions accumulate and in-flight reservations remain valid
- **WHEN** an expired package renews
- **THEN** a new period starts after pending reservations have settled, without restoring expired balances
- **WHEN** a legacy token-only package is used
- **THEN** its accounting and unrestricted question-count behavior remain unchanged

### Requirement: User token membership is authoritative
The system SHALL expose the authenticated user's plan name, validity, used/reserved/remaining tokens and status, count input plus output tokens across user-triggered model features, and reject further model calls after expiry, exhaustion or suspension without blocking reading existing content. Administrator maintenance SHALL NOT debit ordinary users.

#### Scenario: Model usage across a multi-step answer
- **WHEN** a user runs a multi-call answer including cached input and thinking
- **THEN** each provider call is settled once, input/output totals accumulate without double-counting subsets, and the homepage reflects the persisted ledger

#### Scenario: Exhausted or expired allowance
- **WHEN** a managed user has no current allowance
- **THEN** no new provider call is made, a recoverable quota message is returned, and login/history still work

### Requirement: Adjustments are idempotent and auditable
The system SHALL support configurable duration/token plans, grants, renewals, topups, extensions and suspension through SystemAdmin-only operations. Identical operation retries SHALL apply once and conflicting retries SHALL fail. Expired balance SHALL not revive; topups SHALL not extend time; active renewals SHALL preserve unexpired balance.

#### Scenario: Concurrent topup retries
- **WHEN** the same admin operation is submitted concurrently
- **THEN** one mutation and one audit record exist with the same resulting balance

#### Scenario: Plan template editing
- **WHEN** an administrator edits or archives a template
- **THEN** already granted memberships retain their issued duration and token snapshot
