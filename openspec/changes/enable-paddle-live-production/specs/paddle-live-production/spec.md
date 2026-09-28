## ADDED Requirements

### Requirement: Production accepts only one complete Paddle Live unit
The production contract SHALL require Live SDK mode, a Live client token, a Live API key, the destination-specific signing secret, and six distinct configured Live recurring price IDs. It MUST reject every Sandbox, incomplete, malformed, duplicate-price, or mixed-environment unit before application startup or release health is claimed.

#### Scenario: Complete Live unit starts
- **WHEN** all public and protected Paddle inputs have the correct Live classes and all six price identifiers are distinct
- **THEN** production preflight and application configuration accept the unit atomically

#### Scenario: Mixed unit fails closed
- **WHEN** any required input is missing, Sandbox-shaped, malformed, or paired with a duplicated price identifier
- **THEN** preflight fails before the production application is recreated and checkout remains unavailable

### Requirement: Existing Live catalog and checkout resources remain authoritative
The release SHALL reuse the existing active three-product, six-price catalog, approved app domain, selected production client token, and one production notification destination. It MUST verify product meaning, recurring period, active state, tax category, base amount, configured local override, endpoint, and event selection before changing runtime mappings, and MUST NOT create a duplicate resource when a matching resource exists.

#### Scenario: Provider resources match the product contract
- **WHEN** official provider reads resolve exactly the expected Plus, Pro, and Max monthly/yearly products and prices plus the approved app domain and destination
- **THEN** their existing identifiers are selected for the production unit without creating replacement products, prices, tokens, domains, or destinations

#### Scenario: Provider meaning differs
- **WHEN** a name, amount, currency, billing cycle, tax category, override, status, endpoint, or required event differs from the product contract
- **THEN** the release remains blocked until the existing provider object is safely corrected or an explicit product decision is recorded

### Requirement: Live checkout is verified without a financial transaction
The public payment-link page SHALL load Paddle.js on the approved app origin, an authenticated tenant Admin (including Owner) SHALL be able to request one server-mapped Live transaction and open the official Live payment form by its `transactionId`, and acceptance SHALL stop before any payment method is entered or a purchase is confirmed. A redirect, query parameter, browser callback, or checkout return MUST NOT grant entitlement. Paddle SHALL remain authoritative for transaction lifecycle, payment data, tax, currency, eligible payment methods, receipts, and subscription creation; Musuw's single durable active-operation row is only a duplicate-initiation fence, not a local payment state machine.

#### Scenario: Checkout reaches payment boundary
- **WHEN** a reviewer chooses an available paid plan through the production app
- **THEN** the server creates or reuses exactly one automatic Paddle transaction with one mapped Live price and tenant-bound signed custom data, stores only its provider ID and immutable operation coordinates in the existing active-operation fence, Paddle.js displays the official Checkout by `transactionId`, and the reviewer closes checkout before entering payment details

#### Scenario: Ordinary member cannot initiate billing
- **WHEN** an authenticated workspace member without Owner/Admin role opens `/plans` or `/checkout`
- **THEN** plan prices remain readable (including Paddle's read-only localized `PricePreview()`), billing and portal actions are hidden or disabled with a clear role message, and no checkout-intent, subscription-upgrade preview/update, portal-session, or other billing mutation request is started

#### Scenario: Browser-only completion claim
- **WHEN** a browser supplies a checkout return or completion callback without a valid signed provider lifecycle event
- **THEN** the tenant's plan and allowance remain unchanged

### Requirement: Signed provider lifecycle events keep the existing mirror consistent
The production destination SHALL deliver the exact subscription lifecycle and successful recurring-completion events consumed by Musuw. The receiver MUST verify the raw request signature, bind customer/subscription/tenant/price, enqueue a canonical secret-free task before acknowledging, retry transient failures, deduplicate by event identity, reject stale ordering, and update only the existing tenant entitlement mirror.

#### Scenario: Valid lifecycle delivery
- **WHEN** Paddle sends a correctly signed current-subscription event with one configured price and valid tenant binding
- **THEN** the existing queue and tenant-row authority apply the corresponding plan/status/customer/subscription state exactly once

#### Scenario: Duplicate or reordered delivery
- **WHEN** Paddle retries the same event or an older event arrives after a newer applied event
- **THEN** the endpoint remains safely retryable and the durable entitlement state is not applied twice or rolled backward

#### Scenario: Invalid delivery
- **WHEN** a signature, tenant binding, current subscription, item count, or price mapping is invalid
- **THEN** the event cannot grant or expand access and no secret or raw payment payload is logged

### Requirement: Full refunds and disputes fail closed without a billing ledger
The destination SHALL include `adjustment.created` and `adjustment.updated`. A signed, full, final approved refund or chargeback for the tenant's current customer/subscription SHALL revoke paid entitlement through the existing plan service. Pending or rejected refunds, partial adjustments, credits, warnings, and unrelated adjustments MUST NOT alter entitlement. A reversal MUST restore only the provider's current subscription state after an official read confirms the same stored customer/subscription, exactly one configured price, and a recognized status.

#### Scenario: Approved full refund or chargeback
- **WHEN** a current-subscription adjustment is full, final, approved, and has action `refund` or `chargeback`
- **THEN** paid access is revoked idempotently without canceling the provider subscription or creating another financial operation

#### Scenario: Non-final or partial adjustment
- **WHEN** a refund is pending or rejected, an adjustment is partial, or its action is a credit or chargeback warning
- **THEN** the existing entitlement remains unchanged

#### Scenario: Chargeback reversal
- **WHEN** a signed reversal references a previously bound subscription
- **THEN** Musuw reads the current subscription from Paddle and applies only that bound provider state through the existing event-ordering guard

### Requirement: Public configuration and secrets use separate delivery paths
The Live client token and price identifiers MAY be browser-visible, but the API key and webhook secret MUST remain only in root-owned `0600` file-backed runtime secrets and container read-only mounts. Source, Git history introduced by this change, CI output, server logs, screenshots, browser responses, and acceptance records MUST NOT expose a server credential or sensitive payment data.

#### Scenario: Production inputs are installed
- **WHEN** the Live unit is prepared for deployment
- **THEN** public values use the existing production public-input contract and server secrets are atomically installed through the existing protected file path without being printed

#### Scenario: Secret scan and public probe
- **WHEN** release verification scans tracked changes and probes public configuration/log surfaces
- **THEN** no API key, signing secret, private key, payment method, or payout detail is present while the public token and six price IDs remain intentionally available

### Requirement: Paddle Retain remains the recovery authority
The app SHALL initialize the same official Live Paddle.js client on a stable public, non-checkout page so Paddle-hosted recovery links can load. Authenticated app pages SHALL pass only the current tenant's provider customer ID derived from the signed entitlement mirror as `pwCustomer`, and logout or tenant changes SHALL clear or replace that value through the existing Paddle singleton. Musuw MUST NOT add a parallel dunning scheduler, recovery state machine, or payment-method recovery form.

#### Scenario: Public recovery entry is checked
- **WHEN** Paddle verifies the deployed public login page during Retain setup
- **THEN** the page initializes the matching Live Paddle.js client without requiring authentication, redirecting, opening Checkout, or exposing a server credential

#### Scenario: Authenticated customer is identified
- **WHEN** an authenticated tenant has a valid bound Paddle customer
- **THEN** the existing Paddle.js singleton receives that provider customer ID from the no-store entitlement response and Paddle remains responsible for recovery UI and retry behavior

#### Scenario: Browser identity is untrusted
- **WHEN** a browser supplies an email, tenant identifier, customer claim, or stale prior-session state
- **THEN** that input cannot select `pwCustomer`, grant entitlement, or create a local dunning decision

### Requirement: Operations and release evidence use Live authority
The production operations view SHALL query the official Live API with the existing production Keychain credential and label the environment accurately. Completion SHALL require green focused tests, static preflight, CI, immutable exact-SHA deployment, health checks, public Live config, checkout-to-payment-form evidence, provider-supported no-charge notification evidence, and a consolidated adversarial review.

#### Scenario: Production operations read
- **WHEN** an operator opens production Paddle provider status
- **THEN** the console reads Live counts and metadata without exposing credential values or enabling payment/refund/subscription writes

#### Scenario: End-to-end release succeeds
- **WHEN** the reviewed SHA passes all local and CI contracts and the complete Live unit is installed
- **THEN** the running revision, public pages, Live pricing, no-charge checkout, signed webhook handling, mirror state, and secret boundaries are freshly evidenced

### Requirement: Payout details and real money movement remain outside the cutover
No implementation or verification step SHALL enter, change, submit, or infer a payout bank/Payoneer account, payment card, or other real payment method, and no step SHALL create a real charge, refund, transfer, or payout. Seller/payment acceptance status and payout-receipt readiness MUST be reported separately.

#### Scenario: Payout onboarding remains incomplete
- **WHEN** Paddle shows a payout-account step that requires the owner's private banking or Payoneer information
- **THEN** the step is recorded as owner-only and left untouched while the release continues only if Paddle independently permits Live payment acceptance

#### Scenario: Verification reaches a financial action
- **WHEN** checkout, Dashboard, or an API flow reaches an action that would move money or submit a real payment method
- **THEN** verification stops before that action and uses provider simulation or read-only evidence instead

### Requirement: Rollback preserves environment consistency
Rollback SHALL restore a previously verified complete Paddle runtime unit and deploy its matching immutable application SHA. It MUST NOT change only the SDK environment, public token, one credential, destination secret, or a subset of price mappings.

#### Scenario: Live release rollback
- **WHEN** a post-deploy blocker requires rollback
- **THEN** the operator restores the complete prior protected/public runtime inputs and prior exact SHA, then reruns preflight and health checks before calling rollback complete
