# Public-site analytics

## ADDED Requirements

### Requirement: Optional and affirmative collection
The website SHALL load the official Google tag only when a valid public measurement ID is configured, the host and path identify a supported public Musuw page, and the visitor has explicitly accepted analytics. Missing configuration SHALL hide unnecessary analytics controls. Rejection and acceptance SHALL have equal prominence.

#### Scenario: No affirmative choice
- **WHEN** configuration is absent/invalid, or the visitor has not accepted
- **THEN** no Google analytics script loads and no analytics event is queued

#### Scenario: Consent across visits
- **WHEN** a saved acceptance or rejection is restored
- **THEN** acceptance initializes once and rejection remains unloaded

### Requirement: Minimize public visit data
The site SHALL explicitly send only public page views; Google may additionally create its standard session and engagement events. Page URLs SHALL exclude query strings and fragments; referrals SHALL contain only the source origin. The implementation SHALL disable advertising features and SHALL NOT send account identity, search text, chat or document content. Enhanced measurement must be disabled in the provider configuration before activation.

#### Scenario: Sensitive link parameters
- **WHEN** a public URL/referrer has query parameters or fragments
- **THEN** those values do not appear in queued Google tag commands

### Requirement: Withdrawal
The visitor SHALL be able to withdraw through the footer. Withdrawal SHALL set Google's collection disable flag before clearing this domain's GA cookies and reloading to unload the SDK. If preference persistence is blocked, the current page SHALL remain disabled without reloading into stale consent. Other tabs SHALL respect a changed/removed preference.

#### Scenario: Withdraw accepted analytics
- **WHEN** an accepted visitor withdraws
- **THEN** collection is disabled, GA cookies are cleared, and a persisted rejection prevents reinitialization

### Requirement: Deployment input
The storefront production build SHALL consume the public repository variable `VITE_GA_MEASUREMENT_ID`. Empty input SHALL remain an operational disabled state. Enabling is a separate provider/account and production acceptance step.

#### Scenario: Public measurement configuration
- **WHEN** the existing production workflow builds with a configured measurement ID
- **THEN** Vite includes that value in the tested bundle; without one, the public site remains usable with analytics disabled
