## ADDED Requirements

### Requirement: Entitlement data is prefetched without masking usable data
The authenticated Lite shell SHALL start one deduplicated entitlement refresh as soon as the current user and tenant scope are known, and SHALL retain the last successful scope-matched snapshot while a newer request is in flight.

#### Scenario: First authenticated shell load
- **WHEN** a user and tenant become available and no entitlement snapshot exists
- **THEN** the shared entitlement store starts one background request
- **AND** duplicate consumers join the same in-flight request

#### Scenario: Refresh with cached data
- **WHEN** an account-menu open or settings navigation refreshes an existing scope-matched snapshot
- **THEN** the previous values remain visible until the request succeeds
- **AND** no full-row or full-page “loading” replacement is shown

#### Scenario: A metered action completes
- **WHEN** a model response completes, a file is persisted, or a payment transition is confirmed
- **THEN** the shared entitlement store immediately revalidates in the background
- **AND** a later account-menu open usually starts with the refreshed snapshot before performing its own forced calibration
- **AND** the client never invents or optimistically subtracts quota values

#### Scenario: Initial request has no data
- **WHEN** the first entitlement request is in flight and no prior snapshot exists
- **THEN** a compact loading state may be shown in the usage surface

#### Scenario: Identity scope changes
- **WHEN** the authenticated user or tenant changes
- **THEN** a snapshot from the prior scope is never rendered for the new scope

### Requirement: Refresh failure is honest and non-destructive
The shared entitlement store SHALL preserve an existing scope-matched successful snapshot when a background refresh fails and SHALL expose the unavailable state only when no usable snapshot exists.

#### Scenario: Background refresh fails
- **WHEN** a forced refresh fails after an entitlement snapshot was already loaded
- **THEN** the existing snapshot remains visible
- **AND** the next freshness check remains eligible to retry

#### Scenario: Initial request fails
- **WHEN** entitlement loading fails before any successful snapshot
- **THEN** the usage surface displays its existing unavailable state without inventing plan or quota values
