## ADDED Requirements

### Requirement: Lite is a server-authoritative curated product surface
Musuw Lite SHALL expose only capabilities allowed by its server product policy, current role, deployment support, and plan entitlement. Frontend hiding alone SHALL NOT authorize or disable a capability.

#### Scenario: Hidden deep link
- **WHEN** a Lite user navigates directly to an excluded settings section
- **THEN** the frontend returns to a supported section and the corresponding server route remains unavailable

#### Scenario: Standard internal acceptance
- **WHEN** the same build runs in Standard edition
- **THEN** the complete upstream management surface remains available under its existing roles

### Requirement: Executable infrastructure is unavailable in Lite
Musuw Lite SHALL NOT expose or invoke Sandbox configs, Skills, Skill environment variables, shell commands, sandbox files, or sandbox-generated artifacts, and production Lite SHALL NOT require a configured Sandbox provider.

#### Scenario: Crafted Skill chat request
- **WHEN** a Lite user submits Skill names, Skill mentions, or a Sandbox selection in a crafted chat request
- **THEN** the server rejects the request without provisioning executable infrastructure

#### Scenario: Executable management route
- **WHEN** a Lite user calls a Sandbox, Skill, environment-variable, or generated-artifact management route
- **THEN** the server responds as an unavailable product capability

### Requirement: Deferred connectors and providers are unavailable
Musuw Lite SHALL NOT expose XMind parsing, GitLab sync, Tencent IMA sync, Metaso, Exa, new integration-management surfaces, or native password changes.

#### Scenario: Catalog discovery
- **WHEN** a Lite client loads upload formats, data-source connectors, search providers, settings navigation, or user profile actions
- **THEN** none of the deferred capabilities appears

#### Scenario: Direct server invocation
- **WHEN** a Lite user calls a deferred capability directly
- **THEN** the server rejects the request even if the upstream implementation exists
