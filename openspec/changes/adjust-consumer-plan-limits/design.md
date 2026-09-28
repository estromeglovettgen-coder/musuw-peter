## Context

Musuw already has one pure `LimitsForConsumerPlan` definition consumed by entitlement responses, tenant creation, plan transitions, storage enforcement, and OpenRouter key provisioning. Storage quota is also persisted on each tenant row, while an OpenRouter child key keeps the provider-enforced absolute spend boundary. Consumer product and storefront pages currently duplicate the public numbers for display.

This is a limit adjustment, not a new billing system. The implementation must keep the existing entitlement lifecycle and provider key authority, converge durable state, and avoid any price or Paddle change.

## Goals / Non-Goals

**Goals:**

- Make the server authority Free USD 0.40/month and storage Free/Plus/Pro/Max 1/10/30/100 GiB.
- Apply storage limits to new and existing tenants without deleting stored data.
- Apply the new Free allowance at key provisioning and the next existing registration-anchored period refresh.
- Keep authenticated product copy and public storefront copy aligned with the server.

**Non-Goals:**

- Changing paid-plan AI allowances, prices, products, checkout, subscriptions, webhooks, billing periods, or Paddle configuration.
- Adding a plan table, limit administration UI, background reconciler, local spend ledger, or provider abstraction.
- Deleting files when an existing tenant is above its new quota.

## Decisions

1. **Keep `LimitsForConsumerPlan` as the only runtime plan-limit definition.** All services continue consuming the existing function. Duplicated UI values remain presentation-only and are covered by contract tests. A database-backed rules system would add state and failure modes without a present consumer.

2. **Use one normal versioned migration for persisted storage quotas.** The migration maps each tenant's normalized stored plan to 1/10/30/100 GiB and changes the database default to 1 GiB. Fresh-schema defaults and the Go tenant default are updated as well. This makes existing enforcement rows agree with the runtime definition; no file or usage row is changed.

3. **Use the existing provider allowance lifecycle without a one-off clawback state.** New Free keys and the next registration-anchored refresh use USD 0.40 from `LimitsForConsumerPlan`. A previously issued current period keeps its remaining provider grant until that boundary, preserving the existing explicit operations compensation path. Distinguishing old allowance from intentional compensation would require new durable state or a bulk provider migration, neither justified by this limit-only change.

4. **Update only entitlement copy in existing plan surfaces.** Plans, Checkout, storefront data, and translations receive the new numbers; their pricing and checkout behavior stay untouched.

## Risks / Trade-offs

- [A tenant already uses more than its new storage quota] → Keep all data readable and let existing quota checks block only additional writes until usage falls below the limit.
- [A Free tenant has an already-issued USD 1.00 current period] → Keep its remaining grant only until the existing registration-anchored boundary; every new key and subsequent period uses USD 0.40.
- [A rollback follows the quota backfill] → Restore the PostgreSQL schema default but do not blindly rewrite tenant rows again because post-migration operator adjustments are indistinguishable from migrated values; code rollback restores the old runtime matrix and later plan transitions, while an intentional bulk reset remains an explicit operations action.

## Migration Plan

1. Ship the new server limit definition, fresh-schema defaults, and paired PostgreSQL/SQLite migrations together.
2. On startup, migrate existing tenant storage quota rows by persisted plan; do not alter storage usage or objects.
3. Provision new Free keys at USD 0.40 and let the existing personal-period refresh set the same allowance at the next boundary.
4. Verify server entitlement responses and both consumer copy surfaces against the same matrix before any later release.

Rollback uses the paired down migrations and prior code. PostgreSQL restores the old Free schema default; SQLite's incremental down migration is a safe no-op because changing a column default would require rebuilding the table. Existing tenant rows are not rewritten on rollback, because their pre-migration or later operator-set values cannot be recovered without quota history. No data restoration step is needed because the forward migration deletes nothing.

## Open Questions

None.
