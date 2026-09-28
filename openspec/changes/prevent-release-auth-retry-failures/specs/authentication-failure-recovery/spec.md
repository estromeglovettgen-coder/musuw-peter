## ADDED Requirements

### Requirement: Native OIDC errors require explicit retry
When WeKnora receives a native OIDC callback error or an invalid native OIDC
result, the system SHALL hand the browser to the Musuw failure route without
automatically initiating a new OIDC request.

#### Scenario: Callback reports a temporary native OIDC error
- **WHEN** a browser opens the WeKnora callback page with an `oidc_error`
  fragment
- **THEN** the browser navigates to `/auth/error` and no automatic handoff to
  `/auth/start` occurs

#### Scenario: Router sees an OIDC error before the callback view mounts
- **WHEN** the router processes an `oidc_error` callback during initial
  application navigation
- **THEN** it hands the browser to `/auth/error` before it can mount a
  protected view or start native OIDC

#### Scenario: User retries from the failure route
- **WHEN** a user explicitly selects Google login or submits an email login
  from `/auth/error`
- **THEN** the normal Musuw authentication flow starts once

### Requirement: Temporary native-session failures preserve authentication state
The Musuw auth shell SHALL treat only native-session authorization responses
of 401 or 403 as an invalid native session.  It SHALL treat server failures,
timeouts, and unavailable responses as temporary unavailability, preserving
the native token and not initiating OIDC.

#### Scenario: Native-session lookup returns a server error
- **WHEN** `/api/v1/auth/me` returns a 5xx response while a native token is
  present
- **THEN** the auth shell presents its temporary failure state, retains the
  native token, and does not query Supabase or start native OIDC

#### Scenario: Native refresh returns a server error
- **WHEN** a native API request needs token refresh and `/auth/refresh`
  returns a 5xx response
- **THEN** the frontend retains the native access and refresh tokens, rejects
  the request as temporarily unavailable, and does not start native OIDC

### Requirement: Native authentication persistence outages are unavailable
The WeKnora authentication boundary SHALL distinguish a persistence or tenant
lookup failure from a definitively invalid credential. It SHALL return a
generic 503 response for the former and retain 401/403 for the latter.

#### Scenario: Access-token validation cannot reach persistence
- **WHEN** token, user, or tenant lookup fails because the persistence layer
  is unavailable
- **THEN** the protected API responds with a generic 503 response rather than
  an authorization failure

#### Scenario: Refresh-token validation cannot reach persistence
- **WHEN** refresh-token validation cannot read the token or user from
  persistence
- **THEN** `/auth/refresh` responds with a generic 503 response and does not
  tell the client that its credential is revoked

### Requirement: Failure route does not disclose backend internals
The Musuw failure route SHALL show a generic recoverable-login message and
SHALL NOT expose native OIDC or database error text from a callback.

#### Scenario: Native callback includes an error description
- **WHEN** a callback contains an `oidc_error_description`
- **THEN** `/auth/error` presents the generic failure message rather than the
  supplied description

#### Scenario: Native callback service fails with internal detail
- **WHEN** the native OIDC callback fails with a provider or persistence
  error containing internal detail
- **THEN** its browser redirect fragment contains only a stable error code and
  no raw backend error description
