## 1. Provider and repository authority

- [x] 1.1 Expand and transcribe every Paddle Live onboarding detail prompt; record the exact completion/owner-only state without touching payout details.
- [x] 1.2 Audit clean `main`, existing OpenSpec/production contracts, Paddle integration, protected runtime, Keychain metadata, and release path.
- [x] 1.3 Read the official catalog, checkout, webhook, subscription-sync, browser-control, design, TDD, and OpenSpec instructions used by this change.
- [x] 1.4 Read the existing Live catalog, client tokens, checkout domain, destination, and notification metadata through official provider surfaces without printing values or creating resources.
- [x] 1.5 Verify seller approval, default payment link, API-key permissions, tax/currency/payment-method choices, and Retain/dunning state in Dashboard; classify payout setup as untouched owner-only scope.

## 2. Live production contract

- [x] 2.1 Add failing tests that require a complete Live production unit and reject Sandbox, mixed classes, missing secrets, and duplicate price IDs.
- [x] 2.2 Change only the fixed production wrapper, checked-in example, static release preflight, registry validator, and metadata entries from Sandbox-only to Live-only.
- [x] 2.3 Switch the production operations Paddle read from the Sandbox API/test Keychain item to the Live API/production Keychain item and update focused tests and runbooks.
- [x] 2.4 Run the focused shell, operations, registry, and source-secret tests and record the original red plus final green evidence.
- [x] 2.5 Use Paddle's automatic transaction API once per unresolved tenant checkout operation, pass its `transactionId` to Paddle.js, and retain only the existing durable active-operation fence needed to prevent duplicate tabs; signed webhooks remain authoritative and the same minimal fence covers the official paid-upgrade API.
- [x] 2.6 Initialize official Paddle.js on the stable public app shell and pass only the authenticated entitlement-derived Paddle customer to Retain; keep dunning and recovery UI provider-owned with no local recovery state.

## 3. Refund and dispute policy

- [x] 3.1 Add failing signed-event and worker/service tests for full approved refund, full chargeback, partial/pending/rejected/warning no-op, duplicate/stale delivery, and authoritative reversal.
- [x] 3.2 Extend the existing canonical webhook task and tenant mirror with the minimum current-subscription adjustment lookup and provider-state read; do not add a billing ledger or financial write.
- [x] 3.3 Add `adjustment.created` and `adjustment.updated` to the one Live destination only after the code path is green; retain the existing lifecycle and recurring event set.
- [x] 3.4 Verify signature, bounded acknowledgement/retry, idempotency, ordering, entitlement mapping, raw-body suppression, and adjustment behavior with local signed fixtures and official no-charge simulation where supported.

## 4. Protected cutover and release

- [x] 4.1 Set the existing approved app's Live default payment link to `https://app.musuw.com/pay` and re-read the saved provider state.
- [x] 4.2 Build the Live public input from provider-verified IDs/token and atomically install it in the existing GitHub production environment and root-owned server public file without printing it.
- [x] 4.3 Atomically install the existing Live API key and exact destination signing secret in the root-owned `0600` server secret files and prove only shape, ownership, mode, and destination match.
- [x] 4.4 Run server preflight before recreation, commit and push the reviewed SHA, require CI and exact-SHA deployment, and verify running revision plus application/worker health.

## 5. End-to-end acceptance and review

- [x] 5.1 Verify public storefront/legal/contact surfaces, production Live public config, and server-side price preview for all six mappings.
- [x] 5.2 Open the real Live checkout for a supported plan, confirm the displayed plan/price/origin, and stop before entering a payment method or confirming purchase.
- [x] 5.3 Prove official non-charge notification delivery, signature acceptance, safe retry/duplicate behavior, and tenant customer/subscription/entitlement consistency without fabricating a production event.
- [x] 5.4 Scan tracked changes, CI/runtime logs, browser responses, and server file metadata for secret leakage; do not capture sensitive Dashboard fields in screenshots.
- [x] 5.5 Run one consolidated adversarial review covering no money movement, untouched payout settings, no duplicate catalog, no Sandbox/Live mixing, no secret exposure, rollback consistency, the single checkout fence versus Paddle authority, and every unverified claim.
- [x] 5.6 Update the deferred consumer-entitlement tasks and this change's verification record with fresh evidence, remaining owner-only steps, and exact residual risk.
- [x] 5.7 Re-audit Paddle's authoritative onboarding progress, distinguish platform notification logs from successful simulations, and add a tested deployment-time Live/Sandbox webhook source allowlist from the fixed official `/ips` endpoints without weakening signature verification.
- [ ] 5.8 Deploy the source-allowlist correction to staging first, prove official Sandbox delivery and negative ingress behavior, then promote the exact same frontend digest to production and prove the existing Live simulation still returns HTTP 200.
