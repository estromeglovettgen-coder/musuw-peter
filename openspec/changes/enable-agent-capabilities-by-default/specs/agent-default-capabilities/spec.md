## ADDED Requirements

### Requirement: New editor-created agents enable attachment capabilities
The Musuw agent editor SHALL enable image upload, audio upload, and attachment image understanding for each newly created custom agent, and SHALL bind usable default VLM and ASR models through the current edition's existing model-selection authority.

#### Scenario: Standard creates an attachment-ready agent
- **WHEN** a Standard user opens the create-agent editor with active default VLLM and ASR models
- **THEN** image upload, audio upload, and attachment image understanding are enabled and the default model IDs are selected before save

#### Scenario: Lite creates an attachment-ready agent
- **WHEN** a Lite user opens the create-agent editor
- **THEN** the editor uses the effective `rerank`, `vision`, and `asr` consumer-scene model IDs while keeping model-management controls hidden and keeping default knowledge search runnable

### Requirement: New editor-created agents enable web retrieval
The Musuw agent editor SHALL enable web search and web-page fetching for each newly created custom agent, SHALL retain the existing default result/fetch limits, and SHALL use existing tenant default-provider resolution when no provider is explicitly selected.

#### Scenario: Default provider is used
- **WHEN** a new agent is saved without an explicit web-search provider ID
- **THEN** its web-search and web-fetch flags are enabled and runtime provider resolution uses the tenant's default provider

#### Scenario: Page fetching is disabled independently
- **WHEN** an existing agent keeps web search enabled but disables web-page fetching
- **THEN** runtime registers `web_search` without registering `web_fetch`, and the editor preview shows the same effective tool set

### Requirement: New smart agents select every Tool Configuration tool
The Musuw agent editor SHALL seed each newly created smart-reasoning agent with every tool identifier displayed in the existing Tool Configuration UI, including reasoning, RAG, database, Wiki read, Wiki write, Wiki issue, and data tools, and SHALL retain the regular `search_conversations` capability used by built-in Smart Reasoning.

#### Scenario: Full visible tool selection
- **WHEN** a user creates a smart-reasoning agent
- **THEN** every Tool Configuration checkbox is selected in the saved allowlist

#### Scenario: Missing dependency remains fail-closed
- **WHEN** a selected tool requires a KB capability, permission, provider, or model that the current request does not have
- **THEN** existing UI and runtime capability checks keep that tool inactive instead of bypassing the dependency

### Requirement: Sandbox, Skills, and governed Memory remain excluded
The default tool allowlist MUST NOT contain Sandbox filesystem tools, shell execution, Skill read/execution tools, or `search_memory`; Sandbox and Skills SHALL remain disabled and Memory search SHALL continue to follow its existing workspace, user, and agent gates.

#### Scenario: Lite receives the new defaults
- **WHEN** a Lite user creates or runs an agent with the new default policy
- **THEN** no Sandbox or Skill capability is stored, exposed, or registered while the regular selected tools remain available subject to their normal gates

### Requirement: Existing agents retain saved configuration
The system SHALL apply the new capability policy only to the create-agent flow and SHALL NOT bulk-rewrite or infer enablement for an existing persisted agent.

#### Scenario: Explicitly disabled existing agent is edited
- **WHEN** an existing agent with upload, web retrieval, or tool entries disabled is opened and saved without changing those entries
- **THEN** the persisted disabled choices remain disabled

#### Scenario: Deployment requires no data migration
- **WHEN** the release is applied to an existing or empty database
- **THEN** schema migration state remains unchanged and only agents created after the release through the editor receive the new defaults

### Requirement: Default Wiki mutation tools remain caller-authorized
Selecting Wiki mutation tools by default SHALL NOT grant write access. The
runtime SHALL derive an ephemeral writable-KB scope from the authenticated
session tenant, user, tenant role, and effective KB share permission for each
request. Own-tenant Agent writes SHALL use the conservative product rule:
Admins may write tenant KBs, while Contributors may write only KBs they created. Wiki
reads MAY use the full authorized search scope, but Wiki mutations MUST be
omitted for viewers, non-owner Contributors, unknown/not-shared scopes, or
permission/ownership lookup errors.

#### Scenario: Own-tenant roles retain ownership boundaries
- **WHEN** a Viewer or a Contributor who did not create an own-tenant Wiki KB uses an agent that searches that KB
- **THEN** the agent keeps authorized Wiki reads and receives no mutation scope for that KB

#### Scenario: Shared viewer uses a source-tenant agent
- **WHEN** a caller runs a shared agent whose execution context is switched to the source tenant and the caller has viewer permission on the source Wiki KB
- **THEN** the agent keeps Wiki read tools and receives no Wiki mutation tool

#### Scenario: Shared editor receives an exact write scope
- **WHEN** a caller has effective editor or admin permission on only some Wiki KBs in a mixed search scope
- **THEN** Wiki mutation tools are constrained to exactly those writable KB IDs

### Requirement: Agent terminal failures remain visible
When an Agent request terminates with an error before producing a stream event,
the main and embedded chat surfaces SHALL retain a persistent, accessible
Musuw-styled error message instead of rendering an empty assistant row.

#### Scenario: Provider setup rejects a request
- **WHEN** the stream emits a terminal Agent error before an answer event
- **THEN** the chat row exposes the mapped user-facing error with `role="alert"` and does not mount an empty Agent timeline

### Requirement: Presettable settings are inventoried without implicit changes
The delivery SHALL include a decision-ready inventory of settings that Musuw can preseed, force, or hide across the agent editor, knowledge-base editor, and bottom-left settings area. Each entry SHALL identify its current default or source, Lite and Standard/role visibility, enforcement capability, and material cost or risk. Compiling this inventory SHALL NOT change any setting whose desired policy has not been explicitly decided.

#### Scenario: Product owner reviews the inventory
- **WHEN** the product owner opens the delivered inventory
- **THEN** agent, knowledge-base, and bottom-left settings are grouped and traceable to their current implementation, with a blank decision field for future policy choices

#### Scenario: Undecided settings remain unchanged
- **WHEN** a configurable field is listed but has no explicit product decision
- **THEN** the runtime and persisted default for that field remain unchanged by this change
