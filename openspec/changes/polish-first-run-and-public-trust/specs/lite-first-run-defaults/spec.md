## ADDED Requirements

### Requirement: New Lite users start with the low-friction chat default
Musuw Lite SHALL initialize a browser with no saved chat preference to the managed DeepSeek V4 Flash model and reasoning effort `none`, without overriding an existing user choice or historical session state.

#### Scenario: New browser with no saved settings
- **WHEN** a newly registered Lite user first opens the global new-chat page
- **THEN** the resolved model is DeepSeek V4 Flash
- **AND** reasoning is disabled

#### Scenario: Existing explicit preference
- **WHEN** a user already saved an available model and reasoning effort
- **THEN** that preference remains selected

#### Scenario: Historical conversation
- **WHEN** a user opens a conversation with a recorded request state
- **THEN** the model and reasoning state from that conversation are restored for that view

### Requirement: The selected model name remains fully visible
The compact chat model overview SHALL render the complete selected model display name without replacing any part of it with an ellipsis.

#### Scenario: Model name exceeds the previous summary width
- **WHEN** the selected model name is wider than the former one-line value limit
- **THEN** the complete name remains visible in the model overview
- **AND** the value may wrap within the existing menu instead of overflowing the viewport

### Requirement: Lite onboarding is the visible subset of the original WeKnora journey
The first-run guide SHALL preserve the useful order, tone, completion behavior and visible targets of the fixed WeKnora tutorial while excluding only controls hidden from Musuw Lite.

#### Scenario: Brand-new Lite account
- **WHEN** the user enters each supported empty first-run surface
- **THEN** every original tutorial step whose target remains visible and useful is offered in its original task order
- **AND** steps for hidden member, tenant, sharing, management, sandbox or infrastructure controls are omitted

#### Scenario: Optional target is absent
- **WHEN** a responsive state or completed action removes an otherwise valid guide target
- **THEN** the existing target resolver advances or skips safely without blocking the user

#### Scenario: Guide is completed or dismissed
- **WHEN** the user completes or closes a contextual guide
- **THEN** existing per-user completion persistence prevents an unsolicited repeat

#### Scenario: Standard edition
- **WHEN** the product runs in Standard mode
- **THEN** the original WeKnora targets and replay behavior remain available
