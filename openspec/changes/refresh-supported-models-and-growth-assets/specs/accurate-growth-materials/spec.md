## ADDED Requirements

### Requirement: Entitlement-accurate copy
Marketing SHALL describe current plan capabilities accurately in English and Simplified Chinese and SHALL NOT claim free webpage or video-link import.

#### Scenario: Free-plan visitor
- **WHEN** a visitor reads the pricing card or import FAQ
- **THEN** Free is described as supporting documents and notes
- **AND** webpage and supported video-link import is identified as requiring a paid plan.

### Requirement: Evidence-based marketing delivery
Published material SHALL use verified product behavior and authentic demonstration assets without invented customers, metrics or endorsements. Execution records SHALL distinguish drafts, submitted reviews and verified public publication.

#### Scenario: Directory submission
- **WHEN** a product listing is submitted to a moderation queue
- **THEN** the action ledger records the actual submission and review status
- **AND** it is not counted as public exposure until visible publication is verified.

#### Scenario: Product demonstration
- **WHEN** a feature showcase is exported for distribution
- **THEN** the export is viewed for legibility and factual consistency
- **AND** simulated or edited presentation is not claimed as an unedited customer recording.

### Requirement: Public bilingual media kit
The existing storefront SHALL provide a discoverable `/press` page in English and Simplified Chinese, reusing its language preference, header and footer. It SHALL offer the official public logo, example screenshots, four captioned 33-second feature-showcase videos and a downloadable archive containing only approved public assets. Videos SHALL require an explicit playback action.

#### Scenario: Media kit visitor
- **WHEN** a visitor opens `/press` in either supported language
- **THEN** the page returns HTTP 200 with localized metadata, the `/press` canonical and a large social preview
- **AND** the footer and sitemap expose the page
- **AND** mobile visitors can read the page and access the existing demo and pricing routes.

#### Scenario: Downloadable public assets
- **WHEN** a visitor downloads the media archive, a video, an image or caption file
- **THEN** the URL returns the actual named asset rather than a fallback HTML page
- **AND** the archive excludes internal reports, source code, credentials and private user material
- **AND** feature showcases are explicitly distinguished from live recordings.
