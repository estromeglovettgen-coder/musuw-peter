## ADDED Requirements

### Requirement: Editable workspace system prompts
The system SHALL allow workspace administrators to read, edit and reset the registered system prompt defaults, persist overrides per workspace and apply them to subsequent generation requests.

#### Scenario: Edit and restore
- **WHEN** an administrator saves a document summary prompt and reloads settings
- **THEN** the saved content is displayed and used by document summary generation; resetting uses the bundled Chinese default.

#### Scenario: Authorization and workspace isolation
- **WHEN** a non-administrator attempts a write or another workspace generates content
- **THEN** the write is denied and another workspace's prompt remains unaffected.

#### Scenario: Template validation
- **WHEN** an unknown template ID, malformed template, overlong content or missing required input is submitted
- **THEN** the request fails with an actionable validation error without altering persisted configuration.

### Requirement: Chinese defaults and unchanged protocols
The system SHALL use Chinese natural language instructions for bundled prompts while retaining machine-readable field names, tool names, placeholders and output contracts.

#### Scenario: Chinese default generation
- **WHEN** an unconfigured workspace reads a prompt or generates content
- **THEN** instructions use Chinese and the original structured parser can consume the output.

### Requirement: Knowledge base content scope takes effect
The system SHALL apply a knowledge base's explicit content scope to both document summaries and Wiki generation, ahead of default breadth and length suggestions while retaining factuality and output contracts.

#### Scenario: Name-only scope
- **WHEN** source content contains a name and other personal information and the knowledge base requires only the name
- **THEN** the model receives that scope as the governing content instruction in summary and Wiki generation.
