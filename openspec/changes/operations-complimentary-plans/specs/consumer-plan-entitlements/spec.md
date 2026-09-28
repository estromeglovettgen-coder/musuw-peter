## ADDED Requirements

### Requirement: Effective entitlement includes an isolated complimentary source
The time-aware consumer entitlement resolver SHALL evaluate the verified underlying Paddle entitlement first, then an unexpired valid complimentary plan, then Free. The generic entitlement response SHALL identify an active complimentary source and expiration without exposing the grant ID or changing persisted Paddle status. Every server-side plan consumer SHALL use the same time-aware result.

#### Scenario: Active complimentary tenant reads entitlement
- **WHEN** a Paddle-unbound Free tenant reads entitlement before its complimentary expiration
- **THEN** the response contains the granted effective plan, `plan_status=complimentary`, the exact expiration, and the matching existing limits

#### Scenario: Expired complimentary tenant reads entitlement
- **WHEN** the same tenant reads entitlement at or after expiration
- **THEN** the response contains Free as the effective plan and no paid capability is inferred from stale grant metadata

#### Scenario: Underlying paid entitlement exists
- **WHEN** a verified Paddle paid entitlement and complimentary metadata are both present due to a race or partial recovery
- **THEN** the verified Paddle entitlement wins and the complimentary metadata cannot downgrade, extend, or replace it

### Requirement: Complimentary storage enforcement preserves operator quota and data
While a complimentary plan is active, storage writes SHALL use at least that plan's storage allowance without lowering a larger existing operator-set tenant quota. Expiration or revoke SHALL restore the underlying quota, SHALL preserve stored objects and usage accounting, and SHALL not persist the granted plan allowance into Paddle-owned or generic tenant quota state.

#### Scenario: Free tenant receives Max
- **WHEN** a normal Free tenant with the default quota receives an active Max grant
- **THEN** storage writes are permitted up to the Max plan allowance

#### Scenario: Existing custom quota is larger
- **WHEN** a tenant's operator-set quota already exceeds the granted plan allowance
- **THEN** the grant does not lower that quota

### Requirement: Complimentary users can enter normal Paddle checkout
An active complimentary plan SHALL NOT be treated as an existing Paddle subscription. An otherwise eligible tenant Admin SHALL be able to start the existing server-owned hosted checkout, and no browser callback or checkout response SHALL supersede the grant until the verified signed activation commits.

#### Scenario: Complimentary user starts checkout
- **WHEN** an eligible tenant Admin with an active complimentary grant selects a server-owned plan and billing period
- **THEN** the existing Free-to-paid checkout flow is available without exposing or fabricating subscription identity

#### Scenario: Checkout is abandoned
- **WHEN** the checkout does not produce a verified activation
- **THEN** the complimentary grant remains bounded by its original expiration and receives no additional allowance
