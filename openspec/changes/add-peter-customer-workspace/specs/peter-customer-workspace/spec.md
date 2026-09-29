## ADDED Requirements

### Requirement: Reusable customer templates
Workspace administrators SHALL create, edit, duplicate and delete named customer-type templates in customer settings using the existing full configuration editor. Templates SHALL persist native processing settings and reusable status/tag/note/public-library defaults, without customer identity, credentials, source files or generated Wiki selections.

#### Scenario: Apply a template before creation
- **WHEN** Peter applies a saved template while creating a customer
- **THEN** its processing configuration and profile defaults populate the draft, personal fields and staged sources are preserved, and settings remain individually editable before native creation and ingestion.

#### Scenario: Template lifecycle
- **WHEN** an administrator edits or deletes a template and saves settings
- **THEN** future creation reflects that change, existing customers remain unchanged, and template editing itself does not create customers or invoke models.

### Requirement: Drag ordered customer choices
Administrators SHALL reorder both statuses and tags by dragging, without visible up/down arrow controls. Saved order SHALL drive new-customer forms and filters; keyboard reordering SHALL remain available.

#### Scenario: Reorder and reopen
- **WHEN** Peter drags an option to a new position and saves customer settings
- **THEN** reopening retains the order and the first status remains the default when no template is applied.

### Requirement: Understandable customer profile source
New customers SHALL automatically choose their generated profile Wiki. Existing customers MAY choose which Wiki page supplies the home-page customer profile using a label explaining that visible outcome.

#### Scenario: Existing profile page selection
- **WHEN** Peter edits a customer with Wiki pages
- **THEN** the selection is labeled as the home-page customer profile and clearing it restores automatic selection.

### Requirement: Complete customer setup before creation
Peter SHALL configure customer profile fields and all applicable native knowledge processing settings in the same editor before creation. Editing SHALL reuse these fields. Initial source files SHALL be optional.

#### Scenario: Create with processing settings and sources
- **WHEN** Peter submits a customer with native model/Wiki/parser settings and optional chat sources
- **THEN** the saved settings apply before upload and each source shows its upload result; failed uploads can be retried against the existing customer without duplicate customers or successful sources.

### Requirement: Workspace customer choices
Workspace administrators SHALL configure ordered customer statuses and tags from the customer list settings. Choices SHALL persist across reloads, with existing native tenant authorization.

#### Scenario: Maintain available choices
- **WHEN** an administrator saves status/tag options
- **THEN** new/edit forms and list filters use those choices, the first status becomes the creation default, and removing an option preserves existing customer metadata and its filterability.

### Requirement: Customer knowledge workspace
The system SHALL represent one customer as one document knowledge base with editable status, tags, contact details and pinned notes, plus native source files, Wiki and graph.

#### Scenario: Customer overview
- **WHEN** Peter creates or opens a customer
- **THEN** the customer overview and native source/Wiki/graph views use the same KB identity and show honest loading, empty and error states.

### Requirement: Reuse Wiki instructions
The system SHALL use existing Wiki extraction and content instructions for customer defaults, without another analysis prompt field.

#### Scenario: Editing customer focus
- **WHEN** Peter modifies the two native Wiki settings
- **THEN** future processing uses them and existing output remains until reprocessed.

### Requirement: Customer bound conversations
The system SHALL bind each customer conversation to exactly one customer, retain that context across agent changes, and exclude other customers from retrieval and memory.

#### Scenario: Agent and customer changes
- **WHEN** Peter changes agent within a customer conversation
- **THEN** the customer binding stays unchanged; selecting another customer opens its own conversation.

### Requirement: Optional source archival
The system SHALL default new customer-chat source attachments to archival in that customer KB and allow archival to be disabled in the native agent editor. This preference SHALL persist per agent, with missing legacy values defaulting to enabled. Chat and homepage SHALL not show the archival setting or a separate customer context bar. AI replies SHALL remain conversation history, not source facts.

#### Scenario: Archival selection
- **WHEN** Peter submits customer attachments with archival enabled or disabled
- **THEN** the originals respectively enter that customer KB or stay conversation-only, and archival failure is visible.

### Requirement: Customer mentions and linked resources
Peter SHALL select a customer through a separate customer group in the homepage or conversation mention picker. Agent public-library selection restrictions SHALL not hide eligible local customers. Existing customer binding and server authorization SHALL remain authoritative.

#### Scenario: A sales agent with selected public libraries
- **WHEN** Peter uses a sales agent restricted to its selected public libraries and opens the mention picker
- **THEN** local customers remain selectable; selecting one preserves public references and selecting another replaces the pending customer selection.

#### Scenario: Resource navigation
- **WHEN** Peter clicks a selected customer or library chip
- **THEN** the respective customer or library detail opens; clicking the adjacent remove control only removes that selection.

### Requirement: Local preview
The system SHALL provide clearly fictional local customer data and an editable sales agent preset, leaving real sales-case maintenance to Peter.

#### Scenario: Manual review
- **WHEN** the local first version starts
- **THEN** Peter can inspect demonstration customers and related sources/Wiki/history; build/startup evidence is distinguished from functional acceptance, which the user performs.

### Requirement: Separate customer navigation
Peter SHALL see Workspace with distinct public knowledge-library and customer routes. Public-library lists and switchers SHALL exclude customers. All customer views SHALL retain the same customer header and six-tab navigation.

#### Scenario: Customer content navigation
- **WHEN** Peter opens customer files, Wiki, graph or an existing customer KB link
- **THEN** the customer route and header remain visible, the correct content is selected, and browser navigation preserves that context. The URL tab is the single source of truth for the header and content; switching between Wiki and graph cannot leave the previous view active.

#### Scenario: Unconfigured customer Wiki
- **WHEN** a customer without Wiki enabled opens its Wiki or graph tab
- **THEN** the customer shell keeps the selected tab and shows the unavailable state, rather than rendering documents under that tab.

### Requirement: Stable native settings
Every visible native settings section SHALL receive initialized form fields and preserve user configuration on create and edit.

#### Scenario: Processing sections
- **WHEN** Peter switches to image, audio or chunking settings, including reopening the dialog
- **THEN** controls render without an undefined-property failure and the native Standard creation payload includes their saved values.

### Requirement: Minimal customer presentation
Customer list and detail pages SHALL show names without letter avatars, omit permanent marketing explanations and align list headings and creation controls with the public-library view.

#### Scenario: Customer list and detail chrome
- **WHEN** Peter visits the customer list or a customer project
- **THEN** customer names have no letter avatars and the list uses the same title/create-action alignment as public libraries, without persistent marketing copy.
