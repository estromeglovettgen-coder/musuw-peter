## ADDED Requirements

### Requirement: Production deploys one verified source revision
The release SHALL use the existing GitHub-triggered Cloudflare storefront and
immutable-GHCR server delivery paths for one full commit SHA. Completion MUST
require green CI, successful terminal delivery for both targets, public health
probes, and evidence that the application is running the selected revision.

#### Scenario: Both production targets receive the verified revision
- **WHEN** CI succeeds for the pushed full SHA
- **THEN** the storefront and server workflows deploy that SHA and public revision and health checks agree with it

#### Scenario: One production target fails
- **WHEN** CI, storefront delivery, server delivery, or a public probe fails
- **THEN** the release remains incomplete and the failure is repaired or the existing exact-SHA recovery path is used

### Requirement: Browser acceptance covers the real user lifecycle
Production acceptance MUST use the public site and application in a real
browser to exercise authentication, knowledge creation, upload and completed
parsing, retrieval/chat with the plan-authorized model flow, billing entry and
Paddle checkout handoff, logout, re-login, and deletion of disposable test
knowledge. It MUST NOT create an unnecessary live charge, reveal secrets, or
delete the user's real account or subscription.

#### Scenario: Disposable account content completes the lifecycle
- **WHEN** the acceptance user signs in and creates disposable knowledge content
- **THEN** upload, parse, retrieval/chat, re-login, and cleanup succeed against the deployed production revision

#### Scenario: Billing is accepted without an unsafe live charge
- **WHEN** the acceptance user opens the plan and billing flow
- **THEN** live product, price, renewal, and checkout handoff are shown correctly and post-payment entitlement behavior is evidenced without submitting a new card charge
