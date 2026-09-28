## Why

Mainland measurements show that every uncached round trip from the browser to `app.musuw.com` can cost roughly one to three seconds, while the current email-code handoff performs avoidable OIDC discovery and `/auth/me` work in series after identity verification. The application already returns the authenticated user, active tenant, and memberships in the signed-in OIDC callback, and WeKnora already supports explicit provider endpoints, so the critical path can be shortened without adding a proxy, identity provider, or retry state machine.

## What Changes

- Configure the existing explicit OIDC authorization, token, and user-info endpoint inputs for both production and staging so login does not fetch the discovery document on every authorization URL and callback request.
- Hydrate the frontend session immediately from the successful OIDC callback payload, then refresh `/auth/me` asynchronously for authoritative capability and role reconciliation instead of blocking navigation on another cross-border request.
- Preserve the existing Supabase identity boundary, PKCE/state validation, user-info verification, local token issuance, fail-closed workspace creation capability, and eventual `/auth/me` refresh.
- Add focused contracts for callback hydration, non-blocking reconciliation, explicit endpoint propagation, and failure recovery.
- Record multi-vantage latency evidence separately from functional acceptance; this change does not claim to provide a mainland SLA or replace the need for a compliant China network product if one is later required.

## Capabilities

### New Capabilities

- `auth-critical-path-performance`: Defines the non-blocking authenticated handoff and provider endpoint configuration contracts that remove redundant network work without weakening identity or authorization checks.

### Modified Capabilities

None.

## Impact

- Frontend OIDC callback handling in `weknora/frontend/src/App.vue` and its focused tests.
- Production and staging Compose/environment contracts under `integration/weknora-production` and `integration/weknora-staging`.
- Authentication release verification and OpenSpec evidence.
- No database migration, new service, new dependency, public API change, or identity-provider migration.
