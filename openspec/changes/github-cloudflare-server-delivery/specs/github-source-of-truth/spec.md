## ADDED Requirements

### Requirement: Private active-source monorepo

The product source of truth SHALL be the private GitHub repository
`estromeglovettgen-coder/musuw`. Its clean baseline SHALL contain the active
Musuw source under `weknora/`, `auth/`, and `storefront/`, the required
`integration/` runtime composition, release/verification scripts, tests,
documentation, licenses, and provenance records. A release workflow MUST build
only from a commit that exists in this repository.

#### Scenario: Clean baseline is authoritative

- **WHEN** a maintainer inspects the repository remote and active-source
  manifest
- **THEN** the canonical repository is private `estromeglovettgen-coder/musuw`
  and every production source path is mapped to a tracked path in that repo
- **AND** no alternate `knowledge` checkout is referenced as a production
  source of truth

### Requirement: Active-source baseline excludes local and secret state

The tracked baseline and all release archives SHALL exclude credential values,
private keys, local environment files, dependency directories, generated build
output, runtime directories, database/object-store dumps, logs, and unrelated
historical copies or binaries. Safe examples, lockfiles, source-license
notices, and provenance records SHALL remain tracked.

#### Scenario: Boundary scan rejects excluded artifacts

- **WHEN** the repository boundary and secret checks run against the index and
  a candidate release archive
- **THEN** they fail if an excluded credential, key, runtime state, generated
  dependency/output directory, dump, log, or unexpected binary is present
- **AND** they pass for the approved active-source baseline and its example
  configuration files

### Requirement: CI verification gates production publication

The root GitHub Actions workflow SHALL run the frontend, auth shell,
storefront, backend/document-reader, composition/topology, source provenance,
and secret-boundary checks for every pull request and `main` push. A
release workflow MUST refuse to publish a commit whose required checks are
missing or failed.

#### Scenario: Failed required check blocks publication

- **WHEN** a pull request or release candidate has a failing test, build,
  topology, provenance, or secret-boundary check
- **THEN** the workflow marks the candidate failed and no Cloudflare or server
  production job starts

#### Scenario: Successful CI run is release-eligible

- **WHEN** every required check succeeds for a reviewed commit
- **THEN** GitHub records the full commit SHA and immutable CI run identifier
- **AND** that CI run is the only automatic input to the target-specific
  delivery workflows

### Requirement: Releases use immutable commit identity

Production delivery SHALL require an exact full Git commit SHA. A workflow
MUST verify that the requested SHA exists on `main`, build the production app
and frontend images from that SHA, and publish only the returned immutable GHCR
digests. It MUST NOT deploy a branch name, mutable ref or unverified working
tree as the release identity.

#### Scenario: Mutable ref is rejected

- **WHEN** an operator dispatches a production workflow with only a branch name
  or an unknown SHA
- **THEN** the workflow fails before artifact transfer or target deployment

#### Scenario: SHA is recorded with the target

- **WHEN** a reviewed commit is selected for deployment
- **THEN** the release record records the repository, full SHA, workflow run,
  source/provenance version and artifact checksums

### Requirement: Product automation has one release authority

The root workflows in `estromeglovettgen-coder/musuw` SHALL be the only product
CI and release authority. Vendored or historical upstream workflows MUST NOT
publish Musuw application images, storefront Workers, or server releases.

#### Scenario: Nested workflow cannot publish product output

- **WHEN** a commit contains upstream workflow files under a vendored subtree
- **THEN** those workflows are disabled, relocated, or scoped so they cannot
  deploy `musuw-site`, the Musuw server, or a production image
- **AND** the root workflow remains the only job with target deployment
  credentials
