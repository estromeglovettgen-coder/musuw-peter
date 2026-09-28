# Verification evidence

## 2026-08-30 implementation and local verification

- The official Paddle SDK adapter reads the complete customer inventory before
  its first write. Active/trialing subscriptions are scheduled for period-end
  cancellation, paused subscriptions are canceled immediately, and terminal,
  already-scheduled, empty, and official-not-found inventory is idempotent.
  Past-due, unknown, malformed, mismatched, and unavailable states fail before
  the local access fence.
- The account-erasure request prepares billing first, then persists the existing
  deletion fence and deterministic maintenance task. The worker retains its
  authoritative terminal Paddle read and therefore does not purge a merely
  scheduled subscription. Existing five-minute housekeeping recovery replaces
  an archived deterministic task with a fresh bounded retry budget.
- A valid queued Paddle lifecycle or renewal task treats only the explicit
  missing-tenant sentinel as an erased-account no-op and does not settle a
  billing operation. Other database, binding, validation, and provider errors
  keep their retry behavior.
- The operations confirmation and bilingual Privacy and Subscription policies
  state that accepted closure stops future renewal, ends Musuw access
  immediately, does not automatically refund a completed payment, and may defer
  final purge until Paddle is terminal.

Fresh checks:

- `go test -race ./internal/application/service ./internal/application/repository ./internal/router ./internal/handler` — pass.
- `go test ./...` and `go build ./cmd/server` in `weknora/` — pass; the linker emitted only its existing duplicate `-lc++` warning.
- `npm test`, `npm run type-check`, and `npm run build` in `weknora/frontend/` — pass; Vite emitted only its existing large-chunk warning.
- `npm test` in `storefront/` — build plus 58/58 tests pass; Vite emitted only its existing large-chunk warning.
- Operations-console gateway tests, source/manifest/secret/credential-registry checks, Paddle IP allowlist tests, production/staging static contracts, and release/staging gate simulations — pass.
- `openspec validate allow-paid-account-deletion --strict` and `openspec validate consumer-plan-entitlements --strict` — pass.
- One consolidated adversarial review found no runtime blocker in multi-subscription validation, partial provider failure and retry, delayed period-end cleanup, late signed webhooks, refund boundaries, or rollback behavior.

## Release boundary

No real production account or subscription is used for deletion acceptance.
Commit, push, immutable staging evidence, full disposable Paddle Sandbox E2E,
and any protected production promotion evidence are recorded only after those
steps actually complete.
