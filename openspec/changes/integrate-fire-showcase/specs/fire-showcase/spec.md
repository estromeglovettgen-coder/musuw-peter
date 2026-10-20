## ADDED Requirements

### Requirement: Reused authenticated workbench
The system SHALL expose 展示面 below 智能体 using the existing source workbench and generation implementation, with native Fire authentication and server-only provider credentials.

#### Scenario: Ordinary user enters tool
- **WHEN** an authenticated ordinary user clicks 展示面
- **THEN** the existing reference composition and free creation workbench opens without a second login or model selection.

### Requirement: Private user data
The system SHALL isolate references, task snapshots, images, browser drafts and history by the verified native account. Trusted bridge headers MUST NOT be accepted from public callers.

#### Scenario: Cross user reference or result
- **WHEN** user B requests user A's asset or task, including a copied identifier or forged owner header
- **THEN** the request is denied and A's content is not returned or reused from browser cache.

### Requirement: Plan and individual image allowances
Administrators SHALL configure nonnegative image allowances in plans, signup overrides and individual account changes, topups and renewals. Zero MUST mean no allotted images; existing token and question limits MUST keep their original behavior.

#### Scenario: Ten image plan
- **WHEN** an administrator creates an account with ten images
- **THEN** the account can receive at most ten images in that period unless explicitly adjusted, independent of chat question count.

### Requirement: Atomic and recoverable image accounting
The system SHALL reserve one image before each real provider submission and settle once when its saved image is available. Definite failure SHALL release the reservation; uncertain submissions SHALL remain pending and SHALL NOT automatically resubmit.

#### Scenario: Concurrent final image
- **WHEN** two different tasks compete for one remaining image
- **THEN** at most one task can submit and retries of its accounting do not consume a second image.

#### Scenario: Unknown provider outcome
- **WHEN** a submitted task loses its provider response
- **THEN** it remains pending without automatic generation retry, and an administrator can explicitly reconcile the held image.

### Requirement: Real production acceptance
The release SHALL preserve courses, user data, snapshots and original parsing configuration, and SHALL verify real generation under an isolated ordinary account before claiming completion.

#### Scenario: Four reference composition
- **WHEN** the ordinary account uploads a face reference of an Asian adult and separate outfit, pose and background references and generates one image
- **THEN** the result is visible and downloadable, image usage increases exactly one, question usage does not change, and another user cannot read its files.
