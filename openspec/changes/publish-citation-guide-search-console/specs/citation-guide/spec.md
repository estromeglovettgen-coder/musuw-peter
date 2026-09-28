## ADDED Requirements

### Requirement: Native bilingual article
The storefront SHALL serve one short citation-checking guide at `/guides/citation-checks` in English and `/zh/guides/citation-checks` in Simplified Chinese. Both initial HTTP responses SHALL contain readable article text without JavaScript. Both variants SHALL use the same component and content source at build time and in the browser.

#### Scenario: Reader or crawler opens a fixed-language URL
- **WHEN** either guide is requested with any country, language cookie or `lang` query value
- **THEN** the URL's language, article text, title and self-canonical remain consistent
- **AND** reciprocal language links, footer discovery and sitemap entries are present
- **AND** an unknown guide slug returns 404.

### Requirement: Verifiable fictional example
The guide SHALL identify Cedar as fictional, preserve the conditional date and unknown facts, and offer its three original source documents locally with an optional Gist mirror. It SHALL NOT claim document-only retrieval or universal answer accuracy.

#### Scenario: Reader checks an answer
- **WHEN** a reader expands the source section
- **THEN** all three local Markdown links return the original plain-text documents
- **AND** the displayed screenshot contains only the authorized fictional example
- **AND** the page remains readable on mobile and in both themes.

#### Scenario: Reader plays the real product example
- **WHEN** a reader opens either language version
- **THEN** the page offers the matching 40-second recording and captions with native controls and no autoplay or eager video download
- **AND** the recording identifies fictional sources and edited waiting time, without representing the current model release as accepted
- **AND** the full video remains downloadable and no private customer material is included.

### Requirement: Public site verification
The owner-supplied Google site verification meta tag SHALL be present exactly once in the initial homepage and guide HTML and survive Worker localization.

#### Scenario: Verification before client rendering
- **WHEN** an unauthenticated client requests a localized homepage or guide
- **THEN** the response head contains the exact approved public verification token
- **AND** no client execution is required to read it.

### Requirement: Concise, sourced buying comparison
The storefront SHALL offer a concise comparison at `/compare/notebooklm` and `/zh/compare/notebooklm`. The comparison SHALL distinguish actual Musuw workflows from Google capabilities documented by official sources. It SHALL NOT claim a performance benchmark, unsupported superiority, fabricated customers, or future model availability.

#### Scenario: A buyer compares workflows
- **WHEN** a reader opens either comparison URL
- **THEN** a complete, fixed-language article with self-canonical and reciprocal language metadata is available before JavaScript runs
- **AND** the reader can open the actual Musuw demonstration, current plan page and linked official sources
- **AND** the page identifies its Musuw authorship and evidence date, with mobile table overflow contained inside a keyboard-accessible region
- **AND** footer links and the sitemap make both variants discoverable.

### Requirement: Readable initial public-page body
The homepage, media kit and eight public-document pages SHALL return their actual visible body content and primary heading without requiring JavaScript. Build-time rendering SHALL reuse their existing React components and copy. Internal rendered variants SHALL return 404 when requested directly.

#### Scenario: Country and preferred language differ
- **WHEN** a visitor requests a public page with an explicit language or saved language preference
- **THEN** the initial body, head, bootstrap and browser render SHALL use that same language
- **AND** homepage prices SHALL continue using the existing country mapping independently of language (CN/CNY, JP/JPY, other recognized countries/USD; existing language fallback when country is absent)
- **AND** refresh or client rendering SHALL NOT replace the initial currency with another currency
- **AND** localized HTML SHALL remain private/no-store with its public canonical URL, while hashed assets keep their existing caching.

#### Scenario: No script or a slow script
- **WHEN** JavaScript is unavailable or delayed
- **THEN** primary body text, homepage heading, call-to-action links and monthly prices SHALL be visible
- **AND** normal JavaScript interactions SHALL work after startup without restarting a hidden hero entrance
- **AND** HEAD requests SHALL return the localized GET headers without a body.
