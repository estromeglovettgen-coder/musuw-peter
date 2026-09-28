## 1. Contract

- [x] 1.1 Validate the new OpenSpec change in strict mode before implementation
- [x] 1.2 Add failing plan-matrix and next-period Free allowance tests
- [x] 1.3 Add failing migration and consumer-copy contract tests

## 2. Server Authority

- [x] 2.1 Change the existing consumer plan authority to Free USD 0.40 and storage 1/10/30/100 GiB
- [x] 2.2 Apply the new Free allowance through existing key provisioning and personal-period refresh paths
- [x] 2.3 Align tenant and system-setting Free storage defaults without changing payment behavior

## 3. Persisted Storage Quotas

- [x] 3.1 Add paired PostgreSQL and SQLite migrations mapping existing tenant quotas by persisted plan
- [x] 3.2 Update fresh-schema defaults and verify forward/down migration behavior without deleting usage or data

## 4. Consumer Copy

- [x] 4.1 Update authenticated Plans and Checkout storage values and Free allowance copy
- [x] 4.2 Update public storefront plan and comparison copy in supported locales
- [x] 4.3 Keep plan prices, checkout, subscription, webhook, and Paddle files unchanged

## 5. Verification

- [x] 5.1 Run strict OpenSpec validation, focused Go tests, migration contracts, and relevant race tests
- [x] 5.2 Run focused and complete frontend/storefront tests, typecheck, i18n check, and builds
- [x] 5.3 Run native Go build, repository validators, and git diff checks
- [x] 5.4 Leave changes local with the existing development service running; do not commit, push, or publish
