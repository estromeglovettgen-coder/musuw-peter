## ADDED Requirements

### Requirement: Consumer selectors have one authoritative presentation
Every affected Lite-visible dropdown outside the homepage new-chat composer SHALL reuse the existing General Settings selector contract for trigger geometry, typography, chevron, focus ring, popup container, option rows, selected state, scrolling, and light/dark colors.

#### Scenario: A settings or editor selector opens
- **WHEN** a user opens an affected language, theme, model, memory kind, knowledge scope, extraction granularity, filter, or comparable selector
- **THEN** its trigger and popup match the authoritative settings selector
- **AND** exactly one popup shell is visible without overlapping or nested decorative containers

#### Scenario: Selected and unselected options render
- **WHEN** the option list is visible
- **THEN** option font size, line height, row height, horizontal padding, radius, selected background, label weight, and check placement follow the authority contract

#### Scenario: Theme changes
- **WHEN** the same selector is viewed in light and dark themes
- **THEN** surface, border, text, hover, selected, and focus colors use the shared theme tokens with readable contrast

#### Scenario: Homepage new-chat selector
- **WHEN** a user opens a selector inside the homepage new-chat composer
- **THEN** its existing UI remains unchanged

### Requirement: Knowledge document actions use one toolbar grammar
The knowledge document page SHALL render its folder, filters, view controls, Add Document, and Import Webpage actions with one size, radius, border, typography, icon alignment, and hover/focus grammar.

#### Scenario: Neutral toolbar controls
- **WHEN** folder, filter, view, or Import Webpage controls are visible
- **THEN** they use the same neutral geometry and theme treatment
- **AND** fixed labels such as “All Tags”, “All Types”, and “All Statuses” are fully visible without ellipsis

#### Scenario: Primary add action in light theme
- **WHEN** Add Document is shown in light theme
- **THEN** it uses the same geometry with a dark background and light foreground

#### Scenario: Primary add action in dark theme
- **WHEN** Add Document is shown in dark theme
- **THEN** it uses the same geometry with a light background and dark foreground

### Requirement: Knowledge-base and agent directories share one page skeleton
The knowledge-base and agent directory pages SHALL use identical values for content background, page padding, title baseline, subtitle baseline, header divider, content start, grid gaps, responsive columns, card shell, and card internal rhythm.

#### Scenario: Switching between directories at one viewport
- **WHEN** a user alternates between the knowledge-base and agent pages
- **THEN** the shared title, divider, content, grid, and card anchors do not shift by a pixel
- **AND** the pages use the same theme surface and border tokens

#### Scenario: Directory cards render
- **WHEN** cards appear in either directory
- **THEN** equivalent card shells share minimum height, padding, radius, border, title and description metrics, footer divider, and action baseline

#### Scenario: Responsive directory layout
- **WHEN** the viewport crosses an existing responsive breakpoint
- **THEN** both directories transition using the same column count, gap, and page padding contract

### Requirement: The account menu has consistent rows and consumer identity treatment
The Lite account trigger and opened account menu SHALL use bounded content, equal row hover areas, a neutral black identity avatar, and a visible Upgrade Plan icon for free users.

#### Scenario: Long user identity
- **WHEN** a display name or email approaches the available width
- **THEN** it is constrained within the account row without background or content overflow
- **AND** the account row hover surface aligns with the Usage, Upgrade Plan, and Settings rows

#### Scenario: Lite identity and upgrade action
- **WHEN** a Lite free user opens the account menu
- **THEN** the small identity avatar uses the shared black neutral treatment
- **AND** Upgrade Plan has its intended leading icon even while entitlement data is loading

### Requirement: Destructive confirmation dialogs use the global dialog authority
Agent and knowledge-base deletion SHALL use one TDesign-based confirmation presentation with semantic actions, preserved handlers, and complete light/dark theming.

#### Scenario: Delete confirmation opens
- **WHEN** a user requests deletion of an agent or knowledge base
- **THEN** a centered authoritative dialog presents a clear title, object-specific warning, cancel action, and destructive confirm action
- **AND** no legacy page-local dialog geometry or mismatched color layer is visible

#### Scenario: User cancels or confirms
- **WHEN** the user activates Cancel or Confirm Delete
- **THEN** the existing close or delete handler executes exactly once
- **AND** keyboard focus and semantic button behavior remain available

#### Scenario: Dialog theme changes
- **WHEN** the confirmation is viewed in light or dark theme
- **THEN** dialog surface, overlay, text, borders, focus, neutral action, and danger action match global tokens with readable contrast
