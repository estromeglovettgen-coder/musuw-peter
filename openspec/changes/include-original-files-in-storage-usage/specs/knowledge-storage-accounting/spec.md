## ADDED Requirements

> Scope boundary: FAQ mutation and indexing accounting is intentionally out of
> scope for this change. Standard keeps the upstream WeKnora 0.7.2 behavior;
> Lite rejects FAQ creation and mutation at its product gate. This change only
> covers document/source and derived-index accounting paths.

### Requirement: Active knowledge has one authoritative storage contribution
The system SHALL define an active knowledge row's storage contribution as the saturating sum of its non-negative `file_size` and non-negative `storage_size`, and SHALL keep `tenant.storage_used` as the sole product-facing aggregate of those contributions.

#### Scenario: Source and index are both present
- **WHEN** an active knowledge row has positive source and index byte components
- **THEN** its contribution equals `file_size + storage_size` without interpreting `storage_size` as already containing the source

#### Scenario: Nullable or invalid legacy component
- **WHEN** either component is null, zero, or negative in persisted legacy data
- **THEN** that component contributes zero and the other non-negative component remains counted

#### Scenario: Failed row retains an owned source
- **WHEN** processing fails after a durable source has been persisted and the knowledge row remains active
- **THEN** the source contribution remains in `tenant.storage_used` until the row is deleted

#### Scenario: Soft-deleted row is excluded
- **WHEN** a knowledge row has been soft-deleted
- **THEN** neither of its components contributes to `tenant.storage_used`

### Requirement: Source materialization enforces the effective quota
The system SHALL pair persistence of a retained original source with its tenant usage delta and SHALL enforce that positive delta against the tenant's effective plan quota under the same tenant serialization boundary.

#### Scenario: Upload reaches the exact boundary
- **WHEN** current usage plus the uploaded source bytes equals the effective quota
- **THEN** the source and knowledge row are accepted and usage equals the quota

#### Scenario: Upload crosses the boundary
- **WHEN** current usage plus the uploaded source bytes exceeds the effective quota
- **THEN** the source contribution is rejected, no knowledge row/counter pair is committed, and any newly saved object is cleaned up

#### Scenario: Paid upgrade expands admission
- **WHEN** the same prospective source exceeds the current plan quota but fits after a verified paid-plan upgrade
- **THEN** the post-upgrade request is admitted using the upgraded effective quota and the same aggregate

#### Scenario: Concurrent sources contend at the boundary
- **WHEN** concurrent positive source deltas cannot all fit within the effective quota
- **THEN** only the deltas that fit commit and the tenant counter never exceeds the quota

#### Scenario: Retained remote source is retried
- **WHEN** a direct file URL or social import has already materialized an owned source and its task is redelivered
- **THEN** the worker reuses that source and does not download, persist, or charge it a second time

### Requirement: Derived index accounting is replacement-safe
The system SHALL update derived usage by the difference between the new and persisted `storage_size`, while leaving an unchanged source contribution counted exactly once.

#### Scenario: First index creation
- **WHEN** a source-only knowledge row successfully creates an index
- **THEN** tenant usage increases by the new index bytes and equals source plus index

#### Scenario: Idempotent worker retry
- **WHEN** a redelivered worker proposes the same persisted index size
- **THEN** the storage delta is zero and usage is not duplicated

#### Scenario: Reparse replaces an index
- **WHEN** reparse releases an old index and creates a new index while retaining the original source
- **THEN** only the index components are removed and added and the original remains counted once throughout

#### Scenario: Index delta crosses quota
- **WHEN** a positive index replacement delta would make authoritative usage exceed the effective quota
- **THEN** the paired row/counter update is rejected and newly created external index material is cleaned up

### Requirement: Clone and delete preserve the aggregate invariant
The system SHALL account a successful independent clone by its full source-plus-index contribution and SHALL release each active row's full contribution exactly once on ordinary single, batch, or knowledge-base deletion.

#### Scenario: Clone copies source and index
- **WHEN** a completed knowledge item is cloned with an independent source object and index data
- **THEN** the destination tenant usage increases by the clone's `file_size + storage_size`

#### Scenario: Clone fails after partial copying
- **WHEN** downstream clone work fails after a destination contribution was committed
- **THEN** the destination row and full usage contribution are removed and newly copied objects are cleaned up

#### Scenario: Single deletion
- **WHEN** an active knowledge item is deleted successfully
- **THEN** its source-plus-index contribution is atomically removed from tenant usage and a repeated delete cannot remove it again

#### Scenario: Batch or knowledge-base deletion
- **WHEN** multiple active knowledge rows are deleted together
- **THEN** the sum of their normalized contributions is released once while unrelated rows remain counted

#### Scenario: Reparse cleanup is not deletion
- **WHEN** cleanup retains the knowledge source for reparse
- **THEN** it releases only the old index component and does not release `file_size`

### Requirement: Historical and consumer views converge on the same authority
The system SHALL reconcile existing tenant counters from active knowledge rows in every supported migration stream and SHALL expose that same `tenant.storage_used` value through API, UI, billing comparison, and operations surfaces.

#### Scenario: Existing PostgreSQL or SQLite tenant is migrated
- **WHEN** the migration encounters active rows containing source-only, index-only, combined, failed, null, and soft-deleted records
- **THEN** the tenant counter equals the normalized source-plus-index sum of only the active rows

#### Scenario: Usage is displayed to a member
- **WHEN** a member opens entitlement, tenant, or usage-and-billing UI after migration or a runtime delta
- **THEN** the displayed used bytes come from `tenant.storage_used` and include both represented components

#### Scenario: Plan comparison evaluates remaining capacity
- **WHEN** upload admission or a plan comparison evaluates storage remaining
- **THEN** it compares the effective quota with the same authoritative `tenant.storage_used` value

#### Scenario: Operations shows diagnostics
- **WHEN** an operator views storage diagnostics
- **THEN** measured usage is the authoritative tenant aggregate while source and index bytes remain separately identifiable diagnostics rather than a second quota authority
