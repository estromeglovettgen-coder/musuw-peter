## ADDED Requirements

### Requirement: Reviewer fixture state is English only
The dedicated reviewer identity SHALL use English for its visible profile,
workspace, knowledge bases, source names, prompts, responses, plans, settings,
and screenshot evidence. No screenshot supplied for review SHALL contain Chinese
text or an obsolete Musnow brand.

#### Scenario: Reviewer workspace is populated
- **WHEN** fixture knowledge and conversations are created
- **THEN** every user-controlled visible value is grammatical English and represents a real supported product workflow

#### Scenario: Screenshot set is captured
- **WHEN** a production or TEST product surface is recorded for the storefront or Paddle review
- **THEN** the entire viewport is English and contains no credential, OTP, email address, recovery token, automation banner, or secret

### Requirement: One reviewer credential proves routine access
The reviewer SHALL be able to sign in to the deployed Production auth shell with
email and password, enter the product, log out, and sign in again without mailbox
access. The current paid reviewer path is the server-authorized Production
Paddle Sandbox Pro entitlement; older TEST Max evidence is historical only.

#### Scenario: Production first sign-in
- **WHEN** the reviewer enters the valid password credentials on the deployed auth page
- **THEN** the exact released auth shell establishes the identity and WeKnora sessions and opens the reviewer workspace

#### Scenario: Production re-login
- **WHEN** the reviewer logs out and submits the credentials again in a fresh auth state
- **THEN** the same workspace and its authorized English fixture data are restored

### Requirement: Paid evidence remains Sandbox-only
Paid-plan checkout and feature evidence SHALL use Paddle Sandbox or an already
authorized, correctly signed test-entitlement event. This work SHALL NOT create
a new Live charge, refund, fabricated webhook, naked SQL plan mutation, or
browser-local plan override. Paddle Live remains unauthorized.

#### Scenario: Current Sandbox Pro reviewer path
- **WHEN** the current reviewer tenant has the signed Sandbox checkout and official subscription update applied
- **THEN** the server's effective entitlement reports active Pro and the Production product exposes only the corresponding server-authorized model, video, storage, and allowance paths

#### Scenario: Historical TEST evidence is not current Production proof
- **WHEN** older TEST Max evidence is referenced
- **THEN** it is labeled historical and cannot be used to imply a current Production plan or Paddle Live authorization

### Requirement: Reviewer lifecycle proves the represented product
The reviewer lifecycle SHALL cover password authentication, knowledge-base
creation, supported source upload and completed parsing, scoped retrieval and
chat, available Flash and paid model modes, deep reasoning, the consumer-visible
tool or grounded retrieval path, video ingestion under a valid paid entitlement,
plans and Paddle checkout handoff without payment, settings, logout, re-login,
and disposable content cleanup.

#### Scenario: Knowledge document is retrieved
- **WHEN** the reviewer uploads an English fixture, waits for completed parsing, and asks for its unique verification fact from the bound knowledge base
- **THEN** the answer contains that fact and the UI exposes the represented source or grounded retrieval state

#### Scenario: Model and reasoning modes are exercised
- **WHEN** the entitlement exposes Flash, Pro, deep reasoning, or other configured choices
- **THEN** selections are made through the server-provided catalog and responses complete without bypassing plan enforcement

#### Scenario: Video is exercised
- **WHEN** the current Production reviewer has a verified Paddle Sandbox Pro entitlement and uploads the supported English video fixture with no per-upload override
- **THEN** video parsing, indexing, retrieval, and answer evidence complete through the configured default OpenRouter route

#### Scenario: Paddle handoff is inspected
- **WHEN** the reviewer selects an allowed plan and period
- **THEN** official Paddle checkout mounts with the matching server-owned mapping and testing stops before a Live payment confirmation

#### Scenario: Disposable content is cleaned up
- **WHEN** all required answers and screenshots have been recorded
- **THEN** only the reviewer fixture intended for ongoing review remains and one-off acceptance knowledge, documents, video, and conversations are removed through authorized product lifecycle actions

### Requirement: Final release evidence is exact and complete
The final source revision SHALL pass repository tests and OpenSpec strict
validation, CI, Cloudflare storefront deployment, immutable GHCR server release,
public revision or artifact binding, health checks, and real Chrome auth and
reviewer lifecycle acceptance. Completion SHALL NOT be claimed while a required
external release is queued, failed, or points to a different SHA.

#### Scenario: Final revision is released
- **WHEN** main is pushed through the repository's existing release path
- **THEN** CI, Cloudflare evidence, server evidence, running container labels, and public health all bind to the exact final commit

#### Scenario: Required production check cannot run
- **WHEN** an external provider, environment, or approval prevents a required check
- **THEN** the task remains incomplete or explicitly blocked with the failed condition, alternative evidence, and residual risk recorded
