## ADDED Requirements

### Requirement: Public trust pages remain readable in both themes
The public legal, security and contact pages SHALL use one Musuw theme contract with WCAG-readable foregrounds, stable hierarchy, non-duplicated numbering, responsive layout and preserved routes.

#### Scenario: Security page in dark mode
- **WHEN** the security page is rendered in dark mode
- **THEN** the page shell, article, title, navigation and table of contents use dark-theme surfaces and readable text contrast
- **AND** each section number appears exactly once

#### Scenario: Contact page at desktop or mobile width
- **WHEN** the contact page is rendered in either theme and supported viewport
- **THEN** operator identity, customer support, billing, privacy and security contact paths follow one aligned reading order
- **AND** primary actions remain readable and do not wrap unexpectedly

### Requirement: Contact actions resolve to real configured destinations
The contact page SHALL expose valid `mailto:` and `tel:` actions backed by the repository's declared operator destinations, and automated verification SHALL check link syntax plus non-destructive network reachability where possible.

#### Scenario: User requests email support
- **WHEN** the user activates the support email action
- **THEN** the browser opens a message addressed to the declared support mailbox with no secrets in the URL

#### Scenario: User requests telephone support
- **WHEN** the user activates the telephone action on a capable device
- **THEN** the browser opens the declared telephone destination

#### Scenario: Reachability cannot prove human monitoring
- **WHEN** DNS or link checks pass but delivery or response cannot be verified without sending a real message
- **THEN** release evidence states that limitation rather than claiming end-to-end contact success

### Requirement: Legal disclosures accurately describe the current consumer service
Musuw's public policies SHALL identify the operator and contact path, describe the categories and purposes of data handling, user controls, retention, international or vendor processing, subscription and cancellation behavior, AI input/output responsibilities and material limitations without contradictory consumer or workspace terminology.

#### Scenario: Privacy policy review
- **WHEN** a visitor reads the privacy policy
- **THEN** it can determine who operates the service, what data categories and purposes apply, how to exercise rights, how long data is kept or how retention is decided, and which vendor or cross-border disclosures are material

#### Scenario: Subscription policy review
- **WHEN** a visitor evaluates or manages a paid plan
- **THEN** renewal, cancellation, effective date, access through the paid period, refund path and Paddle's merchant role are described consistently with checkout behavior and mandatory consumer law

#### Scenario: AI service review
- **WHEN** a visitor supplies content to Musuw or relies on generated output
- **THEN** the terms describe the limited operational license, third-party model processing, user responsibility for lawful inputs and the need to verify consequential outputs without claiming ownership beyond what is necessary to provide the service

#### Scenario: Security statement review
- **WHEN** a visitor reads the security overview
- **THEN** every control is qualified to match current implementation and no absolute security, certification or incident-prevention promise is made without evidence
