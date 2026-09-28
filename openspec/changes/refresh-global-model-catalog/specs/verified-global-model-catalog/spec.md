## ADDED Requirements

### Requirement: Verified shared choices
The system SHALL expose only model endpoints that pass their configured inference interface during release acceptance and SHALL use the same global catalog across homepage, agent editor and scene settings.

#### Scenario: Newly admitted model
- **WHEN** a paid user opens each conversation-model selector
- **THEN** verified Grok, Kimi, current GPT and Gemini options are selectable and complete a real response.

### Requirement: Compatible retirement
The system SHALL remove retired provider endpoints while retaining working saved choices when a compatible replacement exists, without changing plan rules.

#### Scenario: Retired MiniMax free endpoint
- **WHEN** a user has saved the previous MiniMax model ID
- **THEN** it resolves to the verified MiniMax endpoint with an accurate label and existing plan authorization.

### Requirement: Staging acceptance with production held
The release SHALL include actual staging application response and selector evidence, plus native-interface probes for exposed auxiliary model types. Production SHALL retain its existing revision until the user separately authorizes promotion.

#### Scenario: Staging verification
- **WHEN** the updated release is deployed to staging
- **THEN** defaults, new selections and saved compatible selections work, unavailable endpoints are absent, and production is not promoted.

### Requirement: Native capability compatibility
The system SHALL preserve catalog requirements in the actual vision and transcription request formats.

#### Scenario: Mandatory vision reasoning
- **WHEN** the selected vision model requires reasoning
- **THEN** image extraction does not send an unsupported disabled-reasoning override.

#### Scenario: JSON-only transcription
- **WHEN** GPT-4o mini transcription is selected
- **THEN** the native request uses JSON while existing Whisper selections retain verbose JSON and segment timestamps.

### Requirement: Lowest enabled reasoning default
New custom agents and agents missing a saved thinking preference SHALL enable thinking by default. Each managed chat model that supports reasoning SHALL default to its lowest supported enabled effort. Mandatory models SHALL never send disabled reasoning even for legacy saved agents.

#### Scenario: New model or invalid saved effort
- **WHEN** the user selects a different model or its saved effort is unsupported
- **THEN** the homepage picker selects the lowest supported enabled depth, and models without reasoning have no depth controls.

#### Scenario: Explicit preference and refresh
- **WHEN** the user manually selects a supported depth and reloads with the same model
- **THEN** that depth is preserved; a missing catalog while loading does not overwrite it.

#### Scenario: First message and restored conversation
- **WHEN** the user sends from the homepage or restores a conversation
- **THEN** the actual request uses the displayed model and supported depth, the first-message depth survives navigation, and conversation restoration does not overwrite the browser’s saved defaults.
