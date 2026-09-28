## Why

Musuw currently records only derived index bytes in `tenant.storage_used`, even when a knowledge row owns a durable original file in `file_size`. This undercounts customer usage, lets uploads cross the advertised plan boundary, and releases too few bytes on deletion. Staging evidence from a completed video confirms that `storage_size` excludes the original rather than already containing it, so adding the two fields is required and will not double-count.

## What Changes

- Define one authoritative contribution for every active knowledge row as non-negative `file_size + storage_size`; keep the two fields separate only for diagnostics.
- Use the existing `tenant.storage_used` aggregate and adjustment path for durable source creation, index creation or replacement, cloning, and single, batch, or knowledge-base deletion.
- Admit source uploads and later index creation against the same effective plan quota, including an exact-boundary rule, failed and nullable rows, and upgraded plan limits.
- Backfill existing tenant aggregates from existing non-deleted knowledge rows with `COALESCE(file_size, 0) + COALESCE(storage_size, 0)` in the existing PostgreSQL and SQLite migration streams.
- Keep document reparsing source-neutral: replacing derived indexes releases and reapplies only the index component while the retained original remains counted once.
- Leave FAQ mutation and indexing accounting unchanged from upstream WeKnora 0.7.2 for Standard; Lite rejects FAQ creation and mutation through its product gate.
- Keep API, settings, billing, operations, and plan-comparison surfaces on the existing `tenant.storage_used` authority; do not add a storage table, ledger, queue, object-store scan, or second state machine.

## Capabilities

### New Capabilities

- `knowledge-storage-accounting`: Defines the authoritative source-plus-index storage formula, quota admission, lifecycle deltas, historical reconciliation, and consumer-facing usage contract.

### Modified Capabilities

None.

## Impact

- Knowledge creation and processing services, including durable uploaded and materialized remote/social source files, derived document indexes, cloning, reparsing, manual cleanup, and deletion paths. FAQ mutation/index accounting is explicitly out of scope.
- Tenant storage repository semantics and PostgreSQL/SQLite migration contracts.
- Existing entitlement, settings, operations, and documentation consumers of `tenant.storage_used`; their public field shape remains unchanged.
- Focused unit/integration/race tests, migration/static contracts, browser quota acceptance, and the immutable staging-to-production release gate.
