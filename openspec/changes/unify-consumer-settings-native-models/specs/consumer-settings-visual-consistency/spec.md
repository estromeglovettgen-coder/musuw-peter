## ADDED Requirements

### Requirement: Unified source-faithful settings structure
General, Usage, Model Settings, and User Profile SHALL use the latest ZIP4 settings source as their shared presentation contract while preserving Musuw routes, data, and actions.

#### Scenario: Consumer switches among settings pages
- **WHEN** the consumer visits each of the four settings pages
- **THEN** every page uses the same title strip, typography, responsive row layout, vertical cadence, divider, control alignment, and content padding
- **AND** no page falls back to a legacy card or unrelated layout language

### Requirement: Complete light and dark presentation
Every settings shell, page, row, card, select, popup, locked state, meter, and UserMenu surface SHALL have readable source-equivalent colors in both light and dark mode using Musuw's authoritative `theme-mode` behavior.

#### Scenario: Dark settings remain readable
- **WHEN** the consumer selects dark mode and opens General, Usage, Models, or User Profile
- **THEN** no light card or popup carries near-white text
- **AND** labels, values, borders, meters, selected rows, locked rows, and hover states meet the ZIP4 dark-state contrast relationship

#### Scenario: Theme dropdown opens
- **WHEN** the consumer opens Language, Theme, Brand Color, or a model selector
- **THEN** the full popup is visible above surrounding rows and is not clipped by an ancestor overflow rule

### Requirement: Exact locked and unlocked model treatment
Consumer model selects SHALL reproduce ZIP4 CustomSelect geometry and interaction. A locked row SHALL use explicit muted foreground plus a standalone lock icon, without opacity reduction or a PRO badge, and clicking it SHALL navigate to the existing Plans page without changing the current selection.

#### Scenario: Free consumer clicks a locked model
- **WHEN** a Free consumer clicks a locked real model option
- **THEN** the selector keeps the prior effective model
- **AND** navigation goes only to `/plans`

#### Scenario: Consumer clicks an unlocked model
- **WHEN** the consumer clicks an authorized option
- **THEN** the selection updates through the existing model/retrieval/knowledge-base interface
- **AND** the dropdown closes with the source interaction timing

### Requirement: Source-faithful UserMenu and chat model picker
The bottom-left account trigger, menu, black letter avatar, dividers, actions, model capsule, primary menu, reasoning menu, and left/right flyouts SHALL retain current Musuw behavior while matching the latest ZIP4 geometry, color, typography, icon, and motion values.

#### Scenario: Account menu opens in either theme
- **WHEN** the consumer opens the bottom-left account menu
- **THEN** its trigger and popup match the ZIP4 structure and remain readable
- **AND** existing Usage, Plans, Settings, tenant, and Logout actions keep their current routes and authorization

#### Scenario: Model flyout chooses its side
- **WHEN** the chat model submenu has at least 235 pixels of viewport space to the right of its anchor
- **THEN** it opens on the right
- **AND WHEN** less space is available
- **THEN** it opens on the left

### Requirement: Lite cannot reach legacy model management
Lite consumers SHALL see only the real consumer model settings and SHALL NOT see or invoke custom model creation, provider credentials, debug, guide, catalog-management, or arbitrary-ID UI paths.

#### Scenario: Lite consumer opens Models
- **WHEN** a Lite consumer opens Model Settings before, during, or after option loading
- **THEN** the source-faithful consumer controls remain rendered
- **AND** legacy management headers, tabs, cards, add buttons, provider controls, and debug actions are absent

