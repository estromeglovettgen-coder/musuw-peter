## ADDED Requirements

### Requirement: Native skill configuration is accessible
Peter administrators SHALL manage native skills and named sandbox configurations through the browser, and members SHALL retain native personal credential controls and permission restrictions. Unrelated billing and marketplace surfaces MUST remain hidden.

#### Scenario: Configure a skill-capable agent
- **WHEN** an administrator installs a valid skill into the default sandbox and selects it for a smart-reasoning agent
- **THEN** the saved selection survives reload and the deployed runtime can load that skill and execute its script

#### Scenario: Insufficient permissions
- **WHEN** a non-admin attempts to modify sandbox infrastructure or install a workspace skill
- **THEN** the native backend rejects the unauthorized operation

### Requirement: Persistent and isolated deployment
The Peter deployment SHALL replace the target host's obsolete business contents under explicit user authorization, keep its own databases/credentials/files durable, and restore service after process or server restart.

#### Scenario: Restart recovery
- **WHEN** Peter services restart after a conversation creates an artifact and saves agent/customer settings
- **THEN** login, configuration, conversation history and authenticated artifact download still work, with no new credential entry required

#### Scenario: Authorized host reset
- **WHEN** the old target-host business contents are removed
- **THEN** no backup of those contents is created, operating system and SSH access remain functional, and no other host is changed

### Requirement: Real model and sandbox acceptance
Acceptance SHALL use the authorized DeepSeek model for actual reasoning and MUST distinguish fixtures from real model output. Sandbox scripts MUST execute within the native isolated environment and return files through the normal application flow.

#### Scenario: Attachment to downloadable artifact
- **WHEN** a user gives an enabled agent a small CSV and requests a calculation through an installed skill
- **THEN** the tool trace shows actual execution and the downloaded result matches an independently known expected value

#### Scenario: Script failure and recovery
- **WHEN** a script fails or exceeds its execution limit
- **THEN** the user receives an explicit failure and can successfully run a subsequent valid request

### Requirement: Customer and knowledge workflows are usable
The deployed product SHALL support the existing customer template, status/tag, upload, context-bound chat, knowledge search, Wiki and graph workflows using actual uploaded evidence.

#### Scenario: Customer creation from template
- **WHEN** a user applies a saved template, adds customer information and uploads a supported chat record
- **THEN** saved fields and processing configuration match the selected template and uploaded content becomes available for that customer's analysis

#### Scenario: Customer context isolation
- **WHEN** separate conversations are bound to two customers with distinct facts
- **THEN** each uses the selected customer's context and unauthorized rebinding or foreign resource access fails

#### Scenario: Knowledge ingestion and navigation
- **WHEN** supported documents are uploaded and processed
- **THEN** search/filter reflect those documents, grounded answers can cite them, Wiki/graph use the generated data, and the selected tab matches the content after refresh and navigation

### Requirement: Delivery claims have fresh evidence
Delivery SHALL record passing scenarios, build/release identity, operational instructions and explicit limits. Known acceptance blockers MUST be fixed before marking the goal complete.

#### Scenario: Unsupported optional provider
- **WHEN** an optional model modality or external integration lacks configuration
- **THEN** the product provides actionable feedback and the report does not claim it was successfully verified
