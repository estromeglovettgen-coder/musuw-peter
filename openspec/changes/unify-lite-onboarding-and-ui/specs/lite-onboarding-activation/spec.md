## ADDED Requirements

### Requirement: The empty knowledge-base guide leads directly to creation
Musuw Lite SHALL guide a first-time user through the centered empty-state create action, prefill an editable localized knowledge-base name, and end on the existing create action so the user can complete activation without typing unrelated setup data.

#### Scenario: Empty knowledge-base list
- **WHEN** a Lite user with no knowledge bases receives the knowledge-base guide
- **THEN** the centered empty-state create button is the highlighted target
- **AND** the guide card remains fully visible within the viewport

#### Scenario: Populated knowledge-base list
- **WHEN** the guide runs after a knowledge base already exists
- **THEN** it may target the existing header create button as a fallback without blocking navigation

#### Scenario: Create modal opens for a Lite user
- **WHEN** the user opens the create modal from the guide
- **THEN** the name field contains an editable localized default name
- **AND** the guide omits Standard-only provider, member, tenant, and infrastructure controls

#### Scenario: Create guide reaches its final step
- **WHEN** required existing validation is satisfied
- **THEN** the existing create button is highlighted and remains directly clickable

### Requirement: New Lite objects receive useful collision-free name suggestions
New Lite knowledge bases and custom agents SHALL start with localized editable names based on “My Knowledge Base” and “My Agent”, using the first available numeric suffix when a loaded object already uses the base name.

#### Scenario: No matching knowledge-base name exists
- **WHEN** a Lite user opens the new knowledge-base form
- **THEN** the name is prefilled with the localized equivalent of “My Knowledge Base”

#### Scenario: Matching knowledge-base names exist
- **WHEN** “My Knowledge Base” and “My Knowledge Base (2)” already exist in the loaded knowledge-base list
- **THEN** the suggested name is the localized equivalent of “My Knowledge Base (3)”

#### Scenario: No matching custom-agent name exists
- **WHEN** a Lite user opens the new custom-agent form
- **THEN** the name is prefilled with the localized equivalent of “My Agent”

#### Scenario: A numbered name is available
- **WHEN** the base name exists but a lower numeric suffix is unused
- **THEN** the first available suffix beginning at 2 is suggested rather than the largest suffix plus one

#### Scenario: Standard or preset behavior
- **WHEN** Standard opens the upstream creator or a preset supplies a deliberate agent name
- **THEN** its existing naming behavior is preserved

#### Scenario: Suggested name is edited or races another client
- **WHEN** the user edits the suggestion or the server rejects a concurrent duplicate
- **THEN** the existing form and server validation handle the value without a new API or uniqueness contract

### Requirement: Knowledge ingestion guidance separates distinct actions
The Lite knowledge-base detail guide SHALL teach local document upload and webpage import as separate steps using their existing controls and entitlement behavior.

#### Scenario: Both ingestion actions are visible
- **WHEN** a Lite user first opens an empty knowledge base
- **THEN** one step targets Add Document and describes file upload
- **AND** a different step targets Import Webpage and describes link ingestion

#### Scenario: An optional target is unavailable
- **WHEN** an ingestion control is hidden by an existing entitlement or responsive state
- **THEN** the existing guide resolver skips that optional step without combining the two actions or blocking completion

### Requirement: The first-chat guide explains the existing composer choices
Musuw Lite SHALL provide a concise contextual guide on the first eligible new-chat view that explains the existing agent, model, reasoning, input, and send choices without changing the composer UI.

#### Scenario: First eligible new chat
- **WHEN** a Lite user reaches the empty global new-chat page and has not completed the chat guide
- **THEN** the guide identifies the existing combined agent/model/reasoning selector
- **AND** the copy states that some models require a paid plan and that the existing upgrade prompt will explain eligibility
- **AND** subsequent steps identify the existing input and send controls

#### Scenario: Existing or ineligible chat state
- **WHEN** the route is not the global empty new-chat state or the guide was completed
- **THEN** no new guide is opened

#### Scenario: Composer preservation
- **WHEN** guide targeting is added to the homepage composer
- **THEN** only inert guide metadata is added
- **AND** its DOM hierarchy, layout, color, typography, spacing, and interaction behavior remain unchanged

### Requirement: Lite guidance uses consumer terminology and honest replay behavior
Lite-visible guide copy SHALL address one user and one knowledge space without member, team, workspace-switching, or unsupported replay claims.

#### Scenario: Lite guide completion
- **WHEN** a Lite user completes or closes the welcome sequence
- **THEN** the completion copy does not claim that a question-mark control can replay the tutorial
- **AND** the account menu does not render that unsupported replay control

#### Scenario: Standard user opens the account menu
- **WHEN** the product edition is Standard
- **THEN** the existing replay control and upstream guide behavior remain available

#### Scenario: Guide persistence
- **WHEN** a user completes a contextual guide and later revisits the same page
- **THEN** the existing per-user completion state prevents an unsolicited repeat
