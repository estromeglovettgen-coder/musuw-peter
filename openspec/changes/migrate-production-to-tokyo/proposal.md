## Why

Musuw's application runtime currently serves production from a Hong Kong host, while the newly purchased Tokyo host provides a region where the intended model-provider paths and reviewer traffic can be exercised without retaining the Hong Kong node as the primary runtime. The move must preserve the existing exact-SHA release interface and production data while keeping a verified, bounded failure-recovery posture.

## What Changes

- Bootstrap the empty Tokyo Ubuntu host with the same Docker, restricted `musuw-deploy` account, forced-command release gate, runtime paths, named-volume identities, and Cloudflare Tunnel network expected by the existing production release.
- Restore server-owned runtime configuration and the authoritative PostgreSQL, Redis, and Neo4j state to Tokyo without copying credentials into the repository, logs, or release artifacts; Cloudflare R2 remains the authoritative object store.
- Rehearse the exact immutable GHCR release and health checks on Tokyo without accepting public traffic.
- During a bounded maintenance window, quiesce writes on Hong Kong, take and verify final logical/data backups, restore the delta to Tokyo, start one Tokyo tunnel connector, and verify the unchanged `app.musuw.com` interface.
- Retarget the existing `server-production` GitHub Environment to Tokyo's restricted SSH gate only after public health passes, while retaining the stopped Hong Kong runtime and its recovery inputs through the observation window.
- Record source SHA, image digests, backup manifests, data counts, tunnel state, public probes, and recovery evidence without recording secret values or user content.

## Capabilities

### New Capabilities

- `production-region-cutover`: Defines a data-safe, exact-SHA migration of the single Musuw production runtime from Hong Kong to Tokyo with an explicit stop-and-retain-disk recovery boundary.

### Modified Capabilities

None. Public product, authentication, billing, storage, and release interfaces remain unchanged.

## Impact

- New Tokyo host operating system, SSH trust, Docker runtime, named volumes, server-owned runtime files, and Cloudflare Tunnel connector.
- Existing Hong Kong production host, PostgreSQL/Redis/Neo4j state, Cloudflare R2 bindings, and stopped recovery retention.
- Existing restricted release scripts and `server-production` GitHub Environment secrets/variables; the workflow shape and immutable GHCR images do not change.
- `app.musuw.com` retains the same origin, authentication issuer/callbacks, Paddle endpoints, R2 bucket, and public contracts.
