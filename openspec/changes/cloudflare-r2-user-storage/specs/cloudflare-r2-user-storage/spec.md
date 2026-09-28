## ADDED Requirements

### Requirement: User objects use the native R2-backed storage path

Production Musuw SHALL use WeKnora's native S3-compatible provider with the private `musuw-production` Cloudflare R2 bucket for newly created user files. R2 credentials MUST remain in server-owned secret files and MUST NOT be committed, included in release bundles, or printed in logs.

#### Scenario: A new upload is R2-backed

- **WHEN** an authenticated user uploads a supported document after the migration
- **THEN** its stable resource resolves through an S3 backend to an object under `musuw-production/weknora`
- **AND** the object can be read and deleted through the existing Musuw UI

### Requirement: Existing stable resources survive the one-time migration

The migration SHALL copy every existing server file before switching storage bindings. Existing `resource://` handles MUST remain unchanged while their physical paths, backend IDs, provider fields, and location hashes are updated consistently.

#### Scenario: An existing document remains readable

- **WHEN** a user opens a pre-migration document after the storage switch
- **THEN** the original resource handle resolves to the copied R2 object
- **AND** no active tenant, knowledge base, or resource remains bound to local storage

### Requirement: Obsolete R2 data is removed

The obsolete `musnow-production` bucket and its contents MUST be deleted before task completion, leaving `musuw-production` as the product bucket.

#### Scenario: R2 inventory is clean

- **WHEN** the Cloudflare R2 inventory is inspected after migration
- **THEN** `musnow-production` is absent
- **AND** `musuw-production` contains the migrated active objects

### Requirement: Successful releases reclaim unused images

After both production containers pass health checks and the serving pointer is activated, the release helper SHALL prune unused Docker images so immutable releases do not exhaust the host disk. It MUST NOT remove running images or data volumes.

#### Scenario: Healthy release performs bounded cleanup

- **WHEN** a release passes all health and revision checks
- **THEN** unused Docker images are pruned once
- **AND** running containers and named volumes remain intact
