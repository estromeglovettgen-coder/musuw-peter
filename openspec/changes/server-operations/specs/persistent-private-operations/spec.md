## ADDED Requirements

### Requirement: Server owns the operations lifecycle
The existing operations gateway SHALL run independently of the owner's Mac and automatically restart after failure or host reboot.

#### Scenario: Mac disconnects
- **WHEN** the Mac HTTP tunnel is stopped
- **THEN** the server operations process and its database readiness remain healthy
- **AND** reconnecting the tunnel restores the existing browser address.

#### Scenario: Gateway fails
- **WHEN** the owned server gateway process exits unexpectedly
- **THEN** the supervisor starts it again and real user-list reads succeed.

### Requirement: Access remains private and authenticated
The gateway SHALL listen only on server loopback and SHALL preserve its local host, session, CSRF and scoped-route checks. Remote access MUST require the existing SSH authentication boundary.

#### Scenario: Unauthorized network client
- **WHEN** a client lacks SSH access
- **THEN** no public operations listener or route grants it user data.

#### Scenario: Unauthorized HTTP or write request
- **WHEN** a forwarded client lacks a gateway session or sends a cross-origin mutation
- **THEN** the request is rejected before protected data or backend mutation is consumed.

### Requirement: Server runtime preserves credential and data boundaries
Explicit server mode SHALL use protected credential files and the existing read-only database identity. Existing local modes SHALL retain their existing credential source. Unknown modes, missing mandatory configuration and unsafe file permissions MUST fail closed.

#### Scenario: Server starts
- **WHEN** valid protected server configuration is loaded
- **THEN** the gateway does not call macOS Keychain and confirms transaction_read_only is on.

#### Scenario: Unsafe secret
- **WHEN** a secret is missing, is a symlink or is group/world accessible
- **THEN** startup refuses it without exposing its value.

### Requirement: Failed reads recover safely
The operations frontend SHALL retry failed read-only page loads after connectivity becomes available, while preserving operator edits and avoiding concurrent loads. It MUST NOT automatically repeat mutations.

#### Scenario: Failed user list recovers
- **WHEN** a user-list request fails and subsequent reads succeed
- **THEN** the visible error clears and user rows return without a manual page refresh.

#### Scenario: Mutation fails
- **WHEN** a write request fails
- **THEN** automatic read recovery sends no additional copy of that write and retains the form input.

### Requirement: Release evidence is independent and immutable
Operations releases SHALL be built by GitHub from a reviewed CI-green main SHA and deployed through a restricted command with integrity checks and a separate reviewed deployment environment. Application production artifacts and its active revision MUST remain unchanged.

#### Scenario: Untrusted artifact
- **WHEN** checksum, revision or archive paths violate the release contract
- **THEN** deployment rejects the artifact without changing the current release.

#### Scenario: Accepted operations release
- **WHEN** a valid artifact passes review and readiness
- **THEN** the server records its immutable revision and a previous release remains available for rollback.
