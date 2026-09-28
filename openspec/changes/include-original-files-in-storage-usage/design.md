## Context

`Knowledge.FileSize` records owned source bytes and `Knowledge.StorageSize` records the derived index estimate. The product exposes `Tenant.StorageUsed` as the single usage authority to entitlement, settings, billing comparisons, and operations, but every current runtime delta adds or removes only `StorageSize`. A completed staging video proves that the fields are disjoint: its original object bytes appear only in `file_size`, while `storage_size` contains the derived result.

Storage mutations span uploads, direct-file and social materialization, asynchronous document indexing, cloning, reparsing, and three ordinary deletion paths. Their quota reads and tenant updates are currently separate, so concurrent positive deltas can both pass before either acquires the tenant repository lock. Existing rows also need reconciliation. The implementation must preserve the user's unrelated Storefront and WeKnora UI changes and must not introduce a ledger, scanner, queue, or second usage field.

## Goals / Non-Goals

**Goals:**

- Make the contribution of an active knowledge row exactly the saturating sum of its non-negative source and index components.
- Keep `tenant.storage_used` as the only product-facing aggregate and keep `file_size` and `storage_size` as diagnostic components.
- Pair each knowledge-row mutation and its tenant usage delta in one database transaction, with quota enforcement under the existing per-tenant serialization point.
- Make retries and document-index replacement delta-based, preserve one source charge during reparse, and release the full contribution on ordinary deletion.
- Reconcile existing PostgreSQL and SQLite tenants from active knowledge rows and retain the existing API/UI shapes.

**Non-Goals:**

- Measuring extracted images, provider metadata, temporary chat attachments, or any object not represented by the two existing knowledge fields.
- Scanning R2 or local files, adding a storage ledger/table, changing plan sizes, or creating a reconciliation worker.
- Charging passage/manual text as `file_size`; those sources continue to contribute only the derived `storage_size` recorded by the existing pipeline.
- Changing FAQ mutation or indexing accounting; Standard keeps the upstream WeKnora 0.7.2 behavior and Lite blocks FAQ creation/mutation through its product gate.
- Changing strict account-erasure accounting; that flow hard-deletes the tenant and intentionally avoids a retryable counter mutation.

## Decisions

### Put the formula on the knowledge domain object

`Knowledge.AccountedStorageBytes()` returns `max(file_size, 0) + max(storage_size, 0)` with overflow saturation. Every runtime lifecycle path and repository sum uses this helper. `StorageSize` remains index-only; writing a total into it would double-count and break operations diagnostics.

Alternatives rejected: recomputing ad hoc expressions in every service preserves the current drift risk; introducing a third total field duplicates `tenant.storage_used` and needs synchronization.

### Deepen the existing repository seam with paired mutations

The knowledge repository gains explicit create, update, single-delete, and batch-delete operations that pair the row mutation with the `tenant.storage_used` delta in one database transaction. They lock the tenant first, derive the delta from the persisted row and the proposed row, enforce a positive delta against the supplied effective quota, and update the existing counter. The existing tenant adjustment implementation and the paired operations share one internal locked-counter primitive.

This makes exact-boundary admission (`next_used == quota`) valid, rejects only `next_used > quota`, prevents concurrent positive deltas from oversubscribing, and makes row/counter failure atomic. Service code still performs external file/index work outside the database transaction and cleans it up when the paired mutation fails.

Alternatives rejected: a pre-check followed by the existing adjustment remains vulnerable to TOCTOU; reserve-then-create can leak counter reservations after a crash; a new ledger or background reconciler violates the stated constraint.

### Treat every retained direct-file materialization as an owned source

Ordinary uploads already set `FileSize`. TikHub artifacts and direct file-URL downloads are retained for retry/reparse and therefore persist `FilePath` and `FileSize`, use non-temporary storage, and apply a source delta only after the object is saved. A redelivered task reuses the stored checkpoint rather than downloading and charging the source again. Ordinary web-page URLs do not retain a source object and keep `FileSize == 0`.

If paired persistence or quota admission fails, the just-created object is deleted and the knowledge row can retain a failed status without a source contribution. Failed rows whose owned source was successfully persisted remain counted because the bytes still exist and can be retried or deleted.

### Apply only the changed component during processing and reparse

Document index finalization updates `StorageSize` to the newly estimated index size; the repository derives `new contribution - persisted contribution`. A worker retry with the same size therefore has zero delta. Explicit reparse cleanup continues to set only `StorageSize` to zero and release only the prior index component; the retained `FileSize` remains counted once. FAQ indexing is deliberately not changed here: Standard follows upstream WeKnora 0.7.2, while Lite's product gate rejects FAQ creation and mutation.

Cloning copies the owned source and existing index data, then creates the destination row with the full contribution in the paired transaction. A downstream clone failure deletes the destination row through the paired delete and cleans copied objects, so no usage delta or ghost source survives.

### Reconcile existing counters from active rows in migrations

PostgreSQL migration `000092` and SQLite migration `000011` set every tenant counter to the sum over non-deleted knowledge rows. Each component uses `CASE` plus `COALESCE` so null and negative legacy values contribute zero on both dialects. Failed but non-deleted rows participate. The down migrations deterministically restore the former index-only aggregate from the then-current active rows; they cannot restore historical pre-migration counter mistakes and document that limitation.

Fresh schemas need no new column or default because the existing empty aggregate is already zero.

### Keep public consumers on the existing aggregate

Entitlement, tenant, settings, billing comparison, and operations surfaces continue reading `tenant.storage_used`. Operations keeps separate source and index diagnostics. Contract tests assert that no consumer starts recomputing a competing product total and documentation describes the two-component authority.

## Risks / Trade-offs

- [External file or vector work succeeds but the paired database mutation fails] → Delete the new external object/index and leave the persisted row/counter unchanged; log cleanup failures as recoverable orphan risk.
- [A legacy row contains null, negative, or extreme sizes] → Normalize components to zero and saturate runtime sums; migration tests cover null/negative values.
- [Concurrent uploads or workers race at the quota boundary] → Serialize positive deltas by tenant inside the paired transaction and add repository concurrency/race coverage.
- [A clone fails after copying part of its resources] → Paired-delete the destination contribution and run the existing copied-object cleanup.
- [Rollback follows new writes] → Recompute the old index-only view from current active rows; document that the historical undercount itself is intentionally not preserved.
- [The migration reveals tenants already above quota] → Preserve their data and accurate usage; reject only future positive deltas until deletion or upgrade creates room.

## Migration Plan

1. Add red formula, paired repository, concurrency, upload, processing, clone, deletion, reparse, migration, and consumer-contract tests.
2. Implement the domain helper and paired repository mutations, then route all represented lifecycle deltas through them.
3. Add and validate PostgreSQL/SQLite backfills; run focused, race, relevant full, type, build, and browser tests.
4. Build candidate images once, deploy exact digests to staging, verify database backfill plus upload/usage/delete/boundary/upgrade behavior, then promote those same digests to production.
5. Re-prove production Live, staging Sandbox, and data/project isolation.

Rollback deploys the prior immutable image pair and applies the down migration, which recomputes index-only usage from the active rows present at rollback time. No object or knowledge data is removed by migration rollback.

## Open Questions

None.
