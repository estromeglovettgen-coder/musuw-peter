## ADDED Requirements

### Requirement: Native agent lifecycle and cards
The system SHALL expose the existing WeKnora custom-agent list, creation, editing, deletion, and selection workflows using the supplied workspace's card and empty-state presentation. Musuw SHALL NOT add a separate agent enablement or disablement lifecycle.

#### Scenario: Manage agents
- **WHEN** an authorized user opens the agent surface
- **THEN** the user can view agent cards and use the existing create, edit, duplicate where supported, and delete actions

### Requirement: Reduced native agent editor
The system SHALL expose agent name, description, quick-answer or smart-reasoning mode, conversation model, one system prompt, and knowledge-base scope while using the existing `CustomAgentConfig` contract.

#### Scenario: Configure a quick-answer agent
- **WHEN** a user selects quick answer
- **THEN** the editor shows the quick-answer default system prompt, model, basic information, and knowledge-base scope and hides MCP and expert controls

#### Scenario: Configure a smart-reasoning agent
- **WHEN** a user selects smart reasoning
- **THEN** the editor shows the smart-reasoning default system prompt, model, basic information, knowledge-base scope, and MCP service selection

#### Scenario: Hide expert controls
- **WHEN** either mode is edited
- **THEN** agent type presets, file-type restriction, auxiliary prompts, tuning parameters, raw tool selection, skills, iterations, and timeout controls are absent from the consumer UI

### Requirement: Native knowledge scope
The agent editor SHALL preserve the native all, selected, and none knowledge-base scope choices, selected knowledge-base picker, and optional retrieve-only-when-mentioned behavior.

#### Scenario: Save selected knowledge bases
- **WHEN** a user chooses selected scope and one or more accessible knowledge bases
- **THEN** the existing knowledge-base IDs and native mention behavior are saved on the agent

### Requirement: Chat agent selection
The chat composer SHALL expose the native agent, model, and supported reasoning controls inside one grey capsule that visually follows the supplied workspace reference.

#### Scenario: Select and use an agent
- **WHEN** a user selects an accessible agent in chat
- **THEN** subsequent requests use that agent through the existing quick-answer or smart-reasoning execution path

#### Scenario: Open the combined capsule
- **WHEN** a user opens the grey chat capsule
- **THEN** Agent, Model, and the native reasoning control are shown in the reference order and each row invokes the existing WeKnora selector or handler

#### Scenario: Preserve native selection state
- **WHEN** a user changes an agent, model, or supported reasoning setting
- **THEN** the existing WeKnora stores, request fields, readiness checks, and session behavior are used without a parallel picker state machine

### Requirement: Agent surfaces support both themes
The agent list, cards, editor, selector, capsule, menus, and validation states SHALL be readable and operable in light and dark mode.

#### Scenario: Use an agent in dark mode
- **WHEN** the application is in dark mode
- **THEN** all agent controls, overlays, inputs, helper text, focus states, and actions remain visible and functional

### Requirement: Lite web search is mandatory and hidden
The system SHALL force the existing native web-search capability on for every Lite knowledge or agent chat request while keeping the consumer toggle hidden, and SHALL leave Standard request behavior unchanged.

#### Scenario: Client omits or disables web search
- **WHEN** a Lite knowledge-chat or agent-chat request omits `web_search_enabled` or supplies `false`
- **THEN** the router and runtime execute it with web search enabled

#### Scenario: Standard chooses web search
- **WHEN** a Standard request supplies either web-search value
- **THEN** the runtime preserves that value
