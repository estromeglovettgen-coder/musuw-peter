## ADDED Requirements

### Requirement: Fast host-mode development
The project SHALL provide a supported local development command that runs the application server and both frontend development servers on the host and does not require a full application image build for ordinary code edits.

#### Scenario: Developer starts local development
- **WHEN** a developer invokes the documented Musuw development command
- **THEN** the command SHALL start host-mode application processes and only the explicitly required dependency services

### Requirement: Verified release workflow
The project SHALL provide a release command that publishes a verified source build without transferring local credentials and SHALL retain a rollback path for a failed runtime verification.

#### Scenario: Developer releases a verified visual change
- **WHEN** local checks and browser acceptance have passed and the developer invokes the release command
- **THEN** the command SHALL publish the release through the existing staged deployment workflow and report runtime verification or rollback failure honestly
