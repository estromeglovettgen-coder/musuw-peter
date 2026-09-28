## ADDED Requirements

### Requirement: Standard hosted delivery execution
CI, Storefront, production authorization, production image construction, and final production deployment SHALL run on pinned standard GitHub-hosted AMD64 Linux. The repository MUST NOT route delivery through a repository variable, local runner, Beijing runner, Tokyo runner, tunnel, VPN, proxy, or second build service.

#### Scenario: Canonical main delivery starts
- **WHEN** a canonical main revision passes CI
- **THEN** every downstream construction and deployment job runs on `ubuntu-24.04` without a self-hosted runner dependency

#### Scenario: Final deployment starts
- **WHEN** both immutable image digests have passed registry validation
- **THEN** a GitHub-hosted job connects directly to Tokyo using the protected SSH key, pinned `known_hosts`, and restricted `musuw-deploy` account

### Requirement: Exact authorized source on hosted construction
Production authorization SHALL prove that the selected full SHA belongs to canonical `origin/main` and has successful CI. Construction and deployment SHALL use official checkout for exactly that authorized SHA, disable persisted credentials where ancestry access is unnecessary, and fail before mutation when `HEAD` differs.

#### Scenario: Authorized source is built and deployed
- **WHEN** authorization emits a CI-green main SHA
- **THEN** build and deploy independently check out and verify that exact SHA without a custom source artifact or ranged downloader

#### Scenario: Source identity differs
- **WHEN** either hosted checkout does not equal the authorized SHA
- **THEN** the job fails before image publication or production mutation

### Requirement: Official Docker construction with scoped cache
The production build SHALL use official Docker setup, login, and build/push actions. The app and frontend images SHALL use distinct GitHub Actions cache scopes with maximum-mode export. Cache export failure MAY be ignored as an optimization failure, but checkout, construction, push, digest validation, and deploy SHALL remain fail-closed.

#### Scenario: Repeated hosted build
- **WHEN** a later authorized SHA reuses unchanged application or frontend layers
- **THEN** each image imports only its own GHA cache scope and exports updated layers to that same scope

#### Scenario: Cache is absent or export fails
- **WHEN** no prior cache exists or the cache backend cannot accept an export
- **THEN** the workflow builds from source and continues only if both pushed images and remote digests validate

### Requirement: Immutable restricted release contract
Production releases SHALL remain serialized and SHALL retain immutable GHCR tags, action-produced digests, remote tag-to-digest equality checks, minimum provenance, OCI source/revision labels, least-privilege package permissions, the isolated production Environment, finite SSH preparation/upload retries, and the restricted exact-SHA server release seam.

#### Scenario: Hosted images pass validation
- **WHEN** both official build actions push immutable tags and each remote tag resolves to its emitted digest
- **THEN** the hosted deploy job receives only the approved `repository@sha256` references and releases them through the existing two-verb server gate

#### Scenario: Construction or direct SSH fails
- **WHEN** checkout, construction, push, digest validation, preparation, upload, or activation fails
- **THEN** the workflow reports failure without introducing an alternate network or deployment path
