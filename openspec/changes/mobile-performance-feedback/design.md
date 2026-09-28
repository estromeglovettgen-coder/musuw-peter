## Context
The application waits for configuration, JavaScript and authentication before mounting. Manual chunking currently absorbs shared Vue/DOMPurify into diagram/highlight bundles. Origin logs time only server requests and disappear with container replacement; identity success alone does not establish browser navigation success.

## Goals / Non-Goals
**Goals:** preserve authentication semantics, show actionable startup feedback, reduce measured initial bytes, and distinguish browser identity/API deadlines from server work.
**Non-Goals:** payment/model testing, a new monitoring platform, provider migration, user tracking, speculative retries, and broad business changes.

## Decisions
- Reuse native entry HTML and existing branding for startup status. The application replaces it on normal mount. HTML/CSS delivery itself remains a network prerequisite.
- Use Rollup's explicit manual chunk ownership rather than changing renderer lifecycle. Verify first-use diagrams and highlighting against production bundles.
- Reuse the request deadline boundary for auth diagnostics. An optional callback accepts only a fixed phase, bounded elapsed time and outcome. Browser reporting is best effort, bounded and never awaited by business actions.
- A public, write-only diagnostic endpoint accepts only strict typed fields, a random short-lived correlation ID, and an optional existing request ID. No tokens, URLs, input, content, or raw provider errors. It reuses existing logging and rate-limit components, with a separate global budget.
- Reuse the logger's rotating file sink in isolated persistent Docker volumes. Proxy timing metadata excludes query strings. No database or collector is added.

## Risks / Trade-offs
- Client events are untrusted and delivery can fail on the same broken network → rate-limit/validate them, distinguish them from authoritative server records, and never claim full coverage.
- Shared chunk ownership can affect lazy renderers → build and real-browser first/repeated-use checks.
- Extra diagnostics could affect login → fire-and-forget, no retries, bounded page budget, exceptions ignored.
- Cross-border routing may still stall before HTML/CSS or beyond application timeouts → validate available domestic measurements separately from simulated weak networks.

## Migration Plan
Merge the verified auth fix, test the combined performance candidate, build immutable images, deploy staging, run focused acceptance, and promote the same image digests through the existing protected workflow. Use its recorded prior digest for rollback. Log volumes survive image replacement; no data migration is required.
