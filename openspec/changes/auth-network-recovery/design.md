## Context

A real-source reproduction shows that the application bootstrap validates an old stored token before App.vue consumes a fresh OIDC callback. The old session can redirect to login first. This defect is established; attribution to a particular incident requires browser/origin correlation. Customer incident evidence remains outside the source repository.

## Goals / Non-Goals

Restore reliable callback handoff, reduce independently verified cold-start work, and document the actual monitoring limits. Do not change credentials, token validation, provider selection, payment logic, timeouts, or introduce telemetry infrastructure.

## Decisions

- Reuse hasPendingOIDCCallback to defer ordinary stored-session preflight when a new callback is pending. Existing callback processing and new-session validation remain authoritative.
- Test real bootstrap and request recovery with controlled external responses. Cover rejected old credentials, valid old credentials, ordinary startup, and temporary provider failure.
- A conditional async editor candidate was evaluated and withdrawn: its built entry graph still includes Mermaid and Highlight. Do not alter editor lifecycle for the limited remaining reduction; bundling is a separate follow-up.
- Separate origin processing time, identity-provider time and browser-to-edge transfer. A successful provider request does not prove a completed browser login; a local or Tokyo probe does not establish mainland-China latency.

## Risks / Trade-offs

Deferring preflight must not turn callback detection into authentication. Existing App/router guards continue to validate the new session. Lazy imports can move delay to first use; retain feedback and verify that path. No retrospective browser trace exists, so incident attribution must remain qualified.

## Migration Plan

No data or configuration migration. Revert the narrowly scoped frontend commit to roll back. Any release must use the repository's immutable staging and production process; do not weaken its gates or claim production deployment from local tests.
