## ADDED Requirements

### Requirement: Provisioned accounts use isolated native workspaces
The system SHALL create independent accounts and personal tenants through native password hashing/authentication, support custom credentials and simple generated names/password formats, and show generated passwords only after the creation transaction commits. Every managed account SHALL default to Taylor and automatically select the shared read-only course KB without manual @.

#### Scenario: Two users after initial login
- **WHEN** two newly provisioned users log in
- **THEN** both can read the shared course and use Taylor, while neither can read or mutate the other's sessions, targets, personal files or memory

#### Scenario: Shared course write attempt
- **WHEN** a normal account attempts to edit/delete course sources, Wiki or graph, including through agent tools
- **THEN** native authorization denies the write without changing the shared course

### Requirement: Creation has transactional failure behavior
The system SHALL commit account, default resource access and initial package together, reject conflicting duplicate identifiers, and retry operation IDs without creating extra accounts or exposing previously returned passwords.

#### Scenario: Resource or grant preparation fails
- **WHEN** account creation cannot prepare its resources or initial allowance
- **THEN** no partially usable paid account is reported as successfully created and the operator receives a retryable error
