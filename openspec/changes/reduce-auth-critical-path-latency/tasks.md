## 1. Contracts and Baseline

- [x] 1.1 Add a failing frontend contract proving a complete OIDC callback hydrates user, tenant, and memberships before navigation and does not await `/auth/me`, while an incomplete callback retains the blocking fallback.
- [x] 1.2 Add production and staging deployment contracts proving explicit authorization, token, and user-info endpoints are derived from the environment-specific issuer without cross-environment leakage.
- [x] 1.3 Record non-sensitive Beijing, Tokyo, mainland multi-city, and external-region read-only timing evidence that separates dynamic app, static edge, direct Supabase, and server processing latency.

## 2. Minimal Implementation

- [x] 2.1 Reuse the OIDC callback snapshot for immediate frontend session hydration, keep workspace creation fail-closed, and run `/auth/me` reconciliation asynchronously without turning reconciliation failure into login failure.
- [x] 2.2 Pass the three existing explicit OIDC endpoint inputs in both Compose projects by deriving them from the already validated issuer URL; retain discovery as fallback/reference and do not add new public configuration keys.

## 3. Verification and Release

- [x] 3.1 Run focused callback and deployment contracts, frontend tests, typecheck, production build, staging static verification, production static verification, and strict OpenSpec validation.
- [x] 3.2 Render both Compose projects with fixtures and prove each app receives only its own explicit Supabase endpoints while Live/Sandbox Paddle boundaries remain unchanged.
- [x] 3.3 Run one bounded adversarial review covering callback tampering, stale roles, capability fail-closed behavior, refresh failure, deployment ordering, endpoint drift, redirect safety, and unnecessary complexity.
- [ ] 3.4 Deploy the exact immutable image set and Compose revision to staging, complete a real Sandbox email-code login and background reconciliation smoke, then promote the same tested digests to production and recheck environment isolation and public health.
