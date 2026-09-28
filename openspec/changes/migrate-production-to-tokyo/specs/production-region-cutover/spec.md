## ADDED Requirements

### Requirement: Tokyo host uses the authoritative release interface
The Tokyo runtime SHALL use the existing exact-SHA source bundle, immutable GHCR image digests, checked-in production Compose topology, and forced-command `musuw-deploy` SSH gate. It MUST NOT introduce an unrestricted deployment key, server-side image build, mutable image tag, or parallel release workflow.

#### Scenario: Exact release reaches Tokyo
- **WHEN** the selected full commit SHA has passed CI and its immutable image digests are deployed to Tokyo
- **THEN** the running application and frontend labels, current source pointer, release manifest, and health evidence identify that exact SHA and those exact digests

#### Scenario: Unsafe deployment command is attempted
- **WHEN** the restricted Tokyo deploy account receives an arbitrary command, mutable ref, unsafe path, or unapproved bundle member
- **THEN** the forced-command gate rejects it without changing the current release or runtime data

### Requirement: Host access is least privilege
The Tokyo host SHALL retain a key-only operator path for bootstrap and a separate restricted deployment path for GitHub. Runtime ports MUST bind to loopback, the Cloudflare Tunnel MUST be outbound-only, and no broad Tencent root-account API credential SHALL be required by the migration.

#### Scenario: Public exposure is inspected before cutover
- **WHEN** the Tokyo host socket and Tencent firewall surfaces are inspected
- **THEN** only the approved SSH ingress is public and application, database, cache, graph, search, and frontend ports are unavailable from the Internet

### Requirement: Server-owned secrets remain confidential
Runtime configuration, database credentials, object-store credentials, model credentials, billing credentials, identity credentials, and Tunnel credentials MUST move only over encrypted operator channels, retain restrictive ownership and modes, and remain absent from Git, logs, CI artifacts, command output, and public evidence.

#### Scenario: Runtime files are transferred
- **WHEN** Hong Kong runtime files are streamed to Tokyo
- **THEN** source and destination file inventories and equality checks pass without exposing file values or credential hashes

#### Scenario: Non-root Tunnel reads its token
- **WHEN** the Tokyo Tunnel token is installed for the pinned cloudflared image
- **THEN** the token file is owned by runtime UID/GID `65532`, has mode `0600`,
  is not a symlink, and no installer or contract output contains its value

### Requirement: Stateful data is restored and validated
The authoritative final cutover SHALL restore PostgreSQL, Redis, Neo4j, and required legacy local-file state from a quiesced Hong Kong source. Cloudflare R2 SHALL remain the authoritative object store and its bucket, prefix, resource bindings, and credentials SHALL remain unchanged.

#### Scenario: Rehearsal restore completes
- **WHEN** a rehearsal snapshot is restored before public traffic is enabled
- **THEN** schema migration state, aggregate relational counts, Redis key counts, graph counts, legacy file inventory, R2 reads, and application-level knowledge paths match the recorded source evidence

#### Scenario: Final restore completes
- **WHEN** Hong Kong writers are stopped and the authoritative final backups are restored to Tokyo
- **THEN** no source write can occur after the backup boundary and Tokyo's verified state matches the sealed source manifests before its Tunnel starts

### Requirement: Tokyo remains dark until ready
The Tokyo Cloudflare Tunnel connector MUST remain stopped until exact-SHA release, state restoration, loopback health, authentication, storage, billing preflight, knowledge, chat, graph, and capacity checks pass.

#### Scenario: Rehearsal contains a failure
- **WHEN** any required Tokyo local health, data, security, or capacity check fails
- **THEN** the connector remains stopped, Hong Kong continues serving production, and the migration reports the blocker without partial cutover

### Requirement: Cutover has one writable origin
The migration SHALL ensure that Hong Kong and Tokyo never simultaneously receive public writable application traffic against divergent state. Hong Kong writers and its Tunnel MUST stop before the final restore and Tokyo Tunnel start.

#### Scenario: Public cutover succeeds
- **WHEN** final state is restored and the Tokyo connector starts
- **THEN** `app.musuw.com` serves the healthy Tokyo exact-SHA runtime through the unchanged public interface and the Hong Kong connector remains stopped

### Requirement: Capacity is proven before traffic
Tokyo SHALL have sufficient disk, memory, swap, CPU, and outbound connectivity for the checked-in production topology. The migration MUST stop before cutover if realistic product smoke produces an OOM kill, unhealthy required container, exhausted disk threshold, or unbounded latency caused by host capacity.

#### Scenario: Four-gigabyte host passes capacity gate
- **WHEN** document parsing, knowledge retrieval, chat/tool streaming, Wiki/graph reads, auth, and billing preflight execute on the dark Tokyo runtime
- **THEN** all required containers remain healthy, the kernel records no OOM kill, disk retains the documented safety margin, and measured peak memory remains within host plus swap capacity

### Requirement: Rollback preserves post-cutover writes
Hong Kong SHALL remain intact and recoverable during the observation window. If Tokyo has accepted writes, rollback MUST stop Tokyo public traffic and retain both state sets for operator-led recovery; this migration does not perform or promise a hot reverse-sync, and a traffic flip to stale Hong Kong state is forbidden.

#### Scenario: Rollback before Tokyo accepts writes
- **WHEN** public health fails before any Tokyo write is accepted
- **THEN** Tokyo's connector stops and Hong Kong's verified runtime and connector can resume without a data reverse-sync

#### Scenario: Rollback after Tokyo accepts writes
- **WHEN** rollback is required after Tokyo has accepted production writes
- **THEN** Tokyo public traffic is stopped, Hong Kong remains stopped with its runtime and volumes retained, and an operator-led state restore is required before any Hong Kong traffic resumes

### Requirement: Release target follows the serving host
After public Tokyo health passes, the `server-production` GitHub Environment SHALL point its restricted remote and pinned host key to Tokyo while retaining the existing private deploy key and all other release contracts.

#### Scenario: First post-cutover workflow completes
- **WHEN** an exact-SHA production workflow runs after target rotation
- **THEN** its authorize, upload, digest pull, release, manifest, and health evidence bind to the Tokyo host and the exact selected SHA
