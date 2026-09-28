## Why

Intermittent mobile sign-in can succeed at the identity provider yet return to the login screen. A real-source regression proves the application validates obsolete stored credentials before consuming the new OIDC callback; slow networks also amplify avoidable startup waiting.

## What Changes

- Consume an incoming OIDC callback before attempting ordinary stored-session synchronization, preserving all existing new-session and ordinary authorization checks.
- Remove the redundant old-session request from callback startup. Evaluate other cold-start work separately and retain only optimizations supported by build evidence.
- Record the observed production login timeline, latency boundaries and monitoring gaps; distinguish reproduced defects from unproved incident attribution.

## Capabilities

### New Capabilities
- `auth-network-recovery`: Safe callback startup and bounded, observable recovery behavior under stale sessions and network failure.

### Modified Capabilities
None. The fix restores existing login and document-loading behavior.

## Impact

Frontend bootstrap and narrowly related loading code/tests. No credential changes, database migrations, provider changes, new telemetry service, billing changes, model calls or authorization bypass. Production publication, if pursued, remains subject to the existing immutable release gates. New remote telemetry is an audit recommendation, not silently added to this change.
