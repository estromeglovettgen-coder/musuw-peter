## ADDED Requirements

### Requirement: User surfaces preserve native agent and depth choices
The Peter workspace SHALL offer agent selection and native reasoning depth while hiding provider/model names and model choice paths. The webpage-import entry SHALL be hidden while file, folder and manual import continue to work.

#### Scenario: Desktop and mobile selection
- **WHEN** a user opens the chat selector with mouse, touch or keyboard
- **THEN** the actual selected agent/depth changes, the model remains managed and no model name appears in text, title or accessible labels

### Requirement: Membership and management use real protected data
The homepage SHALL show readable plan expiry and Token consumption with loading/error/expired/exhausted states. Only SystemAdmin SHALL access the management console, create accounts/plans or adjust a user's package. The UI SHALL reuse Musuw patterns, avoid amounts/count-based quota and provide copyable creation credentials without later plaintext retrieval.

#### Scenario: Expired member opening history
- **WHEN** an expired user logs in and opens a previous conversation
- **THEN** content is readable and the quota card explains why new model work requires renewal
