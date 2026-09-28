## Why

Musuw user uploads currently live on one server volume, while the product requires Cloudflare R2 to be the authoritative object store. The migration should reuse WeKnora's native S3-compatible backend and avoid another storage service.

## What Changes

- Configure the production WeKnora application to use one private `musuw-production` R2 bucket through its native S3 provider.
- Keep R2 credentials in server-owned Docker secret files.
- Copy existing user objects once and switch existing tenant, knowledge-base, and stable resource bindings to the R2 backend.
- Delete the obsolete `musnow-production` R2 bucket and its objects.
- Prune unused Docker images after a healthy release so immutable image delivery does not fill the server disk.

## Capabilities

### New Capabilities

- `cloudflare-r2-user-storage`: R2-backed storage for existing and future Musuw user objects, including migration and end-to-end verification.

### Modified Capabilities

None.

## Impact

Production Compose and secret wiring change; the existing WeKnora S3 implementation, Cloudflare R2, the current PostgreSQL resource registry, and the one-time production data migration are affected. No public API or new runtime service is introduced.
