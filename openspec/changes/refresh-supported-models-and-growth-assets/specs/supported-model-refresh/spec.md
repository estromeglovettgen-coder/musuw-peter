## ADDED Requirements

### Requirement: Verified current models
The managed catalog SHALL use current compatible same-purpose model versions established by first-party provider evidence and actual request acceptance, with accurate user-facing names and preview labels.

#### Scenario: Model upgrade
- **WHEN** a managed entry has a verified compatible successor
- **THEN** its provider endpoint and visible label match the new version across selectors and defaults
- **AND** its native request completes without unsupported reasoning or modality parameters.

### Requirement: Existing references remain valid
The refresh SHALL preserve stable built-in IDs, plan authorization, existing embedding vectors and manual model configuration.

#### Scenario: Saved selections and knowledge bases
- **WHEN** an existing user opens a saved agent, conversation or knowledge base after refresh
- **THEN** model references resolve with supported reasoning behavior
- **AND** retrieval continues against the existing embedding space without reindexing or changed dimension.

### Requirement: Actual release acceptance
Production delivery SHALL use the existing exact-SHA immutable-image staging and protected promotion process, with real provider-interface checks and full Sandbox billing acceptance.

#### Scenario: Production promotion
- **WHEN** a refresh is reported deployed
- **THEN** the recorded production revision matches the accepted staging artifacts
- **AND** the runtime model catalog and labels match the release, with a real DeepSeek response verified.
