## ADDED Requirements

### Requirement: Frictionless authentication notice
The authentication shell SHALL offer Google and valid email-code continuation without requiring a separate legal-consent checkbox, and SHALL display locale-correct direct links to the Terms and Privacy Policy adjacent to the authentication actions.

#### Scenario: User begins Google authentication
- **WHEN** Google authentication is available and the user activates its button
- **THEN** the native Google authentication flow starts without any checkbox prerequisite and the Terms and Privacy links remain available on the page

#### Scenario: User requests an email code
- **WHEN** the user enters a valid email address and activates the email continuation action
- **THEN** the code request starts without any checkbox prerequisite and the legal notice states that continuing carries the displayed legal meaning

### Requirement: Complete authentication states
The authentication shell MUST expose accessible idle, invalid-input, submitting, sent-code, retry-wait, retry-ready, verification, provider-error, and recovery states in both supported locales and at narrow viewport widths.

#### Scenario: Email code was sent
- **WHEN** the production provider accepts a code request
- **THEN** the shell presents the code-entry state, masks the destination, prevents accidental duplicate submission during the wait period, and exposes retry when allowed

#### Scenario: Provider request fails
- **WHEN** Google or email-code authentication fails
- **THEN** the relevant action becomes usable again and an inline or contextual error identifies a safe next action without exposing provider secrets

### Requirement: Scalable model and reasoning selection
The chat composer SHALL present model and reasoning choices in a viewport-bounded, aligned, scrollable, keyboard-operable selector that preserves complete labels and all existing entitlement and inference contracts.

#### Scenario: Catalog contains many models
- **WHEN** the user opens a model catalog larger than the visible overlay capacity
- **THEN** the user can efficiently scan and scroll a compact single-line catalog, read each complete model label, identify the selected model, and choose an entitled model without horizontal overflow or secondary explanatory copy

#### Scenario: User changes reasoning effort
- **WHEN** the user opens the reasoning view and selects an available effort
- **THEN** the selector presents only the available effort labels and selected check, displays the new effort after selection, and the next chat request uses the same existing reasoning parameter contract

#### Scenario: User operates the selector by keyboard
- **WHEN** focus is on the selector trigger or an open option list
- **THEN** Enter, Space, arrow keys, and Escape perform the expected open, navigation, selection, back, and close behavior while restoring a predictable focus target

### Requirement: Unified settings workspace
The consumer settings shell SHALL present General, Usage and billing, and User profile in one coherent two-pane desktop workspace with search, consistent grouped rows, and a full-height narrow-screen fallback.

#### Scenario: Lite user navigates settings
- **WHEN** a Lite user opens settings on a desktop viewport
- **THEN** only the three authorized sections appear in the sidebar, the active section is visually and semantically identified, and its content appears in the main pane at a readable width

#### Scenario: User filters settings navigation
- **WHEN** the user types a query into settings search
- **THEN** matching authorized sections remain selectable, nonmatching sections are hidden, and no unauthorized section is revealed or opened

#### Scenario: User opens settings on a narrow viewport
- **WHEN** the settings viewport cannot accommodate both panes
- **THEN** navigation and content remain reachable in a single-column full-height layout without clipped values, controls, or close/back actions

### Requirement: Product-shell compatibility
The redesign MUST preserve existing routes, authentication runtime calls, model identifiers, reasoning values, plan gates, permission checks, settings values, provider boundaries, dark-mode behavior, and reduced-motion behavior.

#### Scenario: Existing consumer workflow runs after redesign
- **WHEN** a user authenticates, changes an appearance setting, selects an entitled model and reasoning effort, and sends a chat request
- **THEN** the same underlying runtime, persistence, entitlement, and request contracts are used and no new service or data store is involved
