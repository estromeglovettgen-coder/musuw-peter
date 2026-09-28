## 1. Baseline and failing contracts

- [x] 1.1 Prove on staging that `storage_size` excludes a retained original file and record the current active-row aggregate without exposing identifiers or secrets.
- [x] 1.2 Add red domain and migration contracts for source-plus-index aggregation, null/negative components, failed rows, and soft-delete exclusion.
- [x] 1.3 Add red repository tests for paired mutation atomicity, exact-boundary admission, rejection, clamp behavior, and concurrent positive deltas.

## 2. Authoritative accounting implementation

- [x] 2.1 Add the single normalized `Knowledge` storage-contribution helper and pair knowledge create/update/delete mutations with `tenant.storage_used` in repository transactions.
- [x] 2.2 Route uploaded, direct-file URL, and social source materialization through paired accounting with cleanup and retry-safe checkpoints.
- [x] 2.3 Make document index finalization replacement-safe, quota-aware, and idempotent while keeping reparse source-neutral. FAQ indexing remains the upstream WeKnora 0.7.2 path and is excluded from this accounting change.
- [x] 2.4 Account independent clones by their full contribution, compensate failed clones, and release full contributions on single, batch, and ordinary knowledge-base deletion without changing strict account erasure.

## 3. Historical and consumer convergence

- [x] 3.1 Add paired PostgreSQL and SQLite backfill/down migrations that recompute active-row usage with normalized source-plus-index components.
- [x] 3.2 Prove entitlement, tenant, billing comparison, settings, and operations continue using `tenant.storage_used` while preserving separate source/index diagnostics.
- [x] 3.3 Update the storage contract documentation and migration/rollback notes without introducing a second usage authority.

## 4. Verification and release

- [x] 4.1 Run focused service/repository/migration tests, Go race/concurrency tests, static contracts, and OpenSpec strict validation.
- [x] 4.2 Run the complete relevant Go tests, frontend type checks/tests, admin contracts, production/staging safety contracts, and application/frontend builds.
- [x] 4.3 Perform one bounded adversarial review, fix current blockers, and rerun only affected verification plus the full release gate.
- [ ] 4.4 Build the corrected SHA once, deploy exact app/frontend digests to staging, and verify backfill, upload increment, aggregate display, failure/null behavior, exact quota boundary, delete release, and upgraded quota in the browser/database.
- [ ] 4.5 Promote the same digest pair to production and prove production remains Paddle Live, staging remains Paddle Sandbox, and their Compose projects, databases, caches, files, and R2 data remain isolated.

## Scope boundary

FAQ creation, copying, and entry mutation are not storage-accounting work in
this change. Standard continues to use the upstream WeKnora 0.7.2 behavior;
Lite's separate product gate rejects FAQ creation and mutation.
