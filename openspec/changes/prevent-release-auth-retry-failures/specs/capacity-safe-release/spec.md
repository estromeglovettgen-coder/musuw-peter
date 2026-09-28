## ADDED Requirements

### Requirement: Full release requires a disk reserve
Before a full source release creates a remote release directory, transfers
source, pulls an image, or starts an image build, the release command SHALL
check the production root filesystem's available capacity against its required
reserve.

#### Scenario: Capacity is below the required reserve
- **WHEN** the production root filesystem reports less free space than the
  configured release reserve
- **THEN** the full release exits with a capacity error and performs no
  release-directory, transfer, Docker pull, or Docker build action

#### Scenario: Capacity meets the required reserve
- **WHEN** the production root filesystem reports at least the configured
  release reserve
- **THEN** the full release may continue through its existing verified path

### Requirement: Existing DocReader image is reused
The full release image build SHALL use the pinned DocReader image already on
the host and SHALL pull it only when Docker image inspection shows it is
absent.

#### Scenario: Pinned DocReader image exists
- **WHEN** the pinned DocReader image is present locally
- **THEN** the build script does not invoke a DocReader image pull

#### Scenario: Pinned DocReader image is absent
- **WHEN** the pinned DocReader image is not present locally
- **THEN** the build script pulls the exact pinned image before staging
