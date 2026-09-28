## ADDED Requirements

### Requirement: Four tenant-scoped consumer plans
The system SHALL assign each consumer tenant exactly one active plan and SHALL use the following limits: Free = 1 GiB storage and USD 0.40 monthly OpenRouter credit; Plus = 10 GiB and USD 1.25; Pro = 30 GiB and USD 2.50; Max = 100 GiB and USD 5.00. New and existing tenants without an explicit paid entitlement SHALL be Free.

#### Scenario: New consumer signs in
- **WHEN** a Google user receives a new home tenant
- **THEN** the tenant has the Free plan, 1 GiB storage, and USD 0.40 of OpenRouter credit for the personal month anchored to that tenant's registration time

#### Scenario: Paid plan is synchronized
- **WHEN** a verified billing event activates Plus, Pro, or Max for a tenant
- **THEN** the tenant's effective storage and monthly OpenRouter credit limits match that plan

### Requirement: Free content limits are enforced server-side
The system SHALL limit Free tenants to one knowledge base, ten documents in that knowledge base, and no video upload. Paid tenants SHALL not receive those three Free-only limits, while all tenants remain subject to storage and file-type support.

#### Scenario: Free tenant reaches its knowledge-base limit
- **WHEN** a Free tenant that already owns one knowledge base requests another
- **THEN** the server rejects the request with an actionable plan-limit response and creates nothing

#### Scenario: Free tenant reaches its document limit
- **WHEN** a Free tenant whose knowledge base already contains ten documents requests another upload
- **THEN** the server rejects the upload before storing or parsing it

#### Scenario: Free tenant attempts video upload
- **WHEN** a Free tenant submits a supported video type now or in a later release
- **THEN** the server rejects it before storage or parsing

### Requirement: Model access follows the active plan
The system SHALL expose and accept only platform-built-in OpenRouter models from the server-owned catalog. Free tenants SHALL receive only the least-cost configured model for each required capability; paid tenants SHALL receive the larger plan-approved platform catalog. Consumer tenants SHALL NOT create, edit, test, credential, or invoke arbitrary models, including BYOK and manually inserted models. Server-side model resolution SHALL reject a disallowed model ID even when the caller bypasses the UI. Built-in DeepSeek chat models SHALL use OpenRouter rather than the DeepSeek direct API.

#### Scenario: Free tenant lists chat models
- **WHEN** a Free tenant requests available chat models
- **THEN** only the configured least-cost chat model is returned

#### Scenario: Free tenant submits a paid model ID
- **WHEN** a Free tenant directly requests a model that is not its allowed model for that capability
- **THEN** the server rejects the request without calling the provider

#### Scenario: Paid tenant selects a model
- **WHEN** an active paid tenant selects any model in its server-provided platform catalog
- **THEN** the existing model path is used without a plan-model rejection

#### Scenario: Consumer attempts custom model configuration
- **WHEN** a consumer calls a model mutation, provider, debug, or credential endpoint or submits a non-platform model ID
- **THEN** the endpoint is unavailable or the model is rejected without calling the provider

#### Scenario: Legacy inline VLM override
- **WHEN** a consumer upload or stored process override contains an inline VLM base URL, model name, or API key instead of a platform model ID
- **THEN** processing is rejected before any provider request and no user-supplied credential is used

### Requirement: OpenRouter usage is attributed and capped
Each tenant SHALL use one OpenRouter-managed child key with no provider calendar reset. Free SHALL use a monthly period anchored to tenant registration. A monthly paid plan SHALL receive its next allowance only after a successfully paid Paddle recurring period. An annual paid plan SHALL receive one allowance per monthly subperiod of the already-paid annual term and SHALL NOT use or refresh allowance after Paddle's last confirmed entitled-period end until a successful recurring transaction advances it. Renewal-time `subscription.updated` and `past_due` lifecycle events SHALL NOT advance the paid-term boundary from their unpaid `current_billing_period`; initial subscription creation/activation MAY seed it. The key SHALL be lazily created through OpenRouter's official SDK, encrypted in the existing tenant credential field, never returned to a consumer, and used for chat, embedding, rerank, vision, and speech calls. Every supported OpenRouter JSON request SHALL also include a stable, non-PII internal user identifier. Musuw SHALL NOT fall back to a shared inference key or a user-supplied key, SHALL NOT keep a second usage counter, and SHALL use OpenRouter's lifetime usage, absolute limit, and remaining value as the usage and enforcement authority.

#### Scenario: First provider request
- **WHEN** an eligible tenant without a child key starts its first OpenRouter-backed inference and management credentials are configured
- **THEN** the server creates one no-reset key, persists the encrypted winner and first personal credit-period end, deletes any raced loser, and performs inference with that tenant key

#### Scenario: Provisioning cannot be secured
- **WHEN** the management key or valid encryption key is absent
- **THEN** inference fails closed with an observable reason and no shared or plaintext key is used

#### Scenario: Monthly limit is exhausted
- **WHEN** OpenRouter returns HTTP 402 or an equivalent terminal SSE credit error for the tenant key
- **THEN** the request terminates without generic retries and exposes the product's monthly-credit error state

#### Scenario: Plan changes for a provisioned tenant
- **WHEN** a verified billing event changes the effective plan
- **THEN** initial paid activation grants one full paid-period allowance, a same-period upgrade preserves used credit and adds only the plan difference, cancellation starts the effective Free allowance, and provider failure leaves or restores the previous durable limit

#### Scenario: Free personal month elapses
- **WHEN** a Free tenant first reads entitlement or invokes a model after its registration-anchored monthly boundary
- **THEN** the existing key limit becomes lifetime usage plus exactly one Free allowance and the next registration anniversary is stored

#### Scenario: Several inactive periods elapsed
- **WHEN** a Free or annual-paid tenant returns after more than one credit boundary
- **THEN** only one current allowance is granted and the stored boundary advances to the next future boundary without stacking missed allowances

#### Scenario: Annual paid term expires during payment recovery
- **WHEN** an annual subscription is `past_due` or otherwise lacks a successful renewal and Paddle's verified current billing-period end has elapsed
- **THEN** model access is blocked, no unused credit carries beyond the paid term, and no monthly allowance is added until a matching successful recurring transaction advances the paid-term end

#### Scenario: Paused annual subscription resumes inside the paid term
- **WHEN** Paddle pauses an annual subscription and later resumes its existing billing period
- **THEN** access is disabled while paused, the verified paid-term and credit boundaries plus provider limit are retained, and resumed access restores only the prior remaining allowance until that unchanged boundary

#### Scenario: Paid cadence is unknown
- **WHEN** a paid tenant lacks a verified monthly or annual billing cadence
- **THEN** model access fails closed even if an older credit boundary or child key is present

#### Scenario: Monthly renewal is not yet confirmed
- **WHEN** a monthly-paid credit boundary expires before a matching successful Paddle recurring transaction is verified
- **THEN** model access is blocked and no old unused credit carries into the unpaid period

#### Scenario: Monthly paid subscription renews successfully
- **WHEN** a signed Paddle `transaction.completed` has origin `subscription_recurring`, a newer monthly billing period, and the same tenant-bound customer, subscription, and server-owned price
- **THEN** the existing child key's no-reset absolute limit becomes its lifetime usage plus exactly one current-plan allowance and the credit-period end is stored once

#### Scenario: Annual paid subscription renews successfully
- **WHEN** the matching signed recurring completion carries a newer annual billing-period end
- **THEN** the paid-term boundary advances once and the next model access lazily grants one allowance only when its personal monthly subperiod is due

#### Scenario: Paid renewal is duplicated or unpaid
- **WHEN** the same billing period is delivered again, or a transaction is non-recurring, incomplete, mismatched, or unsigned
- **THEN** no additional allowance is granted

### Requirement: Ingestion reuses the native failure and recovery lifecycle
The system SHALL NOT estimate OpenRouter cost from file bytes. When a provider-managed limit is exhausted during ingestion, the current task SHALL stop without retry, the knowledge row SHALL use WeKnora's existing failed status and trace finalization, and the source object SHALL remain available for the existing reparse flow after credits are restored. Failure-state persistence SHALL retain the typed provider cause in the returned Go error chain so the worker classifies it without inspecting human-readable text.

#### Scenario: Credits expire during parsing
- **WHEN** an OpenRouter-backed ingestion stage receives a typed credit-exhaustion error
- **THEN** the stage is marked failed once, the first worker delivery returns `SkipRetry`, no automatic provider retry occurs, and the item can be reparsed through WeKnora's existing workflow after upgrade or monthly reset

### Requirement: Users can inspect their effective entitlement
The authenticated product SHALL show the current plan, storage used and limit, credit used and limit, the exact current allowance boundary when available, and the principal Free-only restrictions in Usage & billing settings. A separate `/plans` page SHALL show the four plans as equal, concise comparison cards with actions determined by the durable current plan; plan cards SHALL NOT be duplicated inside settings.

#### Scenario: User opens Usage & billing settings
- **WHEN** an authenticated user opens Usage & billing settings
- **THEN** the values displayed come from the server's effective tenant entitlement rather than browser state

#### Scenario: User opens the plan comparison
- **WHEN** an authenticated user follows an upgrade or view-plans action from the account menu or Usage & billing settings
- **THEN** the product opens the standalone `/plans` comparison rather than rendering plan cards inside settings

#### Scenario: Localized plan prices are shown
- **WHEN** Paddle is configured and a plan price is available
- **THEN** the client calls Paddle.js `PricePreview()` with the same server-mapped price ID used by checkout and renders Paddle's formatted final line-item total without reformatting it, inferring country from UI language, calculating tax locally, or adding a separate tax line on the plan comparison

### Requirement: Optional Paddle checkout, self-service, and events are fail-closed
When Paddle environment values are fully configured, a tenant Admin (including Owner) on a Free tenant SHALL be able to open Paddle's hosted checkout only for the six server-owned Plus, Pro, and Max monthly/yearly price mappings. A tenant Admin on an active paid tenant whose existing provider identity resolves SHALL be able to preview and apply only a strictly higher server-owned tier on that subscription; the server SHALL derive the hidden subscription/customer identity and existing billing period, use Paddle's official immediate-proration preview/update with payment failure preventing the change, and replace the single subscription item with the mapped target price. Paid tenants SHALL NOT receive a parallel hosted checkout. The system SHALL bind each offered or updated price to that tenant, accept subscription lifecycle events for plan state and only successful recurring transaction events for allowance refresh, all with a valid Paddle signature and matching binding, and apply them idempotently. A tenant Admin with a verified Paddle customer identity SHALL be able to open Paddle's hosted customer portal using a fresh server-created session. A browser callback, subscription-update response, or transaction event SHALL NOT grant a plan; only a correctly signed active subscription creation or activation with a confirmed current period can initialize paid access. When Paddle is not fully configured, checkout and subscription changes SHALL be displayed as unavailable and no client-supplied plan claim SHALL grant an entitlement.

#### Scenario: Free tenant Admin starts hosted checkout
- **WHEN** an authenticated Free tenant Admin (including Owner) chooses an allowed plan and billing period
- **THEN** the server creates or reuses one official automatic Paddle transaction containing exactly one server-mapped price of quantity one and tenant-bound custom data, and the dedicated `/checkout` route mounts Paddle's official one-page inline Checkout by `transactionId` while Paddle remains authoritative for country, currency, tax, payment data, and eligible payment methods

#### Scenario: Ordinary member cannot initiate billing
- **WHEN** an authenticated workspace member without Owner/Admin role opens `/plans` or `/checkout`
- **THEN** plan prices remain readable (including Paddle's read-only localized `PricePreview()`), billing and portal actions are hidden or disabled with a clear role message, and no checkout-intent, subscription-upgrade preview/update, portal-session, or other billing mutation request is started

#### Scenario: Valid activation event
- **WHEN** a correctly signed active Paddle `subscription.created` or `subscription.activated` event contains a known price, tenant identifier, matching checkout binding, and confirmed current-period end
- **THEN** the mapped paid plan is applied once

#### Scenario: Current paid subscription owns lifecycle events
- **WHEN** a tenant has a durable paid plan with an active or paused current subscription and a correctly signed lifecycle event names a different subscription
- **THEN** the event does not change the tenant's plan, provider identity, cadence, paid term, or allowance

#### Scenario: Free or canceled tenant replaces a stale subscription identifier
- **WHEN** a tenant's durable plan is Free or its status is canceled, and a correctly signed active `subscription.created` or `subscription.activated` event for a different subscription contains a known paid price, matching checkout binding, and a confirmed period after the event time
- **THEN** the new paid subscription replaces the stale identifier; other lifecycle events without a confirmed period do not replace it

#### Scenario: Initial paid period is unconfirmed
- **WHEN** a paid lifecycle event has no confirmed current-period end and the tenant has no prior confirmed paid credit period (a Free registration-anniversary boundary does not count)
- **THEN** the event does not initialize or change the paid plan, provider identity, cadence, or allowance

#### Scenario: Invalid or unknown event
- **WHEN** the signature or binding is invalid, the price is unknown, the tenant identifier is absent, or the event is neither a subscription lifecycle event nor a successful recurring completion
- **THEN** no entitlement changes

#### Scenario: Duplicate delivery
- **WHEN** Paddle repeats an already processed signed subscription event
- **THEN** the endpoint acknowledges the durable handoff without applying the plan a second time

#### Scenario: Paid tenant opens Usage & billing settings
- **WHEN** a tenant already has a paid plan whose provider identity resolves or whose paid period is confirmed
- **THEN** current entitlement and the hosted billing-management action are displayed without a second-subscription checkout

#### Scenario: Paid tenant previews a higher tier
- **WHEN** an authenticated active Plus tenant asks to preview Pro
- **THEN** the server proves ownership of the hidden current Paddle subscription, preserves its current monthly or yearly period, and returns Paddle's immediate prorated amount for the server-mapped Pro price without changing the subscription

#### Scenario: Paid tenant confirms a higher tier
- **WHEN** that tenant confirms the previewed upgrade and Paddle accepts payment
- **THEN** the existing subscription contains exactly the mapped target item and target binding, while the plan and existing OpenRouter child-key limit change only after the signed `subscription.updated` webhook is processed

#### Scenario: Paid tenant submits an unsafe plan change
- **WHEN** the target is equal, lower, unknown, the subscription/customer ownership differs, or the current Paddle subscription is not the one active server-owned item expected for the durable plan
- **THEN** Paddle is not updated and the durable plan and OpenRouter child-key limit remain unchanged

#### Scenario: Customer manages billing
- **WHEN** an authenticated tenant with a Paddle customer record clicks manage billing
- **THEN** the server resolves the customer from that tenant, creates a fresh Paddle portal session through the official SDK, and returns only its HTTPS overview URL

#### Scenario: Authenticated Paddle customer handoff remains non-authoritative
- **WHEN** the authenticated tenant has a valid Paddle customer ID derived from signed provider state and the complete Live unit is configured
- **THEN** the authenticated billing response supplies that provider customer ID only as the Paddle.js `pwCustomer` value, `Paddle.Initialize()` or `Paddle.Update()` receives it, anonymous request input cannot supply it, Paddle owns Retain recovery behavior, and the value grants no entitlement or provider mutation authority

#### Scenario: Portal ownership cannot be proven
- **WHEN** a request is anonymous or the authenticated tenant has no Paddle customer record
- **THEN** no portal session is created and no Paddle customer or subscription identifier is exposed

#### Scenario: Paddle is unconfigured
- **WHEN** required Paddle environment values are absent
- **THEN** the product reports billing as unavailable while all effective entitlement enforcement remains active

#### Scenario: Fixed production runtime is only partially configured
- **WHEN** the Musuw production overlay is missing a Paddle or OpenRouter server secret, lacks one of six distinct recurring price mappings, selects Sandbox, mixes Live with any Sandbox-shaped token/key, supplies an invalid destination-secret shape, or attempts to place a server secret in the generated environment
- **THEN** the production preflight rejects the release before Compose starts while generic deployments retain the optional unconfigured-billing behavior

#### Scenario: Selected Paddle environment is proven end to end
- **WHEN** operators prepare to enable billing for the fixed production runtime
- **THEN** all six recurring prices resolve through the selected Paddle environment and the exact notification destination delivers a correctly signed event before billing is declared operational; local prefix checks alone SHALL NOT claim that price IDs or a destination secret belong to that environment

#### Scenario: Current launch stage requires Live
- **WHEN** the fixed production runtime is prepared or rolled back
- **THEN** the checked production example, preflight, app entrypoint, public token, API key, six prices, and exact destination require one matching Live unit; changing only one component or supplying Sandbox SHALL fail closed

#### Scenario: Paid tenant never receives a parallel checkout
- **WHEN** a tenant already has a paid plan
- **THEN** the normal portal and higher-tier upgrade flow applies and neither the current plan nor any parallel second-subscription checkout is offered

### Requirement: Verified Paddle webhooks are durable and idempotent
The system SHALL perform raw-body signature, tenant, binding, price, and event-shape validation synchronously, then enqueue the canonical verified event as durable, retryable background work before acknowledging Paddle. The acknowledgement SHALL complete within Paddle's five-second callback contract and SHALL be successful only after enqueue acceptance (including an idempotent duplicate task ID). The worker SHALL use tenant `paddle_last_event_id`/`paddle_last_event_at` for lifecycle and adjustment ordering, `paddle_last_renewal_at` plus a strictly advancing period end for recurring-payment ordering, and SHALL NOT use queue task identity as the only business idempotency guard.

#### Scenario: Verified webhook is handed off within the callback contract
- **WHEN** a correctly signed, known Paddle event passes tenant and checkout-binding validation
- **THEN** the endpoint enqueues one canonical task keyed by the provider event ID and acknowledges within five seconds without mutating entitlement in the request

#### Scenario: Worker retries a duplicate or interrupted delivery
- **WHEN** the same event task is redelivered, a worker restarts, or a provider call fails transiently
- **THEN** Asynq retries the task and the durable tenant event markers apply the entitlement at most once, while exhausted work remains observable through the existing dead-letter path

### Requirement: Paddle-owned checkout and paid upgrades use one minimal mutation fence
For an initial self-service checkout, the system SHALL create or reuse exactly one official Paddle transaction containing one server-mapped price and tenant-bound signed custom data, persist only its provider transaction ID and immutable request coordinates in the existing tenant billing-operation row, and pass that `transactionId` to Paddle.js. Musuw SHALL NOT store payment data, calculate payment details, or grant entitlement from the transaction response. This row is only a short-lived duplicate-initiation fence, not a local payment state machine or billing ledger; Paddle SHALL own transaction/subscription lifecycle, payment data, tax, currency, eligible payment methods, receipts, and portal operations. The same one-tenant operation slot SHALL serialize a paid tenant's target-plan update. Because Paddle does not provide a client idempotency key for these mutations, an uncertain result SHALL remain fail-closed and SHALL never cause a blind second provider mutation. A retry MAY use an official provider read to confirm or safely release the operation. The signed webhook remains the only authority that grants or changes the durable plan.

#### Scenario: Repeated checkout requests reuse one provider transaction
- **WHEN** a Free tenant submits the same plan and billing-period checkout request more than once before it resolves
- **THEN** the server creates at most one Paddle transaction, returns the same provider transaction ID to every request, stores no payment data, and grants no entitlement

#### Scenario: User changes an unresolved checkout choice
- **WHEN** the same Free tenant chooses a different plan or billing period while its prior transaction remains unpaid
- **THEN** the server asks Paddle to cancel only that unpaid transaction, closes the old operation, and creates one replacement transaction; it never cancels a subscription or moves funds

#### Scenario: Repeated upgrades reuse one serialized operation
- **WHEN** concurrent authenticated requests ask the same tenant to upgrade to the same or another higher plan
- **THEN** one tenant-scoped operation is active, later requests reuse or report that operation, and only its provider-confirmed signed webhook can change the plan

#### Scenario: Upgrade provider response is uncertain
- **WHEN** a subscription update call times out after it may have been accepted
- **THEN** the server records the uncertain result and on retry reads the official subscription state; it closes a confirmed target, retains a recent unresolved operation, or releases a safely aged unchanged operation without blindly submitting a second mutation

### Requirement: Subscription shape and payment-recovery grace are bounded
The system SHALL accept, activate, or upgrade only a subscription containing exactly one known server-owned recurring base item. Zero items, multiple base items, unknown prices, or unrecognized add-ons SHALL fail closed without granting or changing entitlement. A `past_due` subscription SHALL remain paid grace through its last confirmed paid-term boundary, SHALL NOT advance that boundary or open a new allowance without a matching successful recurring payment, and SHALL become unavailable only after that confirmed term ends. Production SHALL use the complete reviewed Live unit; Paddle SHALL own checkout, payment execution, tax, currency, portal, Retain, and dunning while Musuw consumes only signed provider outcomes for entitlement.

#### Scenario: Subscription has exactly one known base item
- **WHEN** Paddle returns a subscription with exactly one active recurring item mapped to a server-owned price
- **THEN** the subscription may be previewed or updated subject to the existing ownership and plan checks

#### Scenario: Subscription shape is unsafe
- **WHEN** Paddle returns zero, multiple, or unknown recurring base items, or an unrecognized add-on
- **THEN** the server refuses activation or upgrade and leaves the durable plan and provider limit unchanged

#### Scenario: Past-due payment remains within paid grace
- **WHEN** a current subscription is `past_due` but its last confirmed paid-term boundary has not elapsed
- **THEN** existing paid access remains available, no new allowance is opened, and the unpaid provider period does not move the paid-term boundary

#### Scenario: Live launch keeps provider recovery authoritative
- **WHEN** the reviewed Live unit and Retain are enabled
- **THEN** Paddle.js and signed provider events remain the payment and recovery authority while Musuw adds no payment form, retry scheduler, recovery state machine, or financial ledger
