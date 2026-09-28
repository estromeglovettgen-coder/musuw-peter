## Context

The public auth shell calls Supabase Auth directly, then hands the resulting identity to WeKnora through the existing OIDC authorization-code flow. After Supabase verifies an email code, the browser currently waits for `/api/v1/auth/oidc/url`, Supabase authorization, the WeKnora callback, and another `/api/v1/auth/me` request before entering the application. The WeKnora callback already includes the newly issued local token, safe user fields, active tenant, and memberships, but `App.vue` discards that context and waits for `/auth/me` to return the same core data again.

Production and staging currently pass only issuer and discovery URLs to WeKnora even though the upstream configuration model already supports explicit authorization, token, and user-info endpoints. Consequently, both authorization URL generation and callback exchange may fetch the same discovery document. Production logs show the server work is small relative to mainland cross-border round trips, so removing complete requests from the serial browser path has higher value than tuning individual local functions.

## Goals / Non-Goals

**Goals:**

- Remove provider discovery network calls from normal authorization URL and callback handling by using existing explicit endpoint inputs.
- Enter the application from the complete OIDC callback snapshot without waiting for an additional cross-border `/auth/me` response.
- Preserve an authoritative asynchronous `/auth/me` reconciliation for capabilities and any immediately changed role state.
- Preserve all provider, PKCE, state, token exchange, user-info, local session, tenant, and backend authorization checks.
- Keep production and staging configuration structurally identical while retaining separate Supabase projects.

**Non-Goals:**

- Introducing a mainland auth relay, a second identity provider, a second account database, or custom JWT verification.
- Skipping Supabase user-info verification or weakening backend authorization based on frontend state.
- Claiming a nationwide mainland latency SLA.
- Changing OTP retry, SMTP provider, rate limiting, account creation, or the 30-second request deadline in this delta.
- Reworking the native application bundle, chat transport, uploads, or Cloudflare plan.

## Decisions

### Derive explicit endpoints from the already validated issuer URL

The production and staging Compose files will pass `OIDC_AUTH_AUTHORIZATION_ENDPOINT`, `OIDC_AUTH_TOKEN_ENDPOINT`, and `OIDC_AUTH_USER_INFO_ENDPOINT` by appending the documented Supabase OAuth paths to `OIDC_AUTH_ISSUER_URL`. This uses WeKnora's existing configuration seam and the runtime's existing issuer validation instead of adding three public environment variables or a new discovery cache.

Alternatives considered:

- A process-wide discovery TTL/singleflight cache would work but adds code, synchronization, expiry, and fallback behavior for values that are already stable and known.
- Disabling user-info would remove another provider call but is rejected because the existing local ID-token decoder is not a complete signature/issuer/audience verifier.

### Use the callback snapshot immediately and reconcile in the background

`App.vue` will apply callback `user`, `tenant`, and `memberships` immediately after storing the local tokens. Navigation then proceeds using that snapshot. `/auth/me` still starts promptly but is not awaited by the callback critical path; a successful response replaces the snapshot and sets authoritative capabilities. A failed refresh is logged and left for the existing page-load/session hydration path to retry.

Workspace creation capability remains fail-closed until `/auth/me` confirms it. Backend APIs remain the authority for every protected action, so using the callback snapshot for initial UI hydration does not grant permissions.

The callback fragment is client-visible state and is therefore never treated
as an authorization boundary. Initial hydration explicitly ignores any
capability field in that fragment. A forged or expired local token is rejected
by the existing authenticated API/refresh path, while every tenant and role
operation remains server-authorized. This preserves the useful snapshot
optimization without adding a second signing protocol for client-owned UI
state.

The background reconciliation captures the local token and selected tenant at
request start. If either changes before the response returns, the response is
discarded. This is the smallest guard that prevents an old login or tenant
selection from repopulating the store after logout, re-login, token refresh, or
workspace switching.

If a callback has a token but lacks the user snapshot required by the current contract, the frontend falls back to the existing blocking `/auth/me` behavior for compatibility instead of entering a partially hydrated session.

### Keep the direct Supabase browser boundary unchanged

The measurements do not justify proxying OTP/verify through Tokyo: Beijing reached the Supabase public endpoint substantially faster than `app.musuw.com`, so a same-origin Tokyo relay would increase the measured path while adding credentials, abuse controls, and failure modes. A compliant mainland network product remains a separate future decision if a nationwide SLA is required.

## Risks / Trade-offs

- [The callback snapshot may be stale by the time it renders] → Start `/auth/me` reconciliation immediately and preserve all backend authorization checks; the window is limited to initial UI display.
- [The asynchronous refresh may fail] → Keep the valid callback session, log a warning, and rely on existing reload/session hydration to retry; do not turn a transient reconciliation failure into a failed login.
- [A slow refresh may complete after logout or tenant switching] → Apply it only while the initiating token and selected-tenant coordinate are still current.
- [A release runner may export stale OIDC variables] → The two supported Compose wrappers remove inherited OIDC URL variables before loading the validated runtime env files; the production release boundary also clears them before any forward or older-wrapper rollback path, and release checks inspect the running container endpoints.
- [A future Supabase endpoint path may change] → Keep discovery configured for operational reference and cover the derived endpoint paths with release contracts; updating the issuer integration remains one bounded configuration change.
- [Frontend and Compose revisions could deploy out of order] → The callback retains a compatibility fallback when snapshot fields are missing, and explicit endpoint variables are additive to the existing server image.
- [Measurements vary by carrier and route] → Treat current Beijing, Tokyo, and global probe samples as diagnosis evidence, not an SLA claim.

## Migration Plan

1. Add focused failing contracts for non-blocking callback reconciliation and explicit endpoint propagation.
2. Implement the frontend hydration change and Compose inputs, then run frontend typecheck/build, focused tests, static deployment contracts, and OpenSpec validation.
3. Render both Compose projects and verify the app receives the correct environment-specific endpoints without exposing credentials.
4. Deploy the same immutable image set to staging, run a real Sandbox email-code login, and confirm navigation no longer waits for `/auth/me` while the background refresh succeeds.
5. Promote the exact tested digests and Compose revision to production, then verify Live/Sandbox isolation remains unchanged.
6. Roll back by restoring the previous frontend digest and Compose revision; no data migration or account rollback is required.

## Open Questions

None for this bounded change. A mainland SLA, Cloudflare China Network, and auth relay remain separate product/infrastructure decisions requiring compliance and cost review.
