## ADDED Requirements

### Requirement: Users can select configured conversation models

The conversation input SHALL expose every plan-approved KnowledgeQA model from the server-owned built-in OpenRouter catalog and no other model. The selected model SHALL be used by the platform answer mode and remembered per browser. When no valid remembered selection exists, the first server-approved platform fallback SHALL be used.

#### Scenario: User changes the conversation model

- **WHEN** an authenticated user opens the chat model dropdown and selects another available model
- **THEN** the selected model is shown in the input and used for subsequent conversation requests
- **AND** reloading the page preserves that choice while the model remains available

### Requirement: Consumers cannot configure model infrastructure

Musuw Lite SHALL hide model settings and SHALL deny consumer access to model mutation, provider metadata, debugging, credentials, and raw initialization probes. Model list/detail reads SHALL return only the platform-built-in OpenRouter catalog allowed by the active plan. The retained WeKnora management APIs SHALL require SystemAdmin for platform operations.

#### Scenario: Consumer deep-links to model settings

- **WHEN** a consumer opens a model-settings deep link or calls a mutation/debug/credential endpoint directly
- **THEN** the UI returns to General and the server returns the Lite not-found boundary without changing model state

#### Scenario: Consumer submits a custom model ID

- **WHEN** a consumer sends a non-built-in, non-OpenRouter, or plan-disallowed model ID
- **THEN** server-side resolution rejects it without invoking that provider

### Requirement: Built-in models are usable from the production region

Musuw SHALL ship an OpenRouter-backed built-in catalog for chat, embedding, rerank, vision, and speech. Existing stable capability IDs SHALL remain bound to the platform catalog; consumers SHALL require no provider credential or model configuration.

#### Scenario: Fresh tenant uses built-in capabilities

- **WHEN** a fresh tenant opens chat or creates a knowledge base without creating a custom model
- **THEN** plan-approved chat choices and stable ingestion capability bindings come from the platform catalog
- **AND** inference obtains the tenant's server-managed OpenRouter key without consumer configuration
