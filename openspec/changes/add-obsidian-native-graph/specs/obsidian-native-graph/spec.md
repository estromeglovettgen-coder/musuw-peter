## ADDED Requirements

### Requirement: Original WeKnora UI and behavior contract
The system SHALL keep the original graph page's controls, order, position, labels, data actions, and navigation behavior. The only new page control SHALL be a compact visual-settings entry, whose independent growth-playback block is part of that settings surface.

#### Scenario: User opens the graph page
- **WHEN** the graph view becomes ready
- **THEN** search, help, the five page-type filters, fit, arrows, frontier growth, overview return, status, and the right-side page drawer SHALL remain in their original positions
- **AND** no renderer or style selector SHALL replace or hide those controls

#### Scenario: User activates a node
- **WHEN** the user clicks, double-clicks, Shift-clicks, searches for, or follows a link to a graph node
- **THEN** the existing selection, drawer, ego, bloom, focus, and source-content flows SHALL run unchanged

### Requirement: Exact graph physics behind the renderer seam
The graph SHALL use the versioned local Obsidian graph Worker through the existing renderer boundary. The Worker and Pixi adapter SHALL own physics, pixels, hit testing, and camera movement; WikiBrowser SHALL continue to own product behavior.

#### Scenario: Drag and release a node
- **WHEN** the user drags a node
- **THEN** that node SHALL follow the pointer while the simulation reheats
- **AND** connected nodes SHALL visibly respond to the force update
- **AND** releasing the node SHALL clear its fixed coordinates and allow the graph to settle

#### Scenario: Renderer lifecycle ends
- **WHEN** the user leaves the graph view or the component unmounts
- **THEN** its Worker, Pixi application, observers, animation frame, and canvas SHALL be released

### Requirement: Compact visual settings
The graph SHALL expose node size, label fade, line thickness, center force, repel force, link force, link distance, reset, section collapse, and panel close controls without duplicating WeKnora business controls. Growth playback SHALL be exposed in a separate labeled block in the same settings surface, not as a force control.

#### Scenario: User changes a visual value
- **WHEN** a display or force slider changes
- **THEN** the active renderer or Worker SHALL update without refetching or filtering graph data
- **AND** the current node identity, selection, camera, and page drawer SHALL remain intact

#### Scenario: User revisits a knowledge base
- **WHEN** saved graph settings exist for that knowledge base
- **THEN** every persisted visual value, collapse state, close state, and scale SHALL be restored
- **AND** another knowledge base's values SHALL NOT be applied

### Requirement: Obsidian growth playback
The graph SHALL provide live Obsidian-calibrated growth playback from a standalone block in graph settings. Playback SHALL use the current in-memory graph and SHALL NOT fetch, record, or play a video.

#### Scenario: User starts or replays growth playback
- **WHEN** the user clicks play while playback is idle, or replay while it is complete
- **THEN** the renderer SHALL reset the current rendered graph, set `progression` to `1`, and reveal graph items progressively in the existing deterministic API node order
- **AND** it SHALL compute `progressionSpeed = clamp(0.5 * sqrt(totalLinks), 5, 100)` and advance on requestAnimationFrame ticks using `1 + floor(progressionSpeed * elapsedSeconds)`
- **AND** on start and every changed progression value, the exact Worker SHALL receive only the unlocked node prefix and edges whose two endpoints are unlocked, so hidden nodes do not influence the visible layout
- **AND** the settings block SHALL show visible progress without changing graph data, filters, or page navigation

#### Scenario: User pauses and resumes playback
- **WHEN** the user clicks pause while playback is running
- **THEN** the active animation frame SHALL be cancelled and the visible graph SHALL remain frozen at its current progression
- **WHEN** the user clicks resume
- **THEN** playback SHALL continue from the stored elapsed time rather than restarting at zero

#### Scenario: Playback completes or is replayed
- **WHEN** progression reaches the current graph total
- **THEN** the playback state SHALL become complete and all graph items SHALL be available to the live renderer
- **WHEN** the user clicks replay
- **THEN** progression SHALL reset and run the same timeline again without refetching the graph

#### Scenario: Reduced motion and renderer teardown
- **WHEN** `prefers-reduced-motion: reduce` is active and the user starts playback
- **THEN** the renderer SHALL complete playback immediately while still reporting complete progress
- **WHEN** graph data is replaced, the user leaves the graph view, or the component is destroyed
- **THEN** pending playback frames SHALL be cancelled and no playback callback SHALL run against the released renderer

#### Scenario: Playback ordering uses the existing API contract
- **WHEN** the graph API provides nodes without ctime/mtime fields
- **THEN** playback SHALL use the deterministic node array order already returned by the API
- **AND** the implementation SHALL not add timestamp fields, alter endpoint limits, or imply that the sequence is chronological file order

### Requirement: WeKnora theme and category colors
The visual renderer SHALL follow the active WeKnora light/dark theme while preserving the original category palette.

#### Scenario: Theme changes while the graph is open
- **WHEN** WeKnora changes `theme-mode`
- **THEN** the canvas background, lines, labels, active outlines, and settings UI SHALL update from WeKnora CSS variables without a graph reload

#### Scenario: Nodes render in either theme
- **WHEN** summary, entity, concept, synthesis, comparison, index, or unknown nodes are drawn
- **THEN** their fill colors SHALL remain `#0052d9`, `#2ba471`, `#e37318`, `#0594fa`, `#d54941`, and `#8c8c8c` respectively
- **AND** hover or selection SHALL use outlines and dimming rather than replacing the category fill

### Requirement: Original canvas affordances
The visual adapter SHALL retain the original graph's relationship and exploration cues.

#### Scenario: A node has unloaded neighbors
- **WHEN** its total link count exceeds its rendered neighbors and it is not the ego center
- **THEN** the graph SHALL show a dashed expansion ring
- **AND** an eligible node in ego mode SHALL expose the hover bloom action

#### Scenario: A relation is bidirectional
- **WHEN** both directed edges exist and arrows are enabled
- **THEN** the relation SHALL display arrows in both directions

### Requirement: Unchanged graph data and API contract
The visual integration SHALL pass the original graph response directly to the renderer and SHALL retain the existing overview and ego request bounds.

#### Scenario: Overview loads
- **WHEN** WikiBrowser requests an overview
- **THEN** it SHALL use the original `GRAPH_OVERVIEW_LIMIT`
- **AND** the renderer SHALL NOT prune nodes, recolor them through visual groups, or cause an additional graph request

#### Scenario: Backend receives an explicit limit
- **WHEN** a graph request exceeds the existing hard maximum
- **THEN** the backend SHALL retain its original 2,000-node clamp
