## Context

Production stores user files in the `weknora-v072-production-data-files` volume and records stable `resource://` handles whose physical targets are `storage://<backend>/local://...`. WeKnora v0.7.2 already supports concrete per-tenant S3 backends, Cloudflare R2 exposes an S3 API, and only 38 active files (about 10.3MB) require a one-time copy.

## Goals / Non-Goals

**Goals:**

- Make one private R2 bucket authoritative for existing and future user objects.
- Preserve every stable `resource://` handle and current knowledge-base relationship.
- Keep credentials server-owned and verify the real upload/read/delete path.

**Non-Goals:**

- A new storage adapter, proxy, migration framework, multi-region design, or rollback service.
- Direct browser-to-R2 uploads or public bucket access.

## Decisions

- Use WeKnora's existing `s3` provider with the R2 account endpoint, region `auto`, path-style requests, and prefix `weknora`. This is smaller than a custom R2 adapter.
- Mount the R2 access key pair from two existing-style Docker secret files and export them only in the application entrypoint. Non-secret R2 location values remain in the production Compose overlay.
- Use Cloudflare's documented rclone path for the one-time directory copy, then update tenant defaults, knowledge-base bindings, resource physical paths, providers, backend IDs, and SHA-256 location hashes in one PostgreSQL transaction.
- Keep the existing local volume mounted but no longer authoritative; no synchronization layer is added.
- Run one forced unused-image prune only after release health and activation succeed.

## Risks / Trade-offs

- **A copied object or database rewrite is incomplete** → compare file/object counts, run the transaction only after upload verification, and exercise existing and new files through the product.
- **R2 credentials leak** → never print them; capture once from Cloudflare and write them through hidden terminal input into mode-0600 server files.
- **An old local resource remains selected** → migrate every tenant, knowledge base, and resource row and assert no active `local` binding remains.

## Migration Plan

1. Delete the obsolete bucket and create private `musuw-production` in APAC.
2. Create one R2 read/write token and install its key pair as server-owned secret files.
3. Release the Compose/entrypoint wiring and confirm WeKnora creates an S3 environment backend for each tenant.
4. Copy `/data/files` to `musuw-production/weknora`, verify counts, and transactionally switch database bindings.
5. Restart the application, verify old reads and a new upload/delete in the browser, then confirm R2 and production health.

## Open Questions

None.
