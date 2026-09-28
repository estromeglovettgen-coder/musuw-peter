## ADDED Requirements

### Requirement: Operations console manages complimentary entitlements through narrow controls
The local operations console SHALL show the effective plan source, active or expired complimentary plan, exact expiration, and grant identifier in the selected tenant's detail surface. It SHALL provide a Plus/Pro/Max selector and custom date-time input for grant, plus a separate revoke action. It SHALL NOT add plan fields to generic tenant editing.

#### Scenario: Operator opens a grant-eligible tenant
- **WHEN** an authorized operator opens a Paddle-unbound Free tenant
- **THEN** the console shows grant controls and converts the selected browser-local date and time to an RFC3339 UTC instant before submission

#### Scenario: Operator opens an active grant
- **WHEN** the selected tenant has an active complimentary grant
- **THEN** the console shows its plan, source, expiration, and revoke action and prevents an implicit replacement

#### Scenario: Operator opens an ineligible tenant
- **WHEN** the selected tenant has a Paddle binding or underlying paid state
- **THEN** grant is unavailable with a clear reason and no mutation request is sent

### Requirement: Complimentary mutations retain operations security boundaries
Grant and revoke SHALL require SystemAdmin authorization and the existing platform tenant-management capability. The loopback proxy SHALL allowlist only the exact tenant grant/revoke route shapes and SHALL retain SameSite session, exact Origin, and CSRF validation for browser mutations. The backend SHALL accept only the narrow grant/revoke request fields and reject arbitrary tenant paths, legacy confirmation fields, or plan fields on generic updates.

#### Scenario: Browser mutation lacks CSRF or Origin
- **WHEN** a grant or revoke request lacks the valid local session, exact Origin, or CSRF token
- **THEN** the operations proxy rejects it before forwarding any platform credential

#### Scenario: Legacy confirmation field is supplied
- **WHEN** a caller reaches the capability-scoped backend route with a legacy `confirmation` field
- **THEN** strict request decoding rejects the request without changing entitlement or provider state

#### Scenario: Generic tenant update includes a plan
- **WHEN** a caller submits any Paddle or complimentary plan field through the generic tenant PATCH
- **THEN** strict request decoding rejects it

### Requirement: Accepted complimentary transitions are auditable
Every newly committed grant and revoke SHALL emit a dedicated platform audit action with actor, target tenant, old and new effective plan, grant ID, and expiration where applicable. Exact replays SHALL not create a second successful transition entry. Audit details SHALL NOT contain provider credentials, Paddle secrets, or raw payment data.

#### Scenario: Grant commits
- **WHEN** a new complimentary grant commits successfully
- **THEN** one entitlement-granted audit entry identifies the operator, tenant, plan, grant ID, and expiration

#### Scenario: Revoke commits
- **WHEN** an active complimentary grant is revoked successfully
- **THEN** one entitlement-revoked audit entry identifies the operator, tenant, prior plan, grant ID, and prior expiration
