## ADDED Requirements

### Requirement: Storefront communicates the current Musuw product
The public home page SHALL explain that Musuw preserves private sources, parses
supported files, answers within an authorized knowledge scope, exposes exact
evidence, maintains Wiki and graph views, supports the configured model catalog,
and provides visible export and deletion workflows. It SHALL NOT present
unverified customer stories, customer counts, performance metrics, future
capabilities, or copied reference-site brand content as current facts.

#### Scenario: Foreign reviewer scans the home page
- **WHEN** a reviewer reads the English page from navigation through footer
- **THEN** the value proposition, principal product workflow, security boundary, pricing, contact, and legal routes are understandable without product-domain guesses

#### Scenario: Hidden legacy content remains in source
- **WHEN** the storefront production bundle is built
- **THEN** the horizontal capability marquee, user-story/testimonial section, and social links are not rendered even though their source components or assets have not been deleted

### Requirement: Product stories use bounded real media
Each public product story SHALL use a current English capture of the real Musuw
product in a bounded responsive frame. The layout SHALL avoid oversized empty
rectangles, raster upscaling, text embedded at unreadable size, layout shift,
or more than two consecutive mirrored image-and-copy sections.

#### Scenario: Product story renders on desktop
- **WHEN** a current English screenshot is wider than its display slot
- **THEN** the browser uses the declared intrinsic dimensions and a bounded aspect ratio without upscaling or large empty media padding

#### Scenario: Product story renders on mobile
- **WHEN** viewport width is below the mobile breakpoint
- **THEN** copy and media form one readable column with no horizontal overflow and no screenshot text clipped by object-fit

#### Scenario: Screenshot contains a forbidden artifact
- **WHEN** an asset contains Chinese text, Musnow branding, email, OTP, secret, automation banner, browser chrome, or unrelated test data
- **THEN** the asset fails the storefront media contract and cannot be referenced by a production section

### Requirement: Calls to action are intentional and non-repetitive
The navigation and hero SHALL retain the primary login and start-free conversion
paths. Feature sections SHALL NOT repeat `View Plans` or another pricing action.
Pricing actions SHALL remain in the pricing area and final conversion area only.

#### Scenario: Reviewer scrolls product stories
- **WHEN** the reviewer passes through consecutive feature sections
- **THEN** no repeated plan button interrupts the product explanation

### Requirement: Pricing comparison reflects enforced entitlements
The existing pricing-card and comparison-table visual system SHALL describe the
server-enforced Free, Plus, Pro, and Max distinctions. It SHALL group rows by
workspace limits, ingestion, model access, AI allowance, connected knowledge,
and account/data controls, and SHALL omit unsupported team or support promises.

#### Scenario: Free is compared with paid plans
- **WHEN** a visitor reads the comparison
- **THEN** Free shows 1 GiB, one knowledge base, ten documents, no video, and the entry model set while all four plans show grounded chat, citations, Wiki, graph, export, and deletion

#### Scenario: Paid tiers are compared
- **WHEN** a visitor compares Plus, Pro, and Max
- **THEN** storage is 10, 30, and 100 GiB, monthly AI allowance increases according to the current entitlement contract, and all three show the configured paid models, video ingestion, and no plan cap on knowledge-base or document count

#### Scenario: Localized price is unavailable
- **WHEN** Paddle PricePreview or an allowed checkout mapping is unavailable
- **THEN** the page reports that pricing or checkout is unavailable and does not invent currency, tax, discount, or activation state

### Requirement: Contact and footer are concise
Contact SHALL use a direct two-part composition with a short support statement,
the real contact method, and relevant legal or response context. Footer social
links SHALL be hidden. The visible copyright SHALL be exactly `© 2026 musuw. All rights reserved.`
and the existing product, trust, and legal routes SHALL remain accessible.

#### Scenario: Contact page opens
- **WHEN** a visitor follows Contact
- **THEN** a focused Musuw contact composition renders without copied ClientHub text, customer data, or a fabricated response promise

#### Scenario: Footer renders
- **WHEN** any storefront page reaches its footer
- **THEN** no social icon is visible and the copyright text is exactly `© 2026 musuw. All rights reserved.`

### Requirement: Search and share surfaces use the canonical Musuw mark
The storefront SHALL expose one approved Musuw mark through favicon sizes,
apple-touch-icon, web manifest, canonical metadata, Open Graph or Twitter image,
and JSON-LD organization logo. No active metadata SHALL reference the obsolete
circular or Musnow mark.

#### Scenario: Deployed metadata is inspected
- **WHEN** a crawler requests the canonical home page and referenced brand assets
- **THEN** all URLs are public, canonical, square where required, cacheable, and visually match the Musuw header mark

#### Scenario: Search result remains stale immediately after release
- **WHEN** a search engine has not yet recrawled the deployed metadata
- **THEN** release evidence reports the verified source and recrawl request without claiming that external indexing changed instantly
