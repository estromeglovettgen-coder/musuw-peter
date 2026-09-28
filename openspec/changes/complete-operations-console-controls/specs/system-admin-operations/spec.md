## MODIFIED Requirements

### Requirement: TEST and PRODUCTION remain process-isolated environments

The local operations launcher SHALL manage two independent console processes on
fixed loopback origins: TEST on port 4186 and PRODUCTION on port 4187. Each
process MUST have its own target-specific runtime, read-only database pool,
operator session store, and cookie names. Both processes MAY remain healthy at
the same time. The browser MUST switch environments by navigating to the other
fixed origin; it MUST NOT POST a target header, share a proxy or datasource,
reload a process, or poll a restart. Neither process may accept browser-supplied
datasource URLs, credentials, arbitrary commands, or a mixed target runtime.
PRODUCTION runtime values MUST come from its separate ignored runtime file and
the database connection MUST remain read-only.

#### Scenario: Operator switches environments once

- **WHEN** the operator clicks the alternate TEST or PRODUCTION environment
- **THEN** the console navigates directly to that target's fixed loopback origin
  and the already-running target is immediately available without restarting
  either process

#### Scenario: Cross-target control cannot mix environments

- **WHEN** a request attempts to select a target through an API body, target
  header, shared proxy, or a session/cookie from the other fixed origin
- **THEN** it fails closed without changing either process or datasource

#### Scenario: Production tunnel ownership is verified before startup

- **WHEN** an authorized switch targets PRODUCTION, regardless of whether the
  configured local database port already accepts TCP connections
- **THEN** the existing launcher validates the pinned `musuw-tokyo` restricted
  SSH alias, BatchMode/strict host-key configuration, the fixed PostgreSQL
  container through `sudo -n docker inspect`, and its ControlMaster tunnel
  before probing the database; an unowned listener or failed preparation
  returns an actionable 503 and leaves the current environment running

#### Scenario: Target startup failure leaves the other process healthy

- **WHEN** either target process fails its startup health check
- **THEN** the launcher preserves that target's failure log and leaves the other
  already-running process and its datasource untouched

### Requirement: Operators can manage the real consumer model policy

The system SHALL expose exactly five model-policy rows to an authorized
SystemAdmin/platform key: Agent (`rag`), Rerank, Wiki, Vision, and ASR. Each
row SHALL contain the current Free default, ordered paid model IDs, and safe
display metadata from active builtin OpenRouter models of the scene's native
type. Chat, Embedding, TTS, model parameters, endpoints, and credentials MUST
NOT appear. Updates SHALL change exactly one policy field through the existing
system-setting service and SHALL reject unsupported scenes, empty or duplicate
paid lists, wrong native types, unsafe rows, unknown fields, and forged IDs.

#### Scenario: Operator opens the model matrix

- **WHEN** the operator opens Models in the loopback console
- **THEN** five rows load from the real catalog and current system settings,
  with no placeholder IDs or sensitive model configuration

#### Scenario: Operator submits an invalid model

- **WHEN** an update contains a Chat/Embedding scene, unknown ID, wrong native
  type, duplicate paid ID, arbitrary field, or non-builtin/non-OpenRouter row
- **THEN** the request returns 400 and no policy setting is changed

#### Scenario: Operator selects an expanded cost-conscious model

- **WHEN** a current free or low-cost OpenRouter model has been reconciled into
  the active builtin catalog for the row's native type
- **THEN** the matrix exposes its real display metadata and model ID, accepts it
  through the same strict policy update, and the runtime sends that exact model
  through the existing metered OpenRouter transport
