## ADDED Requirements

### Requirement: SystemAdmin configures a fixed consumer scene policy
The system SHALL expose exactly the `chat`, `rag`, and `wiki` consumer model scenes through the existing SystemAdmin settings surface. Each scene SHALL have one Free default and an ordered paid option list whose first entry is the paid default. Policy values SHALL resolve only to active, built-in, OpenRouter-backed `KnowledgeQA` models, and invalid policy SHALL NOT widen access.

#### Scenario: Operator saves a valid scene policy
- **WHEN** a SystemAdmin chooses an active platform chat model as the Free default and an ordered set of active platform chat models as paid options
- **THEN** the existing system settings authority persists and audits those values without creating a model-policy table
- **AND** the next scene resolution uses the updated valid policy without a service restart

#### Scenario: Scene policy references an invalid model
- **WHEN** a scene setting references a missing, disabled, non-built-in, non-OpenRouter, or non-`KnowledgeQA` model
- **THEN** the resolver treats that scene policy as invalid and uses the compatibility behavior
- **AND** the invalid value never authorizes a runtime model call

### Requirement: Runtime model selection is server-authoritative and plan-aware
Every platform-owned consumer chat, RAG answer, and Wiki synthesis call SHALL resolve its model through the fixed scene policy before provider invocation. A Free caller SHALL use only that scene's valid Free default. A paid caller SHALL use only an explicitly requested configured paid option or the first configured paid option. UI state, browser storage, request IDs, or knowledge-base fields SHALL NOT bypass this resolution.

#### Scenario: Free caller omits a model
- **WHEN** a Free caller starts a platform-owned chat, RAG answer, or Wiki synthesis without an explicit model ID and the scene policy is valid
- **THEN** the server uses that scene's configured Free default

#### Scenario: Free caller forges a paid option
- **WHEN** a Free caller submits a model ID that is not the scene's configured Free default
- **THEN** the server rejects the request as requiring a paid plan without invoking the model provider

#### Scenario: Paid caller selects an allowed model
- **WHEN** a paid caller submits an active model ID listed in the scene's paid options
- **THEN** the server uses that exact model for the scene call

#### Scenario: Paid caller submits an unconfigured model
- **WHEN** a paid caller submits a platform model ID that is not in the scene's paid options
- **THEN** the server rejects the request as not allowed for that scene without invoking the model provider

#### Scenario: Policy is absent during rollout or rollback
- **WHEN** the requested scene has no complete valid policy
- **THEN** the server ignores the policy values and any explicit model candidate and uses only the deterministic pre-change server default
- **AND** it does not authorize arbitrary paid-catalog models, select a speculative fallback, or change provider credentials

### Requirement: Consumers see paid models as locked options
The consumer scene-options response SHALL expose the valid Free default and configured paid options with server-computed `locked`, `selectable`, default, and effective state. It SHALL omit provider credentials and infrastructure configuration. The existing generic `/models` authorization behavior SHALL remain unchanged.

#### Scenario: Free user opens a model selector
- **WHEN** a Free user opens the chat/RAG/Wiki selector for a valid scene policy
- **THEN** the Free default is selectable and effective
- **AND** configured paid options remain visible with `locked=true` and `selectable=false`

#### Scenario: Free user clicks a locked model
- **WHEN** a Free user clicks a locked paid option
- **THEN** the selection remains unchanged and the existing plans experience opens

#### Scenario: Paid user opens a model selector
- **WHEN** a paid user opens a scene selector
- **THEN** every valid configured paid option is selectable
- **AND** no unconfigured or credential-bearing model metadata is returned

### Requirement: Existing model consumers outside V1 retain their authority
The new resolver SHALL apply only to platform-owned interactive chat, retrieval-assisted answer generation, and Wiki synthesis. Existing custom-agent models, knowledge-base Embedding, Rerank, VLM, ASR, ingestion, taxonomy, FAQ, IM, evaluation, debugging, and other internal bindings SHALL retain their current configuration and authorization paths. Existing request-scoped title and query-understanding behavior SHALL continue to inherit the resolved platform answer model.

#### Scenario: Knowledge base uses its existing embedding model
- **WHEN** documents are ingested or searched after scene policy is enabled
- **THEN** the knowledge base's existing Embedding and Rerank bindings are used unchanged

#### Scenario: Custom agent runs after scene policy is enabled
- **WHEN** a Standard/custom agent executes with its own configured model
- **THEN** the scene resolver does not override that custom-agent model

#### Scenario: Platform answer generates supporting calls
- **WHEN** a platform chat or RAG request resolves a scene model and performs query understanding or title generation through the existing request-scoped path
- **THEN** those supporting calls continue to use the already resolved answer model
- **AND** no additional configurable scene or provider-failure fallback is introduced

#### Scenario: Wiki lifecycle reaches both synthesis phases
- **WHEN** Wiki ingest processing or Wiki finalize processing needs a synthesis model
- **THEN** both entry points use the same `wiki` scene resolver contract
- **AND** neither path can bypass the configured scene policy

### Requirement: Consumer preferences reuse existing state
The composer and consumer settings surface SHALL reuse one model-selector component and MAY remember one candidate per scene in the existing browser settings store. Remembered state SHALL be treated only as a request candidate and SHALL be replaced when it is no longer present in the latest valid scene options. Wiki SHALL reuse its existing knowledge-base synthesis model field for a durable accepted candidate. No new user-preference table SHALL be introduced.

#### Scenario: Remembered paid model is removed by an operator
- **WHEN** the latest scene options no longer contain a browser-remembered paid model
- **THEN** the browser replaces it with the current paid default before the next request
- **AND** a forged stale direct request remains subject to server rejection

#### Scenario: User changes devices
- **WHEN** a user opens Musuw on a device without a remembered scene choice
- **THEN** the server-provided scene default is used
- **AND** runtime authorization remains identical to a device with browser-local memory
