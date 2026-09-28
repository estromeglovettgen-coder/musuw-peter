## Context

The application is a thin Musuw authentication shell over WeKnora.  A native
OIDC callback is rendered by the WeKnora frontend, while `/auth/*` is served
by the Musuw shell.  Today an error callback is cleared to `/login`; the
WeKnora route guard treats that as a signed-out entry and immediately hands
the browser to `/auth/start`.  A retained Supabase session can then silently
start the same native OIDC operation again.

Full releases upload a source snapshot and build the native app on a 40 GB
production host.  The latest failed release consumed enough Docker snapshot
space to put PostgreSQL into recovery.  The current host has only about 6 GB
free, so the release path must reject unsafe work before it uploads or builds.

## Goals / Non-Goals

**Goals:**

- Preserve a failed native OIDC callback as a stable, user-visible state with
  an explicit retry action.
- Ensure a full release does not begin when free capacity is below a fixed
  safety reserve.
- Avoid an unnecessary DocReader network pull when the pinned image is
  already available.
- Preserve the existing WeKnora OIDC callback, Supabase identity flow, and
  production data volumes.

**Non-Goals:**

- Retrying a failed database or OIDC request automatically.
- Adding an authentication service, token bridge, database table, or release
  orchestration layer.
- Reclaiming Docker state automatically or deleting any production artifact.

## Decisions

### Route a native OIDC failure to `/auth/error`

The native frontend will make a browser-level handoff to a dedicated Musuw
error route rather than replacing to WeKnora's `/login`.  The auth shell will
render a generic temporary-failure message and its normal login controls; a
new sign-in click is the only retry trigger.

This preserves the current ownership boundary and avoids carrying backend
error detail through a browser URL.  Allowing `/login` through the WeKnora
guard was rejected because it would re-expose WeKnora's native login UI and
would create a special-case routing exception.

### Distinguish invalid native sessions from an unavailable native service

The auth shell will clear a native token only for definitive authorization
responses (401 or 403).  A 5xx response, malformed unavailable response, or
network timeout will return the existing `native_session_unavailable` state
without clearing the token or checking Supabase for a new OIDC operation.

Treating every non-2xx response as invalid was rejected because database
recovery is an availability failure, not proof that the browser's token is
invalid.

The native backend must make this distinction too: token, user, tenant, and
membership persistence failures are mapped to a generic 503 response at the
authentication boundary, while missing, revoked, malformed, or unauthorized
credentials remain 401/403. The refresh interceptor similarly clears browser
tokens only after a definitive 401/403 response; a 5xx is surfaced for retry
without changing stored state.

### Sanitize OIDC callback redirects

The callback can log provider and persistence diagnostics server-side, but its
browser fragment will contain only a stable error code. This avoids exposing
database connection details in browser history while the `/auth/error` route
keeps the user-facing message generic.

### Reserve host disk before a full release

`weknora-deploy.sh update` will run a read-only remote `df -Pk /` check before
creating the release directory or transferring source.  It will require a
configurable reserve with a conservative default sized for the production
app's known build work.  A failed check exits without a Docker operation.

This is preferred to automatic pruning: deployment cannot safely infer which
images, caches, or release snapshots an operator still needs.  Operators can
free capacity or expand storage deliberately, then rerun the same command.

### Pull DocReader only when absent

The image build script will inspect the pinned DocReader image first and pull
it only if it is missing.  The app/frontend build remains explicit because it
is the requested full-release work.

## Risks / Trade-offs

- A user must click to retry after a transient outage → This is intentional;
  it prevents nonce/cookie churn and keeps the failure visible.
- A 503 leaves a stale native token in browser storage until recovery or an
  explicit invalid response → This preserves the correct retry state and is
  safer than treating an outage as logout.
- The capacity threshold can reject a release that might have succeeded → It
  fails before risking databases; an override can be documented only if a
  later operational need proves it necessary.
- The existing pinned DocReader image could become unavailable on the host →
  The conditional branch still pulls it when inspection fails.

## Migration Plan

1. Add focused tests for the OIDC failure handoff and capacity check.
2. Implement the minimum frontend/auth and script changes.
3. Run module tests/builds and a simulated capacity failure locally.
4. Deploy only after production capacity is adequate; verify a synthetic OIDC
   error lands on `/auth/error` and the normal app health remains green.

Rollback is a UI-only deployment rollback for the route change.  The capacity
gate is fail-closed and can be reverted from source if it proves incorrect;
it makes no remote state change by itself.

## Open Questions

- Confirm the reserve from the actual app build's peak incremental disk usage
  before performing the next full production release.
