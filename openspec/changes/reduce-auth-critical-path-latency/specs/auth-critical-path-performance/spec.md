## ADDED Requirements

### Requirement: OIDC provider discovery is not part of the normal login path
The production and staging application services SHALL receive explicit authorization, token, and user-info endpoints derived from their own validated Supabase issuer URL, and normal authorization URL generation and callback exchange MUST use those explicit endpoints without fetching the discovery document.

#### Scenario: Production endpoint propagation
- **WHEN** the production Compose project is rendered with the production Supabase issuer
- **THEN** the app service receives the production authorization, token, and user-info endpoints and no staging endpoint

#### Scenario: Staging endpoint propagation
- **WHEN** the staging Compose project is rendered with the staging Supabase issuer
- **THEN** the app service receives the staging authorization, token, and user-info endpoints and no production endpoint

#### Scenario: Inherited shell variables cannot override identity
- **WHEN** a release runner has stale OIDC endpoint variables in its process environment
- **THEN** the supported Compose wrapper discards them and renders only the validated environment-file identity

#### Scenario: Production rollback cannot inherit identity drift
- **WHEN** a failed production release rolls back through a prior release whose Compose wrapper predates endpoint isolation
- **THEN** the release boundary has already discarded inherited OIDC variables and the restored environment-file identity remains authoritative

#### Scenario: Existing provider verification remains enabled
- **WHEN** the app completes an OIDC callback with explicit endpoints
- **THEN** it still performs the authorization-code exchange and user-info lookup through the configured provider before issuing a local session

### Requirement: Complete callbacks enter the application without a blocking profile round trip
When a successful OIDC callback includes a local token, user, active tenant when applicable, and memberships, the frontend SHALL hydrate the session from that callback and SHALL NOT wait for `/api/v1/auth/me` before navigating to the authenticated application.

#### Scenario: Complete tenant callback
- **WHEN** a successful callback contains tokens, user, tenant, and memberships
- **THEN** the frontend stores the tokens and callback context, begins authoritative reconciliation, and navigates without awaiting that reconciliation request

#### Scenario: Workspace onboarding callback
- **WHEN** a successful callback contains tokens and user but no active tenant
- **THEN** the frontend hydrates the user and memberships and navigates to workspace onboarding without waiting for reconciliation

#### Scenario: Legacy or incomplete callback
- **WHEN** a successful callback contains a token but no usable user snapshot
- **THEN** the frontend falls back to the blocking authoritative `/api/v1/auth/me` lookup before navigating

### Requirement: Callback hydration remains fail-closed and eventually authoritative
Initial callback hydration MUST NOT grant frontend capabilities that are absent from the callback, and the frontend SHALL reconcile user, tenant, memberships, and capabilities from `/api/v1/auth/me` asynchronously after a complete callback.

#### Scenario: Capability remains fail-closed
- **WHEN** the callback is applied before `/api/v1/auth/me` completes
- **THEN** workspace self-service creation remains disabled until the authoritative response explicitly enables it

#### Scenario: URL snapshot cannot grant a capability
- **WHEN** callback fragment data contains a client-supplied capability value
- **THEN** initial hydration ignores that value and protected backend actions remain governed by the local token and server authorization

#### Scenario: Successful background reconciliation
- **WHEN** the asynchronous `/api/v1/auth/me` request succeeds
- **THEN** the frontend replaces the callback snapshot with the authoritative user, tenant, membership, active-tenant, and capability state

#### Scenario: Background reconciliation failure
- **WHEN** the asynchronous `/api/v1/auth/me` request fails after a complete callback
- **THEN** the already valid local session and navigation remain intact, the failure is observable without exposing credentials, and existing reload hydration can retry later

#### Scenario: Session changes while reconciliation is pending
- **WHEN** the user logs out, signs in again, refreshes the token, or changes the selected tenant before the background response returns
- **THEN** the stale response is discarded and cannot overwrite the current user, tenant, memberships, or capabilities

### Requirement: Performance evidence is separated from availability claims
Release verification SHALL record representative phase timing from at least one mainland host, the Tokyo origin region, and multiple external regions, but MUST NOT present those samples as a guaranteed nationwide SLA.

#### Scenario: Multi-vantage verification
- **WHEN** the change is prepared for release
- **THEN** evidence distinguishes static edge delivery, dynamic app requests, direct Supabase requests, and server-side callback work across the required vantage classes

#### Scenario: No stateful load testing
- **WHEN** public multi-vantage probes are used
- **THEN** they exercise only read-only endpoints and do not send OTPs, create accounts, or transmit secrets
