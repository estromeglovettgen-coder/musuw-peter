## 1. Authorization and product exposure

- [x] 1.1 Add failing route and Lite product-gate tests for Viewer+ IM/embed management while preserving API-key capability checks.
- [x] 1.2 Implement the narrow member channel guard and remove only authenticated channel management from the Lite deny list.
- [x] 1.3 Add failing frontend policy tests for ordinary-member navigation, hidden integration deep links, and administrator settings preservation.
- [x] 1.4 Update the existing Musuw settings shell and channel panels to apply the member channel policy without adding UI styles.

## 2. Credential and tenant safety

- [x] 2.1 Add failing tests for cross-tenant agent binding, secret-free responses, generic duplicate conflicts, and partial credential updates.
- [x] 2.2 Implement safe channel summaries, tenant validation, generic conflicts, and key-level credential merge semantics.
- [x] 2.3 Add and implement frontend credential payload tests for omitted, falsy, single-key, create, and WeChat rebind cases.

## 3. Verification and staging delivery

- [x] 3.1 Run focused and full affected Go/frontend tests, type checking, production builds, static release contracts, and OpenSpec strict validation.
- [x] 3.2 Complete one bounded adversarial review and fix any release blocker.
- [ ] 3.3 Push the reviewed branch, merge through CI, and verify the automatic staging-only release revision, health, noindex, and Sandbox boundary.
- [ ] 3.4 Exercise the member IM/embed acceptance flow on `staging.musuw.com` without promoting to production.
