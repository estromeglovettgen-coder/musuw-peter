## ADDED Requirements

### Requirement: Lite exposes workspace and personal memory settings
Lite SHALL expose personal memory management and the complete workspace memory policy to members through Musuw's existing settings shell; only authorized admins may update the workspace policy.

#### Scenario: Member manages personal memory
- **WHEN** a Lite member opens My Memory
- **THEN** the member can enable, inspect, confirm, add, edit, forget, export, consolidate, or clear only that member's memory

#### Scenario: Admin configures workspace memory
- **WHEN** a Lite admin opens Long-term Memory
- **THEN** common controls are directly visible and every remaining memory setting is visible in one expandable Advanced section
- **AND** settings that do not apply to the selected write or recall mode remain visible but disabled with an explanation
- **AND** saving uses the same validated complete memory configuration contract as Standard

#### Scenario: Non-admin opens workspace memory deep link
- **WHEN** a Lite non-admin navigates directly to workspace memory policy
- **THEN** the complete policy remains visible in read-only form while update authority stays Admin-only

#### Scenario: Memory visual structure
- **WHEN** a member views personal or workspace Memory in desktop, narrow, light, or dark mode
- **THEN** headers, notices, direct controls, Advanced disclosure, list toolbar, rows, actions, empty/loading/error states, and control widths follow the existing Musuw settings component rhythm
- **AND** upstream cards, oversized tab chrome, or independent form spacing do not create a second settings design language

### Requirement: Memory use remains understandable in chat and agents
Lite SHALL present memory as a user-controlled product behavior in chat and agents while keeping detailed model, vector, and scheduling choices in the workspace Memory settings page.

#### Scenario: Answer uses memory
- **WHEN** a Lite answer actually uses stored memory
- **THEN** the chat displays the existing compact memory row and allows the owner to forget an item

#### Scenario: Agent memory control
- **WHEN** a Lite user edits an eligible agent
- **THEN** memory is expressed as a plain product control that respects workspace and personal policy

#### Scenario: Agent and upload settings remain in the same visual family
- **WHEN** an exposed Agent or upload-time setting uses a selector, segmented choice, disclosure, or attachment option
- **THEN** it is placed in the shared Musuw setting-row structure, remains fully readable without horizontal clipping, and collapses to the existing narrow layout

### Requirement: Low-cost main chat improvements remain available
Lite SHALL retain stable main chat improvements that do not require Sandbox or Skills, including question navigation, message dates, Mermaid streaming improvements, memory rows, and ordinary attachment/document preview.

#### Scenario: Ordinary conversation
- **WHEN** a Lite user conducts a normal knowledge or agent conversation
- **THEN** eligible low-cost improvements work without displaying Sandbox, Skill, command, environment-variable, or generated-artifact controls
