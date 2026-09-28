## ADDED Requirements

### Requirement: Independent local workspace
The repository SHALL start a Standard workspace on loopback with its own persistent database, files and secrets, without loading Musuw production configuration or deploying to a server.

#### Scenario: Start and restart
- **WHEN** the developer starts and restarts the Peter local environment
- **THEN** saved users, models and agents remain available, and the public product's services and data remain untouched.

### Requirement: Complete applicable native agent configuration
Peter SHALL be able to create, edit, copy, delete and converse with custom agents, and configure all native settings applicable to their mode and selected resources through the browser. These include prompts, chat/rewrite/rerank models, generation parameters, iteration limits and timeout, knowledge scope, retrieval/FAQ/fallback rules, history and memory, web search, attachments, suggestions, tools, MCP and skills/sandbox selection. The global settings menu SHALL retain only the existing everyday settings, model management, memory, MCP and existing IM/embed entry points. Billing, knowledge marketplace, workspace administration and infrastructure settings SHALL be hidden, including direct-link access. This UI boundary SHALL NOT weaken server authorization.

#### Scenario: Persist and reopen configuration
- **WHEN** an administrator saves a fully configured agent and reloads the editor
- **THEN** the saved settings remain intact and the subsequent conversation uses the selected model, prompt and supported execution settings.

#### Scenario: Mode and prerequisites
- **WHEN** a setting requires smart reasoning, a knowledge source or an external provider
- **THEN** its native prerequisite and setup behavior remains effective; unavailable providers are not represented as successful execution.

### Requirement: Standard built-in customization
Standard tenant administrators SHALL be able to update native built-in agent configuration and read the same effective configuration through both list and detail APIs. Built-ins SHALL remain undeletable. Lite platform modes SHALL retain their existing immutable behavior.

#### Scenario: Tenant isolation and copy
- **WHEN** an administrator customizes a built-in agent then copies it
- **THEN** the copy preserves the effective configuration, other tenants retain their own defaults, and unauthorized roles cannot update the original.

### Requirement: Browser model management
Authorized users SHALL be able to configure supported chat, embedding, rerank, vision and transcription providers in the native browser model manager, including provider address, credentials and model settings. Model credentials SHALL stay in the server-side credential system and SHALL NOT be returned as plaintext by normal configuration reads.

#### Scenario: Configure and use a chat model
- **WHEN** Peter adds a model in the browser, selects it in an agent and sends a message
- **THEN** the backend calls the configured endpoint with that model and the saved agent settings.

#### Scenario: Missing private model
- **WHEN** a Standard agent has no configured chat model
- **THEN** it remains explicitly unconfigured and receives actionable validation instead of silently binding a Musuw platform model.

#### Scenario: Invalid connection
- **WHEN** a connection test cannot reach or authenticate to the configured provider
- **THEN** the browser reports failure and does not imply the provider has been successfully verified.
