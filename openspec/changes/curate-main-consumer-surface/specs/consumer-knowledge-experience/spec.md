## ADDED Requirements

### Requirement: Every Lite user knowledge base is a document knowledge base
Musuw Lite SHALL omit the knowledge-base type selector and SHALL enforce `document` for every user-created knowledge base.

#### Scenario: Ordinary creation
- **WHEN** a Lite contributor opens and submits the knowledge-base creator
- **THEN** no type control is rendered and the server creates a document knowledge base

#### Scenario: Crafted FAQ creation
- **WHEN** a Lite user submits a create request containing `faq` or another non-document type
- **THEN** the server rejects or safely normalizes it so no non-document user knowledge base is created

### Requirement: Knowledge settings use Musuw Basic and Advanced sections
The Lite knowledge editor SHALL render only Basic and Advanced product sections using existing Musuw settings modules, while provider and engine choices remain server-owned.

#### Scenario: Technical section deep link
- **WHEN** a Lite user supplies a section for models, vector stores, parsers, multimodal, audio, chunking, graph internals, storage, data sources, sharing, or activity
- **THEN** the editor opens a supported Basic or Advanced section without rendering the technical panel

#### Scenario: Musuw visual behavior
- **WHEN** a Lite user views either supported section in light, dark, desktop, or narrow layout
- **THEN** it uses the existing Musuw modal, setting-row, control-width, spacing, focus, and responsive conventions

#### Scenario: Shared layout structure
- **WHEN** Basic or Advanced knowledge settings are rendered
- **THEN** the editor uses the shared Musuw settings shell with left-side section navigation, page header, unboxed setting rows, bounded controls, and shared footer
- **AND** it does not render an upstream-style top tab strip, card-grid form, or independent modal geometry

#### Scenario: Standard exposes additional sections
- **WHEN** an internal Standard administrator opens the full knowledge editor
- **THEN** the additional upstream sections use the same Musuw shell and row grammar without changing their capabilities

### Requirement: Automatic tags are a managed product switch
Lite users SHALL be able to enable automatic association of existing tags without selecting a model. Lite SHALL use `builtin-deepseek-v4-flash`, at most three matches, and SHALL preserve manual tags.

#### Scenario: Enable automatic tags
- **WHEN** a Lite user enables automatic tags and saves a document knowledge base
- **THEN** no model selector is shown and the persisted effective configuration uses the managed defaults

#### Scenario: Manual tags exist
- **WHEN** an automatically tagged document already has manual tags
- **THEN** automatic processing does not overwrite those tags

### Requirement: Parsing and document enhancements are outcome-oriented
Lite SHALL use managed parsing, including AnyDoc when configured, without an engine selector, and SHALL expose stable document actions in the existing document interface.

#### Scenario: Supported upload
- **WHEN** a Lite user uploads a supported document
- **THEN** parsing is selected automatically and the user sees progress, completion, or a retryable failure rather than provider configuration

#### Scenario: Enhanced document action
- **WHEN** a permitted user opens a document action or preview
- **THEN** the enhancement appears in the existing Musuw document menu or content surface without a new settings architecture
