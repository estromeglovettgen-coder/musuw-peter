## Why

The operations console currently runs on the owner's Mac and holds database connections across an SSH tunnel. Mac sleep interrupts that data path and leaves an error page after connectivity recovers. The owner approved moving the console to the existing server so its process and database connection no longer depend on the Mac.

## What Changes

- Run the existing operations gateway persistently on the production host, bound only to loopback, supervised with automatic restart.
- Read existing scoped credentials from protected server files in an explicit server runtime mode, retaining the read-only database connection and existing management API contracts.
- Keep the current localhost browser URL through an automatically restarted SSH HTTP forward using the existing operator key.
- Recover failed read-only page queries after connectivity returns, without replaying mutations or discarding unfinished edits.
- Release independently from the application using CI-built immutable artifacts and a separate reviewed operations deployment record.

## Capabilities

### New Capabilities
- `persistent-private-operations`: Server-owned operations lifecycle, private authenticated transport, read recovery, and independently verifiable delivery.

### Modified Capabilities
None.

## Impact

Operations runtime configuration, its existing frontend read recovery, a small server deployment seam, and the local LaunchAgent HTTP forward. The application API, payment behavior, user records, public routing and production application revision are unchanged. No public administrative hostname or new identity provider is introduced.
