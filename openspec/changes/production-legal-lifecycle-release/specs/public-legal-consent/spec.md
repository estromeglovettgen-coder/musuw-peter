> The voluntary 30-day refund scenario in this historical spec was superseded by the `MODIFIED Requirements` in `remove-voluntary-refund-guarantee/specs/public-legal-consent/spec.md`.

## ADDED Requirements

### Requirement: Auth entry exposes an adjacent legal continuation notice
The logged-out auth shell SHALL display direct links to the canonical public
Terms of Service and Privacy Policy in the active locale. The notice MUST
distinguish agreement to the Terms from acknowledgement of the Privacy Policy,
and Google and email-code initiation MUST remain available without a separate
checkbox prerequisite.

#### Scenario: User opens the sign-in form
- **WHEN** a logged-out user opens the sign-in form
- **THEN** Google and email-code initiation are available and the adjacent continuation notice links directly to both legal documents

#### Scenario: User continues with an authentication method
- **WHEN** the user activates Google or valid email-code continuation
- **THEN** the existing authentication action starts without a checkbox gate and without adding a new identity or consent service

#### Scenario: User is entering a received email code
- **WHEN** an email code has already been requested
- **THEN** code verification remains available and the legal links remain visible

### Requirement: Public policies match the live service
The bilingual public legal suite MUST identify the Musuw operator and contact,
describe actual data categories, purposes, retention determination, rights and
account-deletion channels, cross-border processing, and name the live external
provider roles. It MUST NOT identify an unavailable provider as active, claim
an unimplemented control, expose a secret, or replace mandatory consumer
rights with Musuw's voluntary terms.

#### Scenario: Visitor reads the Privacy Policy before authentication
- **WHEN** a visitor opens the canonical Privacy Policy from the auth shell
- **THEN** the page is public, responsive, bilingual, names the live identity, edge/storage, AI, and payment provider roles, and explains how to exercise privacy and deletion rights

#### Scenario: Visitor reads purchase terms
- **WHEN** a visitor opens the Terms, Refund, or Subscription document
- **THEN** the page distinguishes Musuw product terms from Paddle's Merchant-of-Record terms, explains renewal and cancellation, links Paddle's current buyer/refund/support routes, preserves mandatory rights and Musuw's 30-day money-back guarantee, and does not invent a support deadline

#### Scenario: Reviewer checks URL and video product boundaries
- **WHEN** a visitor or merchant reviewer opens the Acceptable Use Policy
- **THEN** URL imports and video uploads are limited to private knowledge indexing or analysis of content the user owns or is authorized to use, and the product does not represent itself as a streaming downloader, public video host, or redistribution service
