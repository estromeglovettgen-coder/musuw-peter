## ADDED Requirements

### Requirement: Peter settings focus on tasks he performs
The Peter interface SHALL expose customer, knowledge, agent, model, and skill actions while hiding routine access to sandbox administration, server storage/parser/vector internals, chunking, advanced settings, image/audio setup, graph extraction setup, and interface/code font controls. Hidden controls MUST retain their saved values and backend behavior.

#### Scenario: Open normal settings
- **WHEN** Peter opens settings or creates a knowledge base
- **THEN** the navigation presents the applicable business controls without the hidden operational controls, and Wiki and entity graph navigation remain available

#### Scenario: Save after hidden settings
- **WHEN** Peter edits and saves a knowledge base that has values in hidden operational fields
- **THEN** those values remain unchanged unless he explicitly changes a visible related setting

### Requirement: Skills work without sandbox administration
The Peter interface SHALL use the existing default sandbox when installing and assigning skills, while the native runtime continues to enforce sandbox isolation and authorization.

#### Scenario: Install and use a skill
- **WHEN** an administrator installs a valid skill and selects it for a compatible agent
- **THEN** the saved agent can execute that skill with the default sandbox without Peter selecting or creating a sandbox configuration

#### Scenario: Unavailable sandbox
- **WHEN** no usable default sandbox exists
- **THEN** installation or assignment shows an actionable failure instead of appearing successful

#### Scenario: Unauthorized actor
- **WHEN** a user without native skill administration rights attempts installation
- **THEN** the backend denies the operation despite the simplified interface
