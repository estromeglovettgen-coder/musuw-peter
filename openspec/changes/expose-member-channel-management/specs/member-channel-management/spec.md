## ADDED Requirements

### Requirement: Tenant members can manage channels
The authenticated channel-management API SHALL allow a Viewer, Contributor, Admin, or Owner to manage IM and webpage-embed channels only within the caller's current tenant. API-key callers MUST continue to satisfy the existing `manage_channels` capability policy.

#### Scenario: Viewer manages a channel in the current tenant
- **WHEN** an authenticated Viewer creates, updates, toggles, rotates, previews, or deletes an IM or embed channel bound to an agent in the current tenant
- **THEN** the request is authorized and processed by the existing channel service

#### Scenario: Cross-tenant agent binding is rejected
- **WHEN** a member attempts to create or move a channel onto an agent outside the current tenant
- **THEN** the API rejects the request without creating or moving the channel

#### Scenario: API key lacks channel capability
- **WHEN** an API-key principal without `manage_channels` calls a channel-management route
- **THEN** the existing API-key authorizer denies the request

### Requirement: Lite exposes only self-service channel settings to ordinary members
The Musuw Lite settings UI SHALL show only IM integration and webpage embed to ordinary Viewer and Contributor members. Admin, Owner, system, and cross-tenant administrators SHALL retain their authorized non-integration settings, while API, Chrome, and Claw integration entries remain hidden from every role.

#### Scenario: Viewer opens settings
- **WHEN** a Viewer or Contributor opens Settings or follows an allowed channel deep link
- **THEN** the navigation contains only IM integration and webpage embed

#### Scenario: Member follows a hidden integration deep link
- **WHEN** a member opens an API, Chrome, Claw, or unknown integration settings URL
- **THEN** the route normalizes to IM integration

#### Scenario: Administrator opens settings
- **WHEN** an Admin, Owner, system administrator, or cross-tenant administrator opens Settings
- **THEN** their existing authorized settings remain visible and the integration entries are limited to IM and webpage embed

### Requirement: IM credentials remain write-only
The API MUST NOT return credential values or bot identities from IM channel create, list, update, tenant overview, or toggle responses. Credential updates SHALL merge only keys explicitly present in the request.

#### Scenario: Metadata-only update preserves stored credentials
- **WHEN** a member updates channel metadata without a `credentials` object
- **THEN** every stored credential value remains unchanged and no credential value appears in the response

#### Scenario: Single credential key is changed
- **WHEN** a member submits one credential key, including `false`, `0`, or an empty string
- **THEN** that key is overwritten and all omitted credential keys remain unchanged

#### Scenario: Invalid credential patch is rejected
- **WHEN** `credentials` is present but is not a JSON object
- **THEN** the API returns a client error before writing any requested field

### Requirement: Duplicate bot conflicts do not disclose another tenant
The API SHALL enforce the existing global duplicate-bot constraint without returning another tenant's channel identifier, name, bot identity, or credential value.

#### Scenario: Bot identity already belongs to another tenant
- **WHEN** a member creates or updates a channel with an identity already used by another tenant
- **THEN** the API returns a generic conflict response with no foreign-tenant metadata
