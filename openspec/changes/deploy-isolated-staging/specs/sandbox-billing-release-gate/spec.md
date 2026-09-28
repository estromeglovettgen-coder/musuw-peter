## ADDED Requirements

### Requirement: Staging launches with one complete Paddle Sandbox unit
Staging SHALL require `sandbox`, one `test_` client token, one `pdl_sdbx_apikey_` server key, one destination-specific `pdl_ntfset_` webhook secret, and six distinct recurring `pri_` mappings for Plus, Pro, and Max monthly/yearly plans. Shape validation, official Sandbox catalog reads, and a signed delivery from the exact destination SHALL all pass before billing is called configured. Production SHALL continue rejecting Sandbox or mixed units.

#### Scenario: The Sandbox unit is complete
- **WHEN** staging preflight and the public configuration endpoint run
- **THEN** preflight accepts the unit, the endpoint reports only configured Sandbox public state, and neither server key, webhook secret, price ID, nor internal provider identifier is logged

#### Scenario: A unit is partial or mixed
- **WHEN** any credential has the wrong environment, a price is missing or duplicated, or signed-destination proof is absent
- **THEN** checkout and portal remain unavailable and staging launch or acceptance fails

### Requirement: Sandbox catalog and checkout settings are provider owned
Paddle Sandbox SHALL contain exactly three active Musuw paid products and six active recurring USD prices covering one-month and one-year billing cycles with location-based tax. The staging checkout domain SHALL be approved, the default payment link SHALL target staging `/pay`, and Paddle SHALL own country, currency conversion, tax, eligible payment methods, invoices, receipts, and the hosted customer portal. Retain settings SHALL be Sandbox-only.

#### Scenario: Provider configuration is audited
- **WHEN** official Sandbox API reads and the account dashboard are inspected
- **THEN** product/price count, plan periods, USD base currency, location tax, approved domain, default link, payment methods, portal, billing history, and Retain settings match the staging contract

### Requirement: The staging webhook destination is exact and public
Paddle Sandbox SHALL have one active Musuw staging URL destination for `POST /api/v1/billing/paddle/webhook` subscribed to exactly `subscription.created`, `subscription.activated`, `subscription.trialing`, `subscription.updated`, `subscription.past_due`, `subscription.paused`, `subscription.resumed`, `subscription.canceled`, `transaction.completed`, `adjustment.created`, and `adjustment.updated`. The app SHALL verify the raw signed body before parsing, durably enqueue accepted events before returning success, and return non-success for unverifiable or unaccepted deliveries so Paddle can retry.

#### Scenario: An official signed simulation arrives
- **WHEN** Paddle sends an event from the exact Sandbox destination through the public edge
- **THEN** Access does not intercept it, signature and tenant binding pass, the event is durably enqueued before a 2xx response, and the worker applies only the authorized transition

#### Scenario: An unsigned or tampered request arrives
- **WHEN** a caller changes the body, signature, price, quantity, recurrence, customer binding, or tenant binding
- **THEN** the request grants no entitlement or allowance and produces no secret-bearing response or log

### Requirement: First purchase grants entitlement only through verified webhooks
A fresh staging Admin SHALL be able to initiate one official automatic Sandbox transaction with one server-mapped item and tenant-bound custom data and complete Paddle Checkout using an official Sandbox success card. Checkout callbacks and transaction API responses MUST NOT grant a plan. A verified active subscription event SHALL update the existing tenant entitlement and membership; a verified completed recurring transaction SHALL establish the paid period and OpenRouter cycle allowance.

#### Scenario: A fresh purchase completes
- **WHEN** a fresh Free tenant buys Plus in official Sandbox Checkout with a documented success card
- **THEN** one subscription is created, signed webhook processing makes the tenant paid, membership and local entitlement agree, the paid period is stored, and the personal OpenRouter allowance matches the selected plan

#### Scenario: A Sandbox card is declined
- **WHEN** checkout uses an official Sandbox decline card
- **THEN** the tenant remains Free, no paid allowance is granted, and the failure stays provider-owned

### Requirement: Paid upgrade is provider authoritative and idempotent
An authenticated tenant Admin SHALL preview and request only a higher tier. The server SHALL prove ownership and exactly one known base item, preserve the billing period, apply Paddle's `prorated_immediately` and `prevent_change`, and never repeat an uncertain mutation blindly. Only the signed `subscription.updated` webhook SHALL change the local plan or OpenRouter limit.

#### Scenario: Plus upgrades to Pro or Max
- **WHEN** the Admin confirms an official Paddle preview and the Sandbox update succeeds
- **THEN** Paddle owns the proration, the webhook changes the local tier exactly once, and the upgraded storage and OpenRouter limits are visible

#### Scenario: Update response is uncertain or duplicated
- **WHEN** the client times out, retries the operation key, or opens concurrent tabs
- **THEN** the durable operation fence and official subscription read prevent a duplicate mutation and no response alone changes entitlement

### Requirement: Cancellation, period end, and recovery remain ordered
Scheduled cancellation SHALL preserve paid access through the confirmed paid period. A verified effective cancellation at or after that boundary SHALL downgrade the tenant to Free and synchronize the OpenRouter allowance. A valid resume or new bound active subscription SHALL restore paid state without accepting an older or different subscription over a current paid binding.

#### Scenario: Paid subscription is canceled at period end
- **WHEN** the customer cancels through the Sandbox portal and official cancellation events reach the confirmed boundary
- **THEN** paid access remains until the boundary, then local entitlement, membership presentation, and OpenRouter allowance downgrade to Free exactly once

#### Scenario: The customer recovers before or after cancellation
- **WHEN** Paddle resumes the bound subscription or a canceled Free tenant completes a new bound subscription
- **THEN** only a newer verified active state restores paid entitlement and allowance

### Requirement: Retry, duplicate, and out-of-order deliveries are safe
The existing Asynq handoff, event task ID, lifecycle/adjustment watermark, renewal watermark, paid-period boundary, and tenant transaction SHALL remain the only webhook reliability and ordering mechanism. No second queue, ledger, or reconciler SHALL be added.

#### Scenario: Paddle retries a failed delivery
- **WHEN** an official simulation receives non-2xx or its worker fails transiently and Paddle replays it
- **THEN** the same logical event is retried, eventually applies once, and exhausted work remains observable without acknowledging lost state

#### Scenario: A duplicate is delivered
- **WHEN** the same event ID or payload is replayed after success
- **THEN** entitlement, paid period, and allowance are unchanged after the first successful application

#### Scenario: An older event arrives last
- **WHEN** an older lifecycle, renewal, cancellation, or adjustment event arrives after a newer accepted state
- **THEN** separate ordering markers prevent rollback or suppression of an unrelated valid renewal

### Requirement: Portal and billing history are tenant scoped
An authenticated tenant Admin SHALL request a short-lived Paddle portal session whose customer is resolved only from the current tenant. The app MUST NOT accept a customer ID from the browser, cache the portal URL, or expose provider identifiers. The Sandbox portal SHALL show the test subscription, payment method controls, invoices/transactions, cancellation state, and billing history owned by Paddle.

#### Scenario: The paid Admin opens billing management
- **WHEN** the current tenant requests a portal session
- **THEN** the returned HTTPS URL is fresh, belongs to that tenant's Sandbox customer, displays its billing history, and contains no Live data

#### Scenario: Another user or tenant attempts access
- **WHEN** a non-Admin or mismatched tenant calls portal or upgrade operations
- **THEN** the server denies the request without disclosing customer, subscription, transaction, or portal details

### Requirement: Commissioning never performs a real financial action
All staging payment acceptance SHALL use Paddle Sandbox, official test cards, and no-charge simulations. Operators MUST NOT enter a real card or create any Live charge, refund, chargeback, transfer, payout, withdrawal, or production Retain mutation.

#### Scenario: Billing acceptance is complete
- **WHEN** all staging checkout, lifecycle, retry, ordering, portal, and allowance scenarios are recorded green
- **THEN** provider metadata proves every entity and delivery is Sandbox and production Live financial state is unchanged

### Requirement: Storage accounting work is gated by staging evidence
No implementation or deployment of the original-file storage accounting correction SHALL begin until every requirement in this change has fresh passing evidence and the same staging-enablement digest pair has been safely promoted to production.

#### Scenario: A staging acceptance item is missing
- **WHEN** any DNS/TLS, isolation, Sandbox configuration, purchase, upgrade, cancellation, recovery, webhook, entitlement, allowance, portal, or history check is incomplete
- **THEN** the storage-accounting phase remains blocked and no related code is changed

### Requirement: Production promotion requires explicit human Sandbox acceptance
Automatic health, noindex, digest, and static verification SHALL be recorded only as successful staging deployment. Production promotion SHALL additionally require explicit acceptance appropriate to the verified change scope and an account-owner approval enforced by a protected GitHub Environment whose required-reviewer rule is checked at runtime. Full Sandbox acceptance remains required for changes outside the restricted UI scope.

#### Scenario: Smoke checks pass but billing acceptance is incomplete
- **WHEN** a staging release is healthy but purchase, upgrade, cancellation, recovery, webhook reliability, entitlement, allowance, portal, or history evidence is missing
- **THEN** the default unconfirmed promotion input and required reviewer gate prevent the production job from starting

#### Scenario: Full acceptance and owner review pass
- **WHEN** the exact staging run is fully accepted, the operator selects `full-sandbox-e2e-green`, the current staging SHA/digests still match, and the owner approves `server-production`
- **THEN** production may consume that exact digest pair without rebuilding

#### Scenario: UI-only regression acceptance
- **WHEN** the operator selects `ui-regression-green`, supplies the current production SHA verified by the production reviewer, and completes UI regression on the exact staging revision
- **THEN** a fail-closed source allowlist must reject backend, authentication-flow, payment, API, dependency, build-runtime, symlink, and submodule changes before this acceptance can be used
- **AND** presentation-only login modules and accompanying reviewed test, documentation, and delivery files outside the general UI paths require exact reviewed Git blob content; unreviewed changes or deletion at those same paths are rejected
- **AND** main ancestry, successful CI, exact staging SHA/digests, required production review, and rollback remain mandatory
- **AND** release evidence records UI acceptance separately from full Sandbox acceptance
