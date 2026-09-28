## ADDED Requirements

### Requirement: Native MCP settings access
The system SHALL expose the existing MCP settings page to authorized consumer tenants and mechanically render the supplied workspace's service-list and editor presentation without replacing native MCP behavior.

#### Scenario: Open MCP settings
- **WHEN** a user with native MCP management permission opens Settings
- **THEN** the MCP entry, configured service cards, status, and native actions are visible

### Requirement: Full native remote MCP form
The MCP editor SHALL expose the complete existing remote-service configuration supported by WeKnora without adding a new transport or credential model.

#### Scenario: Configure a remote service
- **WHEN** an authorized tenant administrator adds or edits an MCP service
- **THEN** the form uses the existing name, description, enabled state, SSE or Streamable HTTP transport, URL, headers, authentication, credentials, OAuth, connection test, and save contracts that are applicable to that service

#### Scenario: Preserve native authorization
- **WHEN** a user without native create or update permission views MCP settings
- **THEN** tenant and role enforcement prevents unauthorized mutation even if the route is visible

### Requirement: Smart-agent MCP selection
The system SHALL allow smart-reasoning agents to select configured and enabled native MCP services and SHALL hide MCP selection for quick-answer agents.

#### Scenario: Select MCP services for smart reasoning
- **WHEN** a user edits a smart-reasoning agent
- **THEN** the editor can save native none or selected MCP scope using services visible to the tenant

#### Scenario: Switch to quick answer
- **WHEN** an agent is changed from smart reasoning to quick answer
- **THEN** the MCP section disappears and chat uses the native quick-answer path without invoking MCP tools

### Requirement: MCP settings support both themes
The MCP page, cards, status controls, drawer, overlay, fields, authentication states, advanced settings, tests, errors, and actions SHALL remain readable and operable in light and dark mode.

#### Scenario: Configure MCP in dark mode
- **WHEN** an authorized tenant administrator opens the MCP drawer in dark mode
- **THEN** all reference sections load, preserve native values, and remain visually distinguishable and usable
