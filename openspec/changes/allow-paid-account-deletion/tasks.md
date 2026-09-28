## 1. Provider contract and service behavior

- [x] 1.1 Add failing Paddle-adapter tests for active/trialing period-end cancellation, paused cancellation, already-scheduled idempotency, terminal/not-found success, and unreadable or unsupported states
- [x] 1.2 Add failing account-erasure service tests proving provider preparation happens before fencing and provider failure leaves the account active and unqueued
- [x] 1.3 Implement the smallest official-SDK cancellation preparation method while retaining terminal verification in the worker
- [x] 1.4 Make post-purge signed Paddle tasks idempotent only for the explicit missing-tenant sentinel, with race-focused repository and worker tests

## 2. User-facing lifecycle contract

- [x] 2.1 Update the operations confirmation and its contract test to describe automatic future-renewal cancellation, immediate access fencing, no automatic refund, and deferred purge
- [x] 2.2 Update conflicting English and Chinese public lifecycle copy and its legal-content tests

## 3. Verification and release

- [x] 3.1 Run focused backend race tests, frontend operations tests, storefront tests, type checks, and production builds
- [x] 3.2 Validate the OpenSpec change and perform one consolidated adversarial review of billing, idempotency, cleanup, and rollback behavior
- [ ] 3.3 Commit and push the exact verified revision, then report staging/production release evidence without deleting a real production account
