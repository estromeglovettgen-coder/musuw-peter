## 1. Lock the contracts with failing tests

- [x] 1.1 Add effective-plan and exact-expiration tests for active, expired, malformed, and leftover complimentary metadata
- [x] 1.2 Add repository/service tests for Plus/Pro/Max grant, replay/conflict, compare-and-set revoke, provider failure, monthly refresh, expiration convergence, and Paddle activation races
- [x] 1.3 Add handler/router/proxy tests for strict JSON, RFC3339 input, capability/route allowlists, CSRF, and dedicated audits
- [x] 1.4 Add operations frontend tests for eligibility, UTC conversion, explicit grant/revoke actions, submit errors, and refreshed entitlement display

## 2. Persist and resolve complimentary state

- [x] 2.1 Add paired PostgreSQL and SQLite up/down migrations for complimentary plan, expiration, and grant ID
- [x] 2.2 Add tenant/entitlement DTO fields and a single time-aware resolver with verified Paddle > active complimentary > Free priority
- [x] 2.3 Apply the resolver consistently to storage, model/content, usage projection, credit reset, and checkout eligibility without mutating Paddle-owned fields

## 3. Implement atomic entitlement transitions

- [x] 3.1 Add row-locked repository grant/revoke/complimentary-period transitions with grant-ID idempotency and compare-and-set guards
- [x] 3.2 Add entitlement-service grant/revoke methods that validate Free/Paddle-unbound eligibility and synchronize the existing provider key from one durable desired limit
- [x] 3.3 Add lazy monthly complimentary refresh capped at expiration and fail-closed convergence to Free at the exact boundary
- [x] 3.4 Clear active complimentary state atomically when a valid signed initial Paddle activation takes ownership

## 4. Expose narrow audited operations controls

- [x] 4.1 Add strict SystemAdmin grant/revoke handlers, dedicated audit actions, capability routes, Lite gate entries, and API capability contracts
- [x] 4.2 Add exact local proxy allowlist support while retaining existing Origin, SameSite session, and CSRF enforcement
- [x] 4.3 Add operations API/types and selected-user UI for plan, expiration, explicit grant/revoke actions, source, and eligibility messaging

## 5. Verify and review

- [x] 5.1 Run targeted Go, Node, and frontend tests and prove the original direct-SQL/UI-only failure is closed
- [x] 5.2 Run Go test suites, frontend typecheck/test/build, migration checks, and operations proxy/security tests
- [x] 5.3 Perform one bounded adversarial review of Paddle ordering, provider overgrant, expiration, replay, authorization, rollback, and unnecessary complexity; fix blockers and rerun affected checks
- [x] 5.4 Record fresh verification evidence and remaining limitations in the change artifacts
