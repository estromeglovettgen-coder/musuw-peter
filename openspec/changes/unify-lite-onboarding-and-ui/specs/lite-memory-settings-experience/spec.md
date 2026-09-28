## ADDED Requirements

### Requirement: Lite memory settings use single-user product language
Every Lite-visible Long-term Memory label, description, notice, empty state, archive explanation, and related agent help text SHALL describe the current user's memory without implying members, workspace switching, organization administration, or shared tenant ownership.

#### Scenario: Lite user opens Long-term Memory
- **WHEN** the settings page is rendered in Lite
- **THEN** the copy refers to “you”, “your conversations”, and “your memory” as appropriate
- **AND** no visible copy describes members or a workspace-wide policy

#### Scenario: Standard collaboration surface
- **WHEN** the same upstream capability is used in Standard
- **THEN** member and workspace concepts required by Standard remain available

### Requirement: Memory controls reuse established Musuw control patterns
The Long-term Memory page SHALL use the shared settings row, segmented control, selector, number control, switch, disclosure, and theme conventions already used by Musuw.

#### Scenario: User chooses a write mode
- **WHEN** the explicit-write or automatic-extraction choice is rendered
- **THEN** it uses the existing agent segmented-control presentation rather than a one-off radio-button style
- **AND** the persisted enum and disabled-state behavior remain unchanged

#### Scenario: User opens a memory selector
- **WHEN** model, extraction, memory kind, or another affected selector opens
- **THEN** it follows the consumer selector authority without a second popup shell

#### Scenario: Memory page theme and viewport change
- **WHEN** the page is rendered in light, dark, desktop, or narrow layout
- **THEN** headings, notices, rows, descriptions, controls, advanced disclosure, empty states, and action surfaces use the existing Musuw settings hierarchy without clipping

### Requirement: Memory autosave is quiet on success and explicit on failure
Debounced Long-term Memory autosave SHALL keep the existing payload, validation, and save timing while avoiding duplicate success notifications.

#### Scenario: A valid setting changes once
- **WHEN** the debounce interval elapses after one valid change
- **THEN** the existing update request is sent once
- **AND** no success toast is displayed because the settled control state is the success feedback

#### Scenario: Saving fails
- **WHEN** the existing update request rejects
- **THEN** one clear error notification is displayed
- **AND** the user can retry by changing or saving through the existing interaction

#### Scenario: Page unmounts before debounce completes
- **WHEN** the user closes settings before the scheduled save executes
- **THEN** the pending local debounce timer is cleared

### Requirement: Existing memory business constraints remain unchanged
The UI refinement SHALL preserve all current memory API fields, defaults, permissions, validation, lifecycle behavior, and minimum-interval constraint.

#### Scenario: Minimum mining interval is edited
- **WHEN** a user decreases Two-mining Minimum Interval
- **THEN** the existing minimum value of one second remains enforced
- **AND** zero is not treated as a valid product value

#### Scenario: Memory mode affects dependent settings
- **WHEN** an existing mode disables an inapplicable control
- **THEN** that control remains visible with the existing disabled behavior and explanation
