## ADDED Requirements

### Requirement: Password and existing identity methods coexist
The auth shell SHALL offer Google OAuth, email-and-password, and email OTP
without replacing the existing Supabase identity authority or WeKnora OAuth
continuation. A successful identity method SHALL resume the same pending
authorization or checkout intent and SHALL NOT create a parallel application
session mechanism.

#### Scenario: Existing user signs in with password
- **WHEN** a user submits a valid email and password
- **THEN** Supabase creates the identity session and the existing runtime resumes the authorized WeKnora workspace continuation

#### Scenario: User selects Google
- **WHEN** a user selects Google from the revised auth page
- **THEN** the current PKCE Google flow, allowlisted callback, and account-selection behavior remain unchanged

#### Scenario: User selects email code
- **WHEN** a user chooses the email-code alternative
- **THEN** the current six-digit OTP send, cooldown, masked destination, verify, and continuation behavior remains available

#### Scenario: Checkout intent survives password login
- **WHEN** an anonymous visitor reaches auth from an allowed plan and billing-period intent and signs in with a password
- **THEN** the same validated intent is restored after native session completion without trusting an arbitrary redirect

### Requirement: Users can create password accounts
The auth shell SHALL provide an explicit Create account mode using Supabase Auth
with email, password, and password confirmation. Supabase SHALL remain
authoritative for password policy, email confirmation, duplicate identity, and
session issuance. The browser SHALL NOT store a password outside the live form.

#### Scenario: Registration creates an immediately usable session
- **WHEN** Supabase accepts registration and returns a session
- **THEN** the runtime resumes the same WeKnora authorization path used by other identity methods

#### Scenario: Registration requires email confirmation
- **WHEN** Supabase accepts registration but requires email confirmation
- **THEN** the auth page shows a generic check-your-email state and does not claim the product session is active

#### Scenario: Confirmation opens in a new tab
- **WHEN** the confirmation email opens the allowlisted callback in a new browser tab
- **THEN** the exact short-lived PKCE verifier is consumed once, no session token or password is shared across tabs, and the existing continuation resumes

#### Scenario: Password confirmation differs
- **WHEN** the two password fields do not match
- **THEN** submission stays local, an inline error is associated with the confirmation field, and no provider request is sent

#### Scenario: Provider rejects the password
- **WHEN** Supabase rejects a password under its current policy
- **THEN** the page shows bounded password guidance without rendering raw provider diagnostics or secrets

### Requirement: Password recovery is complete and non-enumerating
The auth shell SHALL provide Forgot password, generic request acknowledgement,
recovery callback, new-password confirmation, expired-link recovery, and return
to sign-in states through Supabase's official recovery APIs. The request result
SHALL NOT disclose whether the submitted email has an account.

#### Scenario: Recovery request is submitted
- **WHEN** a visitor submits any syntactically valid email on the recovery form
- **THEN** the page shows the same acknowledgement regardless of account existence

#### Scenario: Recovery callback is valid
- **WHEN** Supabase establishes a valid recovery session at an allowlisted auth route
- **THEN** the user can set and confirm a new password and then return to normal sign-in or the active workspace

#### Scenario: Recovery opens in a new tab and refreshes once
- **WHEN** the recovery email opens in a new tab and the user refreshes after exchange but before submitting the new password
- **THEN** the one-time callback parameters are absent from browser history, the short-lived recovery marker is validated against the real session, and the update form remains available

#### Scenario: Recovery callback is invalid or expired
- **WHEN** the recovery token is absent, invalid, used, or expired
- **THEN** no password is changed and the page offers a new generic recovery request

### Requirement: Auth interaction follows mature form contracts
The auth surface SHALL use one focused card with explicit Sign in and Create
account paths, visible labels, password visibility controls, correct autocomplete
tokens, inline field errors, disabled duplicate submission, recovery actions,
keyboard operation, mobile fit, dark-mode fit, reduced-motion handling, and a
direct Terms and Privacy continuation notice. Legal acknowledgement SHALL NOT be
a checkbox gate.

#### Scenario: Sign-in page loads
- **WHEN** an unauthenticated visitor opens the production auth entry
- **THEN** the card presents the Musuw brand, Google, password sign-in, email-code alternative, Create account, recovery, and direct legal links without unrelated product content

#### Scenario: Password is visible on demand
- **WHEN** a keyboard or pointer user activates the password visibility control
- **THEN** only the relevant field type and accessible label change and the password value is not copied or logged

#### Scenario: Busy operation is active
- **WHEN** an identity request is in flight
- **THEN** competing actions are disabled, a localized progress state is exposed, and a second provider request cannot be submitted

#### Scenario: Auth locale is English
- **WHEN** the selected auth locale is English
- **THEN** every visible auth, validation, recovery, confirmation, and legal string is English

### Requirement: Reviewer credentials remain outside shipped artifacts
One dedicated reviewer identity SHALL support routine password sign-in without
mailbox access. Its password and recovery material MUST remain only in approved
secret storage and the authorized review portal; they MUST NOT appear in source,
build artifacts, screenshots, logs, DOM snapshots, test fixtures, or assistant
output.

#### Scenario: Reviewer credentials are provisioned
- **WHEN** the reviewer password is created or rotated
- **THEN** it is stored in macOS Keychain and supplied to the review channel without being committed or printed

#### Scenario: Reviewer signs in after logout
- **WHEN** the reviewer logs out and re-enters the same valid credentials
- **THEN** password sign-in restores the same reviewer workspace without requiring a new OTP
