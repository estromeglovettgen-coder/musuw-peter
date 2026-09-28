## ADDED Requirements

### Requirement: Curated manual document publishing
The system SHALL let an authenticated editor publish manually curated Markdown with an explicit human-written summary while preserving native chunking and indexing.

#### Scenario: Curated document is published
- **WHEN** the editor publishes manual knowledge with a nonempty curated summary and skip-auto-enrichment enabled
- **THEN** the document becomes enabled and completed with nonempty indexed chunks and the curated summary remains its description
- **AND** the system does not schedule automatic summary, question, graph, tag, multimodal or Wiki generation for that document

#### Scenario: Existing requests
- **WHEN** the editor creates or publishes manual knowledge without the new fields
- **THEN** the existing postprocessing behavior is unchanged

#### Scenario: Reparse
- **WHEN** a curated manual document is reparsed
- **THEN** the curated summary and separately authored Wiki content remain intact

### Requirement: Fail-closed importer
The importer SHALL refuse to publish curated documents unless the server advertises support for this contract.

#### Scenario: Older server
- **WHEN** the capability marker is absent or false
- **THEN** the importer performs no publish request

### Requirement: Public content boundary
Visible documents, Wiki pages and assistant prompts SHALL contain creator knowledge and source attribution without local evidence paths, hashes, model processing logs or internal review commentary.

#### Scenario: Imported creator material is shown
- **WHEN** a user opens a published document, Wiki page or creator agent answer
- **THEN** the content presents the creator's ideas and original work link without internal review or import notes
