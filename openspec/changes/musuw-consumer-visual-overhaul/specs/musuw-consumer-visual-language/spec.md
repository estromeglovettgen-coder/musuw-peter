## ADDED Requirements

### Requirement: Musuw consumer visual system
The application SHALL render regular consumer routes with a shared Musuw visual system that uses the approved Musuw typography, palette, spacing, border, focus, and light/dark theme tokens instead of visible upstream WeKnora presentation tokens.

#### Scenario: Consumer opens a regular workspace route
- **WHEN** an authenticated consumer navigates to chat, a knowledge-base route, a document route, or settings
- **THEN** the route SHALL use the same Musuw shell, typography, action treatment, and accessible focus treatment without changing its route or application data contract

### Requirement: Native capabilities remain the source of visible controls
The application SHALL expose only controls backed by existing native WeKnora capabilities and SHALL preserve their existing handlers and keyboard access.

#### Scenario: Consumer uses a redesigned primary action
- **WHEN** the consumer activates a visible chat, knowledge-base, upload, settings, or logout control
- **THEN** the existing native handler SHALL run and no visual-only action SHALL be introduced

### Requirement: Musuw research composition
The chat and knowledge-base surfaces SHALL prioritize readable content, citations, and sources without changing their application data or interaction semantics.

#### Scenario: Consumer opens a cited source
- **WHEN** the consumer opens a chat citation or document detail
- **THEN** the source content and its available native controls SHALL remain readable and usable in the same Musuw content hierarchy

### Requirement: Knowledge graph exclusion
The visual migration SHALL NOT alter graph-specific rendering, canvas, node, layout, controls, or graph-specific styles.

#### Scenario: Consumer opens a knowledge graph
- **WHEN** graph data is available for a knowledge base
- **THEN** the existing graph rendering and interaction behavior SHALL remain unchanged by this migration

### Requirement: Consumer surfaces omit upstream visual brand residue
Regular consumer surfaces SHALL not display an upstream WeKnora wordmark, favicon, or upstream-oriented navigation structure.

#### Scenario: Consumer enters the application
- **WHEN** the consumer loads the root application shell
- **THEN** the shell SHALL identify the product as Musuw and present only the simplified consumer navigation
