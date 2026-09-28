# Verification Report: operations-complimentary-plans

Verified locally on 2026-08-30 (America/Phoenix). No production tenant,
Paddle object, provider key, payment, refund, deployment, or external account was
mutated for this evidence.

## Result

- Complimentary access is a separate tenant-row overlay with only plan,
  expiration, and replay-safe grant ID. Paddle-owned plan, status, customer,
  subscription, transaction, billing-period, and cursor fields remain untouched.
- SystemAdmin may grant Plus, Pro, or Max only to an underlying Free,
  Paddle-unbound tenant until an exact future RFC3339 instant. A verified Paddle
  activation wins atomically; an expired or revoked grant resolves to Free.
- Grant, replay, revoke, expiration, monthly credit refresh, and Paddle takeover
  reuse the existing entitlement repository/service and one OpenRouter child key.
  There is no second ledger, scheduler, provider key, or general-purpose plan
  editor.
- Operations UI, API, and loopback proxy require the existing tenant-management
  capability, strict payloads, CSRF, explicit grant/revoke action buttons, and
  dedicated audit actions. Generic tenant PATCH still cannot change plan fields.

## Bounded adversarial review

The review tried to disprove the result across Paddle ordering, provider
overgrant, expiration, replay, authorization, rollback, and unnecessary
complexity. Three blocking defects were reproduced and corrected:

- Storage admission now recalculates the effective quota from the tenant row
  after acquiring its transaction lock, so an upload started before revoke or
  expiration cannot commit using a cached complimentary quota.
- Every provider-limit mutation goes through one convergence helper. It reads
  the durable target before the provider write and verifies it afterwards, so a
  concurrent Paddle activation or newer grant wins instead of leaving a stale
  higher limit.
- Repository business conflicts use one typed sentinel. Handlers and services
  return conflict/not-found only for classified domain outcomes; database and
  infrastructure failures remain retryable server errors.

Focused race tests cover the locked-storage boundary and a deliberately blocked
provider write superseded by Paddle. The latter observed the old target followed
by the paid target and finished at the durable winner.

## Fresh automated evidence

- `env -u LOG_FORMAT go test ./... -count=1` passed the complete Go suite.
- `go test -race -count=1` passed the affected types, repository, service,
  handler, and router packages; `go vet` passed the same package set.
- Operations proxy and complimentary-plan frontend contract tests passed 31/31.
- The WeKnora frontend passed 720/720 tests, Vue type-check, and production
  build. The build emitted only the existing large-chunk warning.
- SQLite migration up added exactly the three nullable columns; down restored
  the original `id`-only fixture. PostgreSQL/SQLite migration contract tests
  passed in the Go suite.
- `openspec validate operations-complimentary-plans --strict` and
  `git diff --check` passed.

The host exports `LOG_FORMAT=json`; the unchanged Feishu logger test interprets
that value as a literal template and fails even in isolation. Removing that
ambient override made the complete suite pass. This is an environment-specific
test-harness condition, not an entitlement regression.

## Remaining boundaries

- Application authorization expires exactly and fails closed. The physical
  provider limit converges lazily on the next entitlement read/use; the key is
  never exposed and inference cannot bypass that check.
- The tenant database and external provider cannot commit atomically. The
  durable-target pre/post check closes the reproduced stale-write race, but a
  process failure at the final cross-system boundary can still leave a narrow
  temporary mismatch. Every subsequent use rechecks and converges before
  inference; eliminating the window completely would require a transactional
  outbox/versioned provider protocol that is intentionally outside this minimal
  change.
- Dedicated grant/revoke records use the existing best-effort platform audit
  service. This bounded change does not add a transactional audit ledger or
  outbox.
- Authorization deliberately reuses the existing `system_tenants_manage`
  capability; it does not introduce a second complimentary-grant role.
- PostgreSQL migration 93 was applied successfully to the isolated TEST
  instance and the three columns were verified at schema version `93|f`.
  Production remains untouched; deployment must preserve the existing
  migration-before-binary ordering.
