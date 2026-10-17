## ADDED Requirements

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
