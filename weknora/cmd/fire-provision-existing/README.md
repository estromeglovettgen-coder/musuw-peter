# Explicit existing-account provisioning

This operator-only command grants the configured shared course and managed Taylor default to explicitly named existing accounts. It does not create identities, change passwords, edit personal agents/knowledge, or grant/renew any plan. There is no HTTP endpoint and no read-time automatic enrollment.

Build alongside the server:

```sh
go build -o fire-provision-existing ./cmd/fire-provision-existing
```

After the operator has saved the deployment/database snapshot, run inside the Beijing application container with its existing environment:

```sh
FIRE_PROVISION_EXISTING_CONFIRM=grant-taylor-course-to-explicit-users \
  /tmp/fire-provision-existing \
  --actor-user-id ACTUAL_SYSTEM_ADMIN_UUID \
  --target-user-ids EXISTING_USER_UUID_1,EXISTING_USER_UUID_2
```

The command requires explicit DB connection variables plus the existing `FIRE_SOURCE_TENANT_ID`, `FIRE_COURSE_KB_ID`, and `FIRE_TAYLOR_AGENT_ID`. It opens only the existing PostgreSQL database, requires clean migration state and existing Fire tables, and runs no migrations, model reconciliation, seeding, or background services.

It verifies the active, non-deleting system administrator in the real database and rechecks that identity under each write transaction. Targets are processed separately; each transaction uses the native organization/KB sharing and protected-agent provisioning. Existing matching grants are unchanged. A failure exits nonzero, rolls back that target, and leaves prior successes safely rerunnable. JSON result lines contain only user ID, tenant ID, and whether an existing grant was reused. No credentials are generated or printed.
