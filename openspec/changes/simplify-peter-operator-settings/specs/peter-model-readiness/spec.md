## ADDED Requirements

### Requirement: Applicable model defaults use tested providers
The Peter deployment SHALL select its tested DeepSeek models by default for supported text, reasoning, vision, summary, and Wiki operations. Embedding and rerank SHALL use the separately deployed, tested server-hosted models. A model category MUST NOT be shown as ready solely because a record exists.

#### Scenario: Create knowledge and agent resources
- **WHEN** Peter creates a knowledge base or a compatible agent without overriding model choices
- **THEN** saved model references resolve to active, tested models for the operations those resources use

#### Scenario: Unsupported modality
- **WHEN** a model category lacks a working provider or endpoint
- **THEN** Peter sees an accurate unavailable state or the irrelevant control is hidden; no broken default model ID is saved

#### Scenario: Reopen configuration
- **WHEN** Peter saves and reopens a model-dependent resource
- **THEN** the selected model identity matches the runtime model used for its operations

### Requirement: Testing does not conceal provider boundaries
An OpenRouter fallback MAY be configured for bounded test modalities only after a successful real request through the native model interface. The deployed model list SHALL distinguish server-hosted models from external providers without implying that Peter's browser or laptop runs the models.

#### Scenario: Verify an optional provider
- **WHEN** an optional model is added for testing
- **THEN** its native debug request succeeds before it is treated as available, and its provider and usage boundary remain identifiable

### Requirement: New Peter document resources start with working media and graph processing
New Peter document knowledge bases and customer projects SHALL save enabled image description, audio transcription, and entity relationship extraction with active tested models and a healthy private graph database. Existing resource configuration MUST be preserved on edit.

#### Scenario: Create a Peter knowledge base or customer
- **WHEN** Peter creates a document knowledge base or customer without opening technical settings
- **THEN** the saved resource has valid enabled vision, ASR, and graph extraction configuration and can process representative image, audio, and graph evidence

#### Scenario: Edit an existing resource
- **WHEN** Peter edits a resource created before these defaults
- **THEN** its saved media and graph choices stay unchanged unless Peter intentionally changes a related visible setting

#### Scenario: A provider is unavailable
- **WHEN** a required model or graph service fails readiness checks
- **THEN** the create or ingestion workflow gives an actionable failure rather than reporting success with a broken hidden configuration
