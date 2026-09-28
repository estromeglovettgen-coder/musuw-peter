## ADDED Requirements

### Requirement: Startup feedback preserves authentication
The auth shell and application SHALL display localized startup status once HTML and required CSS are available, before configuration/module completion, and SHALL offer retry on a slow or failed startup without bypassing authentication.

#### Scenario: Configuration stalls or the module fails
- **WHEN** configuration or the entry module is delayed or fails on a mobile viewport
- **THEN** status remains visible, slow/failure feedback offers a reload, and normal mounting removes the placeholder.

### Requirement: Initial dependencies exclude unrelated renderers
Initial application navigation SHALL avoid loading diagram/highlight implementation solely through shared basic dependencies.

#### Scenario: First document render after startup
- **WHEN** a document containing a diagram and highlighted code is first opened and then reopened
- **THEN** both render correctly, while the initial static dependency graph excludes their implementation bundles.

### Requirement: Diagnostics are bounded and non-sensitive
Diagnostics SHALL accept only defined phases/outcomes, bounded timings and opaque correlation fields. They SHALL never require credentials, affect login completion, retry automatically, or persist user input, document content, raw errors or URLs.

#### Scenario: Reporting fails or receives invalid data
- **WHEN** the reporting endpoint is unavailable or receives oversized, unknown, malformed or rate-limited input
- **THEN** business behavior is unchanged, invalid data is rejected, and no raw diagnostic request payload is logged.

### Requirement: Release retains operational evidence
Rotating application logs SHALL survive normal container replacement, and production release SHALL retain immutable staging acceptance and rollback safeguards.

#### Scenario: Replace the application container
- **WHEN** a verified candidate replaces a staging or production container
- **THEN** the prior rotating logs remain in that environment's isolated volume and the application remains healthy.
