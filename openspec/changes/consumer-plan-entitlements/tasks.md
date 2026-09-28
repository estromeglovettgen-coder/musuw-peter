## 1. Entitlement core

- [x] 1.1 Add failing policy and repository tests for the four-plan matrix and provider-managed child-key lifecycle
- [x] 1.2 Keep the additive PostgreSQL/SQLite plan fields and implement encrypted first-use child-key persistence on the existing tenant row

## 2. Server enforcement

- [x] 2.1 Add failing service tests and enforce Free knowledge-base, document, video, and model limits
- [x] 2.2 Use the official OpenRouter SDK for monthly-limited child keys, inject tenant keys/user attribution across existing model clients, and make 402 terminal
- [x] 2.3 Add the authenticated entitlement endpoint and optional signature-verified Paddle webhook
- [x] 2.4 Use Paddle's official Go verifier, tenant-bound checkout data, server-owned price mappings, subscription-only state changes, and idempotent observable event handling
- [x] 2.5 Move all child keys off the UTC natural-month reset, refresh Free on its registration anniversary, and replenish monthly-paid plans exactly once from a verified successful Paddle recurring period
- [x] 2.6 Persist Paddle's verified paid-term end and block annual allowance use or refresh beyond that term
- [x] 2.7 Make paid-term advancement monotonic and subscription-bound under the existing row lock, fail closed for unknown paid cadence, and remove legacy inline VLM credentials from consumer processing
- [x] 2.8 Preserve typed OpenRouter credit exhaustion through video-ingestion failure persistence so the existing worker middleware returns `SkipRetry` without changing the failed/reparse lifecycle

## 3. Consumer UI

- [x] 3.1 Show plan/storage/credit state in Usage & billing settings and align storefront's four plans with enforced limits
- [x] 3.2 Preserve storefront plan intent through authentication, route settings/account upgrade actions through standalone `/plans`, mount the official Paddle.js inline Checkout on `/checkout` without a custom payment form, and show billing/portal mutations only to tenant Owners/Admins
- [x] 3.3 Add an authenticated, tenant-owned Paddle Customer Portal button using the official Go SDK and expose only a fresh one-time overview URL
- [x] 3.4 Add official Paddle preview/update for paid upgrades while preserving the current term and keeping the signed webhook authoritative
- [x] 3.5 Replace the compact upgrade controls with a standalone GPT-style four-plan comparison and Paddle.js localized `PricePreview()` values

## 4. Verification and release

- [x] 4.1 Run focused and full backend/frontend/storefront checks plus strict OpenSpec validation
- [x] 4.2 Verify Free and paid catalog/limits in the local browser and retain the earlier bounded production evidence; defer the combined release at the user's request because GitHub Actions minutes are exhausted
- [x] 4.3 Verify the six-price Sandbox catalog, real Paddle-signed activation/cancellation/duplicate deliveries, database state, audit logs, and browser entitlement refresh through the local Cloudflare tunnel
- [x] 4.4 Verify the authenticated Customer Portal, anonymous/no-customer rejection, token-redacted logs, and final local browser lifecycle regression
- [x] 4.5 Upgrade a real non-admin Sandbox subscription in Chrome and verify the signed event updates the existing OpenRouter child-key limit before the durable plan
- [x] 4.6 Verify Free anniversary refresh without stacking, paid-cycle renewal idempotency, same-cycle upgrade preservation, localized plan prices, and the final local browser lifecycle
- [x] 4.7 Wire the complete Sandbox Paddle catalog and file-backed Paddle/OpenRouter secrets through the fixed production runtime, with a fail-closed static preflight
- [x] 4.8 Verify annual payment-recovery grace stops at the paid-term boundary, including migration, repository, and service regression coverage
- [x] 4.9 Verify reordered paid-period events cannot roll back or cross subscriptions and legacy VLM overrides never reach a provider
- [x] 4.10 Verify annual pause/resume retains the paid term and remaining allowance without granting another period
- [x] 4.11 Replace the hard-coded environment check with a shared Sandbox/Live shape validator; the sibling reviewed Live cutover now makes fixed production Live-only while preserving the same mixed, malformed and duplicate-price rejection
- [x] 4.12 Remove the cross-environment orphan-recovery checkout, provider probe, frontend state, and tests after confirming launch data is disposable; reject initial paid state without a confirmed provider period
- [ ] 4.13 Delete stale test data through the existing account lifecycle and verify one fresh standard Paddle Sandbox checkout plus signed activation without SQL or a recovery subsystem
- [x] 4.14 Render Paddle's localized formatted final total without rewriting it and pass only the authenticated tenant-derived Paddle customer to `pwCustomer`/`Paddle.Update`; the sibling Live change initializes official Retain globally without granting browser authority
- [x] 4.15 Implement the verified Paddle webhook handoff as durable, retryable Asynq work that acknowledges within five seconds, keeps the tenant event markers as final idempotency, and preserves dead-letter visibility after retries are exhausted
- [ ] 4.16 Verify webhook enqueue timing, worker restart/retry behavior, duplicate and reordered deliveries, and final tenant-marker idempotency in the Paddle Sandbox
- [x] 4.17 Reuse the existing tenant billing-operation fence for one official initial Paddle transaction ID and paid upgrades; open Paddle.js by `transactionId`, reconcile uncertain upgrades with provider reads only, never retry a mutation blindly, and accept exactly one known subscription base item
- [ ] 4.18 Verify repeated checkout transaction reuse/replacement, repeated upgrades across replicas, uncertain subscription-update responses, operation reuse, unsafe multi-item/unknown-item subscriptions, and signed-webhook authority in the Paddle Sandbox
- [x] 4.19 Implement the separately reviewed Live full-refund/chargeback entitlement policy through signed adjustment events and the minimum official provider-state read for reversal; add no financial ledger or payment write
- [x] 4.20 Verify refund, chargeback, reversal, and official Retain behavior through local signed policy fixtures plus provider-supported no-charge Live evidence; never create a real financial action
- [x] 4.21 Fix the audit-confirmed billing write authorization, duplicate-checkout, cross-stream webhook ordering, stuck-upgrade reconciliation, paid-downgrade allowance, and empty-status fail-closed defects with focused and race tests and no new queue, ledger, or payment UI

## 5. Consumer account erasure

- [x] 5.1 Add failing backend contract tests for operations-only target deletion, SystemAdmin/platform-capability routing, shared-owner/system-admin rejection, Paddle read-only billing preflight, immediate login/token fencing, deterministic enqueue, and retry/idempotency
- [x] 5.2 Persist the bound OIDC provider subject plus one deletion-request fence in PostgreSQL and SQLite, and prevent a mismatched subject from taking over an existing email
- [x] 5.3 Implement one account-erasure service/task that reuses knowledge, OpenRouter, storage, queue, and tenant cleanup, removes ordinary foreign memberships, calls the server-only Supabase Admin delete API, and hard-purges the local personal tenant/user in an explicit dependency order
- [x] 5.4 Add one visible destructive button only to the local operations user console, with one irreversible confirmation and a clear Paddle-billing blocker; expose no self-service profile action
- [x] 5.5 Verify focused tests, race/static contracts, full relevant backend/frontend tests, production build, migration symmetry, and a synthetic no-funds erasure/re-registration lifecycle; do not delete a real production account
