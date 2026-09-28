## ADDED Requirements

### Requirement: Name-only document knowledge-base provisioning
The system SHALL own the configuration of a standard document knowledge base.
It MUST apply the existing platform defaults for embedding, summary, image,
audio, retrieval, Wiki, and graph processing, and it MUST verify that every
model directly referenced by those defaults is active before persistence.

#### Scenario: Built-in processing catalog is ready
- **WHEN** a user creates a document knowledge base with a name
- **THEN** the system persists the existing complete default configuration and
  returns a knowledge base ready to receive documents

#### Scenario: Required built-in model is unavailable
- **WHEN** a user creates a document knowledge base and a default model is
  missing or inactive
- **THEN** the system returns an unavailable error and persists no knowledge
  base

### Requirement: Standard knowledge-base flow hides configuration
The standard-user knowledge-base flow MUST expose creation, upload, content
organization, query, and deletion, but MUST NOT expose raw model, parser,
storage, graph, indexing, or advanced knowledge-base settings.

#### Scenario: User opens a knowledge-base card
- **WHEN** a standard user opens a listed knowledge base
- **THEN** the system opens its content view and never redirects the user to
  model configuration

#### Scenario: User opens a card action menu
- **WHEN** a standard user opens a knowledge-base card action menu
- **THEN** the menu does not contain a Settings action or an uninitialized
  model warning
