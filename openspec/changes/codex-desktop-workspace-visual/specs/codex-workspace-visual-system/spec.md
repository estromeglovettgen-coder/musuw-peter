## ADDED Requirements

### Requirement: Codex-inspired workspace visual language

The application SHALL render regular user-facing workspace surfaces with one
Codex Desktop-inspired visual language: Inter/Noto Sans SC typography with
JetBrains Mono for technical content, neutral
gray hierarchy, compact high-density navigation, thin separators, restrained
rounded controls, and an accessible focus accent. The Musuw name and all
existing product labels, routes, actions, and user flows SHALL remain intact.

#### Scenario: Default workspace surface

- **WHEN** a user opens a regular chat, new chat, knowledge-base list,
  document library, document detail, citation, or reference surface with no
  saved font override
- **THEN** the surface uses the existing product sans/mono font stacks and the
  Codex-inspired neutral visual tokens
- **AND THEN** it does not introduce a second UI runtime or rename the product
  to Codex

#### Scenario: Explicit font preference remains respected

- **WHEN** a user has explicitly saved a supported sans or monospace font
  preference
- **THEN** that preference overrides the visual default on regular workspace
  surfaces
- **AND THEN** an unsupported or absent preference falls back to the native
  product visual default

### Requirement: Visual references do not expand product behavior

The supplied legacy Musnow / Google AI Studio export SHALL be used only for
presentation decisions. The active application SHALL remain the sole source
of truth for navigation, controls, permissions, data, APIs, and knowledge-base
behavior.

#### Scenario: Reference template contains an absent feature

- **WHEN** a visual reference contains a navigation item, account widget,
  model, view, or action that the active application does not expose
- **THEN** that feature is not added to Musuw
- **AND THEN** only compatible visual properties may be borrowed

### Requirement: Existing actions may be visually relocated without duplication

The existing knowledge-base create action MAY be relocated from the page
header to the final grid slot, but its permission check, handler, guide hook,
and resulting workflow SHALL remain the same and SHALL appear only once in a
non-empty list.

#### Scenario: Knowledge-base list has content

- **WHEN** a contributor opens a non-empty knowledge-base list
- **THEN** one dashed create tile appears as the final grid item
- **AND THEN** the old header create button is absent and no second create
  action is introduced

### Requirement: Reasoning hierarchy uses one progress rail

Expanded reasoning and retrieval progress SHALL use one aligned guide rail and
shall preserve every existing state, label, timing value, control, and result.

#### Scenario: Reasoning is expanded

- **WHEN** a user expands reasoning or retrieval progress
- **THEN** the summary, steps, and answer share a precise reading alignment
- **AND THEN** duplicate outer rails, colored halos, and decorative panels do
  not compete with the content

### Requirement: First-render locale follows a stable precedence

The storefront SHALL retain its CN-versus-non-CN country default, while the
product and authentication shell SHALL resolve first-render language using an
existing saved preference, then the storefront locale signal, then browser
language, and finally English.

#### Scenario: A returning user has selected a language

- **WHEN** a supported saved locale is present
- **THEN** it overrides country and browser defaults in the product and auth
  shell
- **AND THEN** authentication and callback behavior is unchanged

### Requirement: Compact navigation and workspace geometry

The workspace SHALL render the sidebar, content header, chat reading column,
composer, document/reference panel, and document-library rows with the
reference application's compact geometry and interaction hierarchy. Selected
and hover states SHALL use neutral surfaces; keyboard focus SHALL remain
visibly distinguishable with an accessible focus treatment.

#### Scenario: Sidebar navigation state

- **WHEN** a user views, hovers, focuses, or selects a sidebar navigation or
  session row
- **THEN** the row preserves its existing click and keyboard behavior
- **AND THEN** selection is represented by a low-contrast neutral surface,
  hover by a distinct subtle surface, and focus by a visible focus indication

#### Scenario: Chat and document workspace

- **WHEN** a user opens a chat with messages, a new-chat surface, a document,
  or a reference panel
- **THEN** the existing content and controls retain their behavior
- **AND THEN** their reading columns, composer, borders, code typography,
  citations, and compact panel layout follow the shared visual language

### Requirement: Teleported surface parity without graph leakage

The application SHALL apply the visual language to known regular body-
teleported dialogs, drawers, citation previews, reference panels, and
knowledge selectors without using broad selectors that alter graph-only
popups, drawers, or help surfaces.

#### Scenario: Regular teleported workspace surface

- **WHEN** a user opens a regular document drawer, attachment drawer, regular
  dialog, citation preview, reference panel, or non-graph knowledge selector
- **THEN** the surface uses the same visual language as its invoking workspace
  surface
- **AND THEN** its existing z-index, close, keyboard, and action behavior is
  unchanged

#### Scenario: Graph search popup remains isolated

- **WHEN** a user opens the graph search popup or graph help popup
- **THEN** the popup retains the graph's existing visual treatment
- **AND THEN** no regular workspace select, dialog, or drawer rule styles it

### Requirement: Knowledge graph visual isolation

The Codex-inspired migration SHALL NOT alter the knowledge graph canvas,
nodes, edges, graph toolbar, graph search, graph help popup, graph drawer, or
graph-tab content. It SHALL NOT apply global TDesign token, scrollbar, select,
drawer, or dialog overrides to those graph surfaces.

#### Scenario: Graph tab is active

- **WHEN** a user opens the graph tab of a Wiki knowledge base
- **THEN** the graph canvas and graph-specific controls render with their
  pre-migration styling and behavior
- **AND THEN** document-library visual rules do not restyle the graph-tab
  content

#### Scenario: Graph node drawer is opened

- **WHEN** a user opens a graph node drawer
- **THEN** the drawer and its contents retain the graph's pre-migration
  styling and behavior
- **AND THEN** the regular document and attachment drawer styling is not
  applied

### Requirement: Responsive and accessible dual-mode presentation

The visual system SHALL provide corresponding light and dark neutral hierarchy
for regular workspace surfaces while preserving readable text, controls,
focus indicators, and responsive layout behavior.

#### Scenario: Theme changes

- **WHEN** the user selects light, dark, or system theme
- **THEN** regular workspace surfaces preserve equivalent visual hierarchy and
  accessible contrast in the selected effective theme
- **AND THEN** existing theme preference behavior remains unchanged

#### Scenario: Compact viewport

- **WHEN** a regular workspace surface is rendered in a narrow viewport
- **THEN** sidebar and panel behavior follows the existing responsive logic
- **AND THEN** the visual migration does not create horizontal overflow or
  hide an existing control without its existing responsive alternative
