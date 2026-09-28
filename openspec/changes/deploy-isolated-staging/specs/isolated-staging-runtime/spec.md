## ADDED Requirements

### Requirement: Staging has an isolated runtime identity
The system SHALL run `staging.musuw.com` and production as distinct Docker Compose projects on the existing Tokyo host. Staging SHALL use distinct container names, internal networks, PostgreSQL data, Redis data and namespace, file storage, temporary data, runtime directory, secrets directory, and current-release pointer. The only shared application infrastructure SHALL be immutable release source, deliberately shared external edge connectivity, and explicitly approved external provider accounts.

#### Scenario: Both projects are running
- **WHEN** an operator inspects Docker project, container, network, mount, and volume metadata
- **THEN** production is `weknora-v072-production`, staging is `weknora-v072-staging`, and no staging data mount or internal network resolves to a production one

#### Scenario: A staging write occurs
- **WHEN** a staging tenant creates identity-bound application data, cache state, or a file
- **THEN** the write is observable only in staging PostgreSQL, Redis, file storage, and the dedicated R2 test bucket and does not alter production counts or objects

#### Scenario: An external provider identity is mixed
- **WHEN** staging public input names another Supabase project, a non-commissioned R2 bucket, or an OpenRouter workspace different from the server-owned staging pin
- **THEN** runtime preparation fails before Compose starts and no production/default provider resource is used

### Requirement: One immutable image pair serves both environments
For a release SHA, the system MUST build the app and frontend images exactly once, resolve immutable GHCR digest references, deploy those exact references to staging first, and promote the same references to production only after staging acceptance. Neither server project SHALL build an image. A resumed or manual production promotion MUST verify the recorded SHA/digests and the currently running staging SHA/digests instead of rebuilding or trusting a mutable tag.

#### Scenario: Staging deployment succeeds
- **WHEN** CI publishes an authorized full Git SHA
- **THEN** one build produces one app digest and one frontend digest, staging runs both digests with matching OCI revision labels, and no production service is changed yet

#### Scenario: Production promotion succeeds
- **WHEN** all required staging checks are green and promotion is invoked
- **THEN** production runs the exact app/frontend digest pair already proven in staging and both environments report the same full Git SHA

#### Scenario: A digest or revision differs
- **WHEN** the release record, staging container, production input, or OCI revision label does not match
- **THEN** promotion fails before production Compose or its current pointer is changed

### Requirement: Public auth configuration is selected at runtime
The shared frontend image SHALL load a single startup-generated public configuration containing the environment's exact public origin, Supabase URL, Supabase publishable key, and native OAuth client ID. Container deployments MUST require a complete runtime object and MUST NOT fall back field-by-field to build-time values. The browser bundle and generated file MUST NOT contain server credentials.

#### Scenario: Production starts
- **WHEN** the shared frontend digest starts with the production public runtime file
- **THEN** the auth shell trusts only `https://app.musuw.com` and initializes the production Supabase public project coordinates

#### Scenario: Staging starts
- **WHEN** the same frontend digest starts with the staging public runtime file
- **THEN** the auth shell trusts only `https://staging.musuw.com` and initializes the test Supabase public project coordinates

#### Scenario: Runtime config is partial or unsafe
- **WHEN** a required field is absent, whitespace-padded, contains unsafe serialization input, or uses an unapproved origin or URL
- **THEN** startup or the auth shell fails closed and does not reuse a baked or opposite-environment value

### Requirement: Staging is resource bounded and production remains available
Every staging service SHALL have an explicit memory and CPU limit appropriate to the two-CPU, 3.6-GiB Tokyo host. Deployment and verification SHALL observe host memory, swap, OOM, restart, and production health state and SHALL stop if staging jeopardizes production.

#### Scenario: Staging is idle and under test
- **WHEN** staging starts and executes billing and application acceptance
- **THEN** all required staging services remain within their limits, have no OOM kill or unexpected restart, and production health remains green

### Requirement: Staging is routed securely and excluded from indexing
Cloudflare SHALL terminate valid TLS for `staging.musuw.com` and route it through the existing tunnel to only the staging frontend alias. Staging responses for workspace, auth, API, and static surfaces SHALL emit `X-Robots-Tag: noindex, nofollow`. No staging application or data-service port SHALL be publicly bound on the host.

#### Scenario: Public staging routes are probed
- **WHEN** an external client requests health, workspace, auth, API, and a static asset over HTTPS
- **THEN** TLS is valid, the response comes from staging, required noindex headers are present, and host inspection shows no public application or data port

#### Scenario: Cloudflare Access is reused
- **WHEN** the existing Access configuration can protect the staging hostname without another network layer
- **THEN** interactive routes require Access while the exact Paddle webhook path bypasses Access and remains guarded by Paddle signature verification

### Requirement: Secret and environment boundaries fail closed
Production and staging SHALL use separate protected runtime directories and file-backed secrets. Secret files SHALL be regular, non-symlink, non-empty, root-owned mode-0600 files; values MUST NOT be logged, returned, committed, copied into images, or stored in GitHub artifacts. Production and staging SHALL each require `tikhub_api_key` in their own protected secret directory. TikHub preflight and deployment verification SHALL inspect only existence, type, non-emptiness, ownership, and mode; only the app entrypoint may read the mounted value to export `TIKHUB_API_KEY` inside the backend process.

#### Scenario: Runtime preflight inspects secrets
- **WHEN** deployment validates staging or production secret inputs
- **THEN** it reports only safe metadata and rejects a missing, empty, symlinked, permissive, or wrong-owner file without printing its content

### Requirement: Production Live state remains unchanged during staging work
Staging installation and acceptance MUST NOT mutate the production Paddle Live catalog, client token, notification destination, secrets, price mapping, default payment link, data stores, R2 bucket, or money movement settings.

#### Scenario: Isolation is rechecked after staging acceptance
- **WHEN** the operator compares provider and runtime metadata after staging is green
- **THEN** production still resolves one complete Live unit and `musuw-production`, staging resolves one complete Sandbox unit and its test bucket, and no identifier or data store is shared accidentally
