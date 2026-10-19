## ADDED Requirements

### Requirement: User surfaces preserve native agent and depth choices
The Peter workspace SHALL offer agent selection and native reasoning depth while hiding provider/model names and model choice paths. The webpage-import entry SHALL be hidden while file, folder and manual import continue to work.
This presentation boundary SHALL also apply to agent editing, knowledge-base/target editing, uploads, memory and history settings. Native model IDs and server-managed processing configuration SHALL be retained. New custom agents SHALL be named “我的智能体” by default, without changing existing user-defined names. Onboarding SHALL omit model configuration steps. Skills settings SHALL be hidden in Fire without deleting configuration.

#### Scenario: Desktop and mobile selection
- **WHEN** a user opens the chat selector with mouse, touch or keyboard
- **THEN** the actual selected agent/depth changes, the model remains managed and no model name appears in text, title or accessible labels

### Requirement: Taylor is the managed default
Every managed Fire account SHALL start a fresh conversation with Taylor, using the administrator's current source-agent prompts and applicable configuration. Personal agent choices SHALL remain available after an explicit selection. Ordinary native built-ins SHALL not be injected as alternative defaults; historical IDs SHALL remain resolvable. Reading a default SHALL not enroll an unauthorized tenant or grant source credentials.

#### Scenario: Administrator updates Taylor
- **WHEN** the source administrator saves Taylor's prompt or model configuration
- **THEN** an already provisioned account's next native agent read uses the new configuration while retaining its own tenant and protected shared-course scope

### Requirement: Target conversation handoff preserves the outgoing message
Selecting a course knowledge base and one target SHALL send the outgoing message exactly once to the correctly bound session, whether the chat component mounts or is reused after a route change. Continuation SHALL retain selected public-course scope and omit other targets. A failed preparation SHALL keep the unsent text editable, and history loading SHALL not replace an outgoing turn.

#### Scenario: Switch to a target from an existing conversation
- **WHEN** a user selects a target in an unbound conversation and sends a question with a course reference
- **THEN** the new bound session shows the question and answer, retains the composer, and does not stop at an empty suggested-question screen

### Requirement: Membership and management use real protected data
The homepage SHALL keep only the avatar entry; clicking it SHALL reveal plan expiry and remaining-allowance percentage with loading/error/expired/exhausted states. Ordinary-user UI SHALL NOT display Token counts, Token wording, or a usage-detail page; exact ledger usage SHALL remain available in the protected SystemAdmin console. Only SystemAdmin SHALL access the management console, create accounts/plans or adjust a user's package. The UI SHALL reuse Musuw patterns, avoid amounts/count-based quota and provide copyable creation credentials without later plaintext retrieval.

#### Scenario: Expired member opening history
- **WHEN** an expired user logs in and opens a previous conversation
- **THEN** content is readable and the quota card explains why new model work requires renewal

### Requirement: User sandbox and skill pause is reversible
When FIRE_USER_EXECUTION_PAUSED is enabled in Fire, ordinary-user agent runs SHALL omit sandbox and skill tools and skill metadata, and related endpoints and UI entries SHALL be unavailable. Stored agent configuration, code, skills and files SHALL remain intact. SystemAdmin maintenance SHALL retain its capabilities. Wiki, RAG and graph retrieval SHALL retain their tools, parameters and result budgets.

#### Scenario: Restore execution capabilities
- **WHEN** the operator disables the pause flag and restarts the application
- **THEN** existing saved sandbox and skill settings become effective again without reprovisioning user accounts
