## ADDED Requirements

### Requirement: Fixed native consumer model boundaries
The system SHALL expose exactly five consumer-configurable boundaries: the product-facing Agent Model for final knowledge-backed answer generation through KnowledgeQA, Wiki synthesis through KnowledgeQA, retrieval ordering through Rerank, visual understanding through VLLM, and speech recognition through ASR. The internal key for Agent Model remains `rag` for precise pipeline classification. Standalone Chat and Embedding SHALL NOT be consumer settings.

#### Scenario: Consumer opens model settings
- **WHEN** an authenticated Lite consumer opens Model Settings
- **THEN** the interface shows controls for Agent Model, Rerank, Wiki synthesis, visual understanding, and speech recognition
- **AND** it does not advertise TTS or another unsupported model type
- **AND** it does not show standalone Chat or Embedding controls

#### Scenario: RAG executes all real stages
- **WHEN** a knowledge-backed answer requires vector retrieval and reranking
- **THEN** the platform/KB-owned Embedding model performs query/index vector work, retrieved chunks use the resolved Rerank model when enabled, and final answer generation uses the resolved Agent Model (`rag` scene) KnowledgeQA model

### Requirement: Real type-safe option catalog
The system MUST build consumer options only from active builtin OpenRouter catalog rows whose native model type matches the requested fixed boundary.

#### Scenario: Options endpoint returns a non-LLM boundary
- **WHEN** a consumer requests options for Rerank, VLLM, or ASR
- **THEN** every returned ID exists in the current model repository with the required native type
- **AND** the response contains no parameters, provider configuration, base URL, credential, or placeholder ZIP model ID

#### Scenario: Catalog has only one real model
- **WHEN** a native type has only one eligible builtin OpenRouter row
- **THEN** the selector shows that one real row rather than manufacturing additional choices

### Requirement: Server-authoritative plan enforcement for every boundary
The resolver SHALL remain the only runtime authority for the five consumer-configurable boundaries. Free consumers SHALL use only the configured Free default, paid consumers SHALL use only the ordered configured paid options, and an explicit unconfigured, cross-type, stale, disabled, non-builtin, non-OpenRouter, or forged ID SHALL be rejected before provider invocation.

#### Scenario: Free consumer views paid options
- **WHEN** a valid boundary policy contains a Free default and distinct paid options
- **THEN** the Free default is selectable and effective
- **AND** paid options are returned as visible, locked, and non-selectable

#### Scenario: Paid consumer selects a configured model
- **WHEN** a paid consumer requests an ID in that boundary's ordered paid options
- **THEN** the resolver returns the matching real catalog model

#### Scenario: Invalid policy cannot expand access
- **WHEN** either policy setting is missing, malformed, duplicated, stale, or references a wrong-type model
- **THEN** both settings and any explicit candidate are ignored
- **AND** the deterministic existing platform default for that native type is used without expanding the paid catalog

### Requirement: Existing durable model bindings remain authoritative
The system SHALL apply consumer selections through the existing session, retrieval, Wiki, and knowledge-base fields rather than introduce a new user model-preference table.

#### Scenario: New knowledge base uses selected native defaults
- **WHEN** a consumer creates a document knowledge base with authorized Agent Model (`rag` scene), Wiki, VLLM, and ASR choices
- **THEN** the knowledge-base module validates and persists those resolved IDs
- **AND** subsequent ingestion and query calls use the persisted fields through existing model interfaces

#### Scenario: Embedding remains internal
- **WHEN** a consumer opens settings or creates a knowledge base
- **THEN** no consumer Embedding preference is accepted
- **AND** the knowledge base keeps the platform-selected persisted Embedding ID and vector identity

#### Scenario: Platform RAG uses selected reranker
- **WHEN** the consumer stores an authorized Rerank choice in the existing tenant retrieval configuration
- **THEN** platform RAG resolves and invokes that Rerank model before answer generation

Lite platform builtin AgentQA with an enabled `knowledge_search` tool SHALL resolve the Rerank candidate from the current consumer tenant's `RetrievalConfig` through `ConsumerSceneRerank` before passing it to the agent engine; custom agents, IM, and Standard retain agent configuration authority.

### Requirement: Non-consumer model authorities remain untouched
The expanded consumer resolver MUST NOT override custom-agent, IM, evaluation, shared-owner embedding, or unrelated internal/background model authority.

#### Scenario: Custom agent runs with its own configuration
- **WHEN** a non-platform custom agent handles a request
- **THEN** its existing KnowledgeQA, Rerank, VLLM, and ASR configuration remains authoritative and the consumer boundary resolver does not replace it
