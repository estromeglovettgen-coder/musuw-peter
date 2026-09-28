## Context

The current Node operations gateway is deliberately private: it trusts a loopback browser reached by the local owner, creates a SameSite session, gates mutations with CSRF, reads PostgreSQL with a read-only role, and calls scoped management APIs for writes. The owner confirmed server persistence. Cloudflare Access is not enabled; introducing a public administrative origin would add unnecessary identity and exposure changes.

## Goals / Non-Goals

**Goals:** retain the exact operations feature set; run its process and database connections independently of Mac sleep; automatically recover service and client transport; preserve private access and read-only storage; deploy a reviewable immutable revision with rollback.

**Non-Goals:** public hosting, new login or identity provider, payment changes, application redeployment, user-data changes, or a claim of absolute network uptime.

## Decisions

1. Reuse the existing gateway and frontend. Explicit server mode reads protected files, while local mode continues using Keychain. Unknown modes and insecure files fail closed.
2. Keep the server listener on 127.0.0.1:4187 and use the existing operator SSH key to forward HTTP to the existing local address. SSH authenticates access; host/origin/session/CSRF checks remain active. The Mac no longer transports SQL connections.
3. Use a dedicated unprivileged server account and systemd restart supervision. Resolve the current database endpoint at service startup and verify real database readiness. The console must not stay indefinitely live but unusable after a broken database connection.
4. Build the operations bundle with locked dependencies in GitHub from a CI-green main SHA. Deploy through a restricted operations-only command and separate operations-production review environment. Keeping its deployment record independent prevents contaminating the application workflow's production baseline selection.
5. Retry only failed reads, gated by loading state and page visibility. Successful reads do not poll; write requests are never replayed. Existing edit state is retained.

## Risks / Trade-offs

- Client sleep or unavailable internet still interrupts the browser connection → server state remains live; SSH and read recovery restore the page after connectivity returns.
- Secret migration → copy only required existing credentials over authenticated SSH into owner-only files; no secrets in Git, artifact, browser or logs.
- Service crash or database restart → bounded readiness checks, failure restart and refreshed database endpoint.
- Release failure → retain the previous immutable release and original Mac configuration; verify readiness before switching the client.
- Private entry only → another device needs an authorized SSH connection; public access is a separate capability.

## Migration Plan

Build and review the bundle, install the narrow supervisor/deploy seam and protected runtime, deploy the immutable artifact, verify private HTTP/database/API behavior and crash recovery, then switch the existing Mac LaunchAgent to HTTP forwarding. Preserve the old local service configuration for rollback. No production business records are changed during acceptance.

## Open Questions

None affecting the product behavior. Exact artifact transport and supervisor plumbing must satisfy the same private access and immutable source requirements.
