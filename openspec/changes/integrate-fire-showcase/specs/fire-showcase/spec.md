## ADDED Requirements

### Requirement: Reused authenticated workbench
The system SHALL expose 展示面 below 智能体 using the existing source workbench and generation implementation, with native Fire authentication and server-only provider credentials.

#### Scenario: Ordinary user enters tool
- **WHEN** an authenticated ordinary user clicks 展示面
- **THEN** the existing reference composition and free creation workbench opens without a second login or model selection.

### Requirement: Private user data
The system SHALL isolate references, task snapshots, images, browser drafts and history by the verified native account. Trusted bridge headers MUST NOT be accepted from public callers.

#### Scenario: Cross user reference or result
- **WHEN** user B requests user A's asset or task, including a copied identifier or forged owner header
- **THEN** the request is denied and A's content is not returned or reused from browser cache.

### Requirement: Plan and individual image allowances
Administrators SHALL configure nonnegative image allowances in plans, signup overrides and individual account changes, topups and renewals. Zero MUST mean no allotted images; existing token and question limits MUST keep their original behavior.

#### Scenario: Ten image plan
- **WHEN** an administrator creates an account with ten images
- **THEN** the account can receive at most ten images in that period unless explicitly adjusted, independent of chat question count.

### Requirement: Atomic and recoverable image accounting
The system SHALL reserve one image before each real provider submission and settle once when its saved image is available. Definite failure SHALL release the reservation; uncertain submissions SHALL remain pending and SHALL NOT automatically resubmit.

#### Scenario: Concurrent final image
- **WHEN** two different tasks compete for one remaining image
- **THEN** at most one task can submit and retries of its accounting do not consume a second image.

#### Scenario: Unknown provider outcome
- **WHEN** a submitted task loses its provider response
- **THEN** it remains pending without automatic generation retry, and an administrator can explicitly reconcile the held image.

### Requirement: Real production acceptance
The release SHALL preserve courses, user data, snapshots and original parsing configuration, and SHALL verify real generation under an isolated ordinary account before claiming completion.

#### Scenario: Four reference composition
- **WHEN** the ordinary account uploads a face reference of an Asian adult and separate outfit, pose and background references and generates one image
- **THEN** the result is visible and downloadable, image usage increases exactly one, question usage does not change, and another user cannot read its files.

### Requirement: Single trustworthy startup response
The native authenticated config response SHALL provide server-verified account/tenant identity and fresh image allowance together with the original runtime configuration. The source app SHALL reuse that initial response. Task history SHALL restore in the background without blocking editor readiness.

#### Scenario: Sidecar spoofs identity or config is unavailable
- **WHEN** sidecar config includes an untrusted identity, is malformed, or fails
- **THEN** native identity/allowance override it, and malformed/error responses fail closed without caching private content or enabling generation.

### Requirement: Common image and honest conversion boundaries
The existing upload pipeline SHALL recognize real image bytes for JPEG/PNG/WebP, including missing or aliased browser MIME, preserve their originals, and provide bounded static conversion for extra supported formats without model calls.

#### Scenario: Converted image exceeds config JSON limit
- **WHEN** a valid HEIC/TIFF converts into a PNG larger than the native JSON response ceiling
- **THEN** the response remains small metadata and the authenticated owner retrieves the original normalized PNG through the private asset route, without a second upload.

### Requirement: Complete recoverable collection workflow
Users SHALL preview, reuse, remove and restore local materials and results. Removing a collection item SHALL leave the active draft and accounting records intact; automatic task refresh SHALL NOT resurrect locally removed items. Storage failures and unsupported formats SHALL be visible and actionable.

#### Scenario: Continue from an existing result
- **WHEN** an owner selects 用作参考 on a saved result
- **THEN** its authenticated original is appended through the existing upload pipeline with unselected reference roles, duplicate clicks are coalesced, and a failed read remains retryable without generation or charge.

### Requirement: Actual cold-load performance verification
The release SHALL measure the whole native page with cache disabled, not substitute a prewarmed iframe or route-return timing. Inactive language dictionaries, optional rendering tools and full icon catalogues SHALL NOT be mandatory first-screen resources; recovery paths SHALL remain usable if an optional download fails.

#### Scenario: Ordinary account opens a completely uncached native page
- **WHEN** an authenticated ordinary account navigates to the full showcase page with browser cache disabled
- **THEN** acceptance records the full navigation-to-editor-ready duration, verifies one native identity check and one initial config response, and confirms unrelated chat configuration and optional language/graph/icon resources are not requested.
