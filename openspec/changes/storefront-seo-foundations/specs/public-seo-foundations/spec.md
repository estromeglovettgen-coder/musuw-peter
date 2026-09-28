## ADDED Requirements

### Requirement: Deterministic public homepage language
The storefront SHALL serve Chinese at `/` and English at `/en`, with self-canonical URLs and reciprocal hreflang. Cookies and country MUST NOT change the language of these URLs. Regional pricing MUST retain its existing independent behavior.

#### Scenario: Conflicting saved preference
- **WHEN** an English-preferring visitor from outside China requests `/`
- **THEN** the HTML and hydrated page are Chinese, and prices use the existing regional calculation

#### Scenario: English page from China
- **WHEN** a Chinese-preferring visitor in China requests `/en`
- **THEN** the HTML and hydrated page are English with canonical `https://musuw.com/en`

### Requirement: Canonical document redirects and discovery
Legacy homepage language queries and www document URLs SHALL permanently redirect to the corresponding canonical URL without losing non-language query parameters. Public article URLs MUST remain stable. Private API, widget and partner boundaries MUST be preserved.

#### Scenario: Legacy English homepage alias
- **WHEN** a visitor requests `https://www.musuw.com/?lang=en&source=example`
- **THEN** it redirects in one hop to `https://musuw.com/en?source=example`

#### Scenario: Existing article
- **WHEN** a crawler requests either language of an existing comparison or citation guide
- **THEN** it receives crawlable article content at its existing URL with matching canonical and language metadata

### Requirement: Crawlable useful content and metadata
The homepage SHALL link to the existing comparison, citation guide and official docs using ordinary anchor links. Language links SHALL reach corresponding variants. Article headings, author attribution and dates SHALL be visible and consistent with structured data. Website identity MUST NOT change with the current page.

#### Scenario: Homepage content discovery
- **WHEN** a user or crawler reads either homepage language
- **THEN** it can follow links directly to the correct-language guide and comparison

#### Scenario: Article revision
- **WHEN** a revised article renders
- **THEN** its structured publication/revision dates match verified history and its visible dates, with a separate WebPage linked to a stable WebSite

### Requirement: Evidence-based production completion
Release acceptance SHALL verify built and live routes, metadata, redirects, mobile layout, public analytics boundaries and required CI. Indexing and real-user performance reports SHALL be reported with their dates and data availability, without claiming guaranteed ranking or indexing.

#### Scenario: Insufficient field data
- **WHEN** Search Console reports insufficient Core Web Vitals data
- **THEN** acceptance records the limitation and does not label the site's real-user performance passed or failed
