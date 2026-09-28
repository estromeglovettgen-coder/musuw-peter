## Why

A full production release exhausted the 40 GB host disk, putting PostgreSQL
into recovery.  The resulting native OIDC failure was automatically routed
back to `/auth/start`, which can immediately retry OIDC with an existing
Supabase session and turn one temporary outage into a refresh/nonce loop.

## What Changes

- Keep a native OIDC callback failure on a stable Musuw failure route that
  presents an explicit user retry instead of automatically starting OIDC again.
- Treat temporary native-session validation failures as unavailable rather
  than invalid, so they preserve the token and cannot trigger OIDC retry.
- Return generic 503 responses for native authentication persistence outages,
  preserve tokens on a transient refresh failure, and keep callback fragments
  free of raw provider or database detail.
- Add a release capacity gate before source upload and Docker image work, so a
  full release fails before it can starve the running PostgreSQL and Redis
  services.
- Stop the full release image script from unconditionally pulling DocReader
  when the pinned image is already present.
- Add focused regression coverage for the error-route handoff and release
  capacity gate.

## Capabilities

### New Capabilities

- `authentication-failure-recovery`: Safe, explicit recovery from a failed
  native OIDC callback.
- `capacity-safe-release`: A full release refuses to begin when production
  disk capacity is insufficient for its build work.

### Modified Capabilities

<!-- None. There are no existing repository-level OpenSpec capability specs. -->

## Impact

- `weknora/frontend` native OIDC callback and external-auth handoff.
- `weknora` authentication service, middleware, and callback handler.
- `auth/` failure-page presentation.
- `scripts/weknora-deploy.sh` and the fixed production Compose/release seam.
- Production deployment behavior only; no model, knowledge-base, or data
  contract changes.
