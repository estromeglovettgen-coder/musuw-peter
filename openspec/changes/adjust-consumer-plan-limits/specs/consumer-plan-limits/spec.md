## ADDED Requirements

### Requirement: One authoritative consumer plan limit matrix
The server SHALL define Free, Plus, Pro, and Max limits through the existing consumer plan limit authority. Storage SHALL be 1 GiB for Free, 10 GiB for Plus, 30 GiB for Pro, and 100 GiB for Max. Monthly OpenRouter allowance SHALL be USD 0.40 for Free, USD 1.25 for Plus, USD 2.50 for Pro, and USD 5.00 for Max.

#### Scenario: Entitlement reports each plan's limits
- **WHEN** the server resolves an active Free, Plus, Pro, or Max entitlement
- **THEN** its storage and monthly OpenRouter limits match the authoritative matrix

#### Scenario: Unknown plan fails closed
- **WHEN** a missing or unknown persisted plan is normalized
- **THEN** the server applies the Free 1 GiB and USD 0.40 limits

### Requirement: Existing storage quotas converge without data deletion
The database migration SHALL set each existing tenant's persisted storage quota from its normalized persisted plan, SHALL make 1 GiB the fresh Free-row default, and SHALL NOT delete stored objects, documents, indexes, or usage records.

#### Scenario: Existing rows receive the new quota
- **WHEN** the migration processes existing Free, Plus, Pro, and Max tenants
- **THEN** their persisted quotas become 1, 10, 30, and 100 GiB respectively

#### Scenario: Existing usage exceeds the new quota
- **WHEN** a tenant's stored usage is already greater than its migrated quota
- **THEN** existing data remains available and existing quota enforcement rejects only additional storage growth

### Requirement: Free provider allowance transitions on the existing cycle
The existing OpenRouter key path SHALL provision new Free keys with USD 0.40 and SHALL set the next registration-anchored Free period to USD 0.40 without adding a migration marker, usage ledger, background reconciliation job, or bulk provider operation. A provider grant already issued for the current period SHALL remain until its existing boundary so the change does not misclassify explicit operations compensation.

#### Scenario: Free key is provisioned after the change
- **WHEN** a Free tenant without a child key starts its first eligible inference
- **THEN** the provider key is created with a USD 0.40 allowance

#### Scenario: Existing Free personal month elapses
- **WHEN** a Free tenant first reads entitlement or invokes a model after its existing registration-anchored boundary
- **THEN** the key limit becomes lifetime usage plus exactly USD 0.40 and missed periods do not stack

### Requirement: Consumer entitlement copy matches enforcement
The authenticated Plans and Checkout surfaces and the public storefront SHALL display the new storage matrix and Free USD 0.40 monthly AI allowance while retaining the existing paid-plan AI allowances.

#### Scenario: User compares plans
- **WHEN** a user views a supported consumer plan comparison or checkout summary
- **THEN** the displayed storage and AI allowance values match the server matrix

### Requirement: Billing behavior is unchanged
This change SHALL NOT modify prices, products, checkout actions, subscription state, webhook handling, billing cadence, or Paddle configuration.

#### Scenario: Limit adjustment is implemented
- **WHEN** the new entitlement limits are applied
- **THEN** all existing payment and subscription contracts remain unchanged
