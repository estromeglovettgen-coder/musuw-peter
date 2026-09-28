## Context

Musuw has one production Compose project behind a Cloudflare Tunnel. GitHub Actions builds immutable application and frontend images, uploads an allowlisted exact-SHA source bundle through a forced-command `musuw-deploy` SSH gate, and lets the host pull and recreate only those two images. Server-owned runtime files and named volumes hold PostgreSQL, Redis, Neo4j, legacy local files, and tunnel state; Cloudflare R2 is the authoritative object store.

The current Hong Kong host has two vCPUs, about 7.2 GiB RAM, and a 40 GB system disk. Its measured idle host usage is about 1.7 GiB and the application containers use about 1.1 GiB. The empty Tokyo host has two vCPUs, about 3.6 GiB RAM, an existing 1.9 GiB swap file, and a 90 GB system disk. The current named-volume payload is below 1 GiB and the immutable images use about 12 GB. Tokyo is therefore viable for the present workload, but memory and OOM behavior must be observed under parsing and agent workloads before the old host is retired.

The Tokyo instance was created with a Tencent Lighthouse SSH public key. Its downloaded private half exists locally, has been reduced to mode 0600, and has already authenticated successfully. Host administration therefore needs no Tencent root-account API key. Tencent control-plane automation is out of the critical migration path; a least-privilege CAM identity can be added later only for a concrete firewall, snapshot, or lifecycle consumer.

This execution had no active online users or pending user writes. The owner
authorized a direct single-writer cutover after the rehearsal rather than
waiting for a dark public deployment. Hong Kong remained the serving rollback
origin until the final sealed restore, and was retained intact afterward.

## Goals / Non-Goals

**Goals:**

- Preserve the existing single production Compose project and exact-SHA GitHub/GHCR release interface.
- Produce a verified Tokyo runtime that cannot receive public traffic before data and health validation complete.
- Move PostgreSQL, Redis, Neo4j, legacy local files, runtime configuration, and the Tunnel connector without exposing credentials or user content.
- Keep `app.musuw.com`, Supabase/OIDC callbacks, Paddle webhooks, R2 paths, and public product interfaces unchanged.
- Make cutover and failure recovery explicit, bounded, and evidence-backed.

**Non-Goals:**

- Adding multi-region active/active replication, blue/green release infrastructure, a second deployment protocol, or a migration ledger.
- Moving the public storefront away from the existing Cloudflare Worker.
- Changing model selection, plan entitlements, application data models, R2 objects, or public APIs.
- Creating a broad Tencent root-account SecretId/SecretKey merely to administer one host.
- Retiring or deleting the Hong Kong host during this change.

## Decisions

### Reuse the existing release interface with a new host adapter

Tokyo SHALL install the checked-in restricted `musuw-deploy` gate and the public half of the already-authoritative deploy key. The GitHub Environment keeps the same private deploy key; only the pinned host key and `musuw-deploy@host` remote change after cutover. This keeps one interface and one release path. A second workflow or unrestricted root deployment was rejected because it would duplicate release invariants and expand privilege.

### Use SSH for host administration, not a broad Tencent API credential

The Tencent-created operator key is sufficient to bootstrap the empty host. Its private key remains a local mode-0600 file and is referenced through a `musuw-tokyo` SSH alias. Public ports remain limited to SSH because frontend and application ports bind to loopback and the Tunnel is outbound-only. A root-account cloud API key was rejected because it adds persistent control-plane authority without a present consumer.

### Restore portable state, not Docker's entire data root

Runtime files transfer over encrypted SSH with original ownership and modes and are verified by a boolean manifest comparison that does not publish secret hashes. PostgreSQL uses a custom-format logical dump and clean restore into the same PostgreSQL major version. Redis and Neo4j use application-quiesced snapshots/dumps; the small legacy local-file volume is copied for completeness even though R2 remains authoritative. Anonymous build cache, container layers, temporary DocReader files, and stale volumes are not migrated.

Copying `/var/lib/docker` wholesale was rejected because it couples the move to Docker implementation details, transfers disposable state, and makes validation harder.

### Keep Tokyo dark until the final cutover

Tokyo receives images, source, runtime files, restored data, and the external edge network, but its Cloudflare Tunnel connector remains stopped. Health is exercised through loopback and an SSH tunnel. During cutover the Hong Kong application is quiesced before the final data export; its Tunnel is stopped only after the final export is sealed. Tokyo is restored, local health is rechecked, and then exactly one Tokyo connector starts.

Running both Tunnel connectors against divergent writable databases was rejected because Cloudflare could route a request to either host.

The minimal Tunnel connector is non-root. Its server-owned token file is
installed with owner/group UID `65532` and mode `0600`; the repository installer
and contract test enforce this without reading or storing the token value.

### Treat rollback as stop-and-retain-disk recovery

The Hong Kong host, source releases, runtime files, tunnel configuration, and
volumes remain intact and stopped. The owner selected a stop-and-retain-disk
posture rather than a hot reverse migration: if Tokyo fails, stop Tokyo public
traffic and preserve both stores for operator-led recovery. A simple DNS/tunnel
flip is not represented as data-safe rollback, and this change makes no hot
reverse-sync promise.

### Accept the current Tokyo size with a capacity gate

Tokyo's 4 GB class is adequate for the measured idle workload and has swap, but it has roughly half the RAM of Hong Kong. Cutover requires no OOM kills, healthy containers, adequate available memory and disk, and bounded parsing/chat smoke. If the gate fails, the move stops before public traffic and the instance must be upgraded rather than weakening product topology.

## Risks / Trade-offs

- **Half the previous RAM can cause an OOM during parsing or graph work** → run realistic document/chat/graph smoke, observe cgroup and host peak memory, retain swap, and require zero OOM events before cutover.
- **A live export can miss writes** → take only a rehearsal export while live; quiesce the old application and background workers for the authoritative final export.
- **Starting both Tunnel connectors can split writes** → keep Tokyo's connector stopped until Hong Kong is quiesced and its connector is stopped.
- **Logical PostgreSQL restore or Neo4j dump can diverge from source** → compare schema migration state, aggregate table counts, database sizes, graph counts, Redis key counts, and application-level read paths without emitting content.
- **Runtime-secret transfer can leak credentials** → stream over SSH, never echo values, preserve 0600 ownership, exclude from artifacts, and report only file counts and equality booleans.
- **GitHub release can continue targeting Hong Kong after cutover** → update and immediately verify only the two host-specific server Environment values, then dispatch an exact-SHA rehearsal and compare running revision labels/digests.
- **Rollback after Tokyo writes is slower than a simple flip** → retain Hong Kong
  runtime and stores stopped for operator-led recovery; the owner explicitly
  chose stop-and-retain-disk recovery, so this change does not promise a hot
  reverse synchronization or an unsafe stale-state flip.

## Migration Plan

1. Pin the Tokyo SSH host key, retain the Tencent operator key, patch the OS, install Docker/Compose from the official vendor repository, keep only port 22 inbound, and verify time, disk, swap, and outbound GHCR/R2/Supabase/Cloudflare access.
2. Install the checked-in forced-command release gate with the existing deploy public key. Run its negative and positive verification contracts from the operator channel.
3. Create the production runtime directory and named volumes. Stream server-owned runtime files from Hong Kong with modes intact. Copy the Tunnel definition but leave its connector stopped.
4. Restore a rehearsal PostgreSQL dump plus Redis, Neo4j, and legacy file snapshots. Materialize the current exact source SHA and immutable image digests through the existing gate.
5. Start the stack without the Tunnel and verify loopback health, auth shell, model catalog, R2 access, Paddle preflight, knowledge read paths, chat/tool paths, graph path, memory, disk, and zero OOM events.
6. Begin a short maintenance window: stop Hong Kong frontend/app/background writers, create final PostgreSQL/Redis/Neo4j/file backups, record non-sensitive manifests and counts, stop the Hong Kong Tunnel, restore final state to Tokyo, and repeat local health/data checks. In this execution the first window also exercised a bounded Hong Kong rollback after the local image bootstrap path failed; the second window performed the authoritative sealed restore.
7. Start exactly one Tokyo Tunnel connector. Verify public root, `/health`, auth start/callback safety, knowledge read/write, chat streaming, Paddle webhook reachability, and running exact-SHA/digest labels.
8. Update the `server-production` pinned host key and restricted remote while retaining the same deploy private key. Dispatch the exact current SHA through the canonical workflow and require terminal release evidence from the Tokyo host before the final cutover.
9. Keep Hong Kong stopped but intact for the observation and handoff period. If
   rollback is required after writes, stop Tokyo public traffic and retain both
   stores for an operator-led recovery; this migration does not perform or
   promise a hot reverse synchronization.

### Execution record

- The first bounded window stopped Hong Kong writers and its Tunnel, then
  restored Hong Kong after the image-archive bootstrap path failed. This kept
  the public interface available and provided concrete rollback evidence.
- The canonical exact-SHA workflow subsequently completed successfully against
  Tokyo. App/frontend labels, current source, immutable image repository
  digests, and local health were verified before the second window.
- The second bounded window sealed and restored all four state classes, stopped
  Hong Kong's Tunnel, and started exactly one Tokyo connector. Public probes
  then passed through the unchanged Cloudflare interface.
- Direct Tokyo SSH is now stable through the pinned `musuw-tokyo` alias after
  the local Clash DIRECT rule. This is an operational prerequisite, not a
  product dependency; no Tencent API key or security-group change was used.
- The owner subsequently selected stop-and-retain-disk recovery instead of a
  hot reverse-sync rehearsal; Hong Kong app/Tunnel remain stopped and no
  additional traffic flip or data restore was attempted.
- After the observation window, an authorized guest precheck found zero active
  public services; synchronization completed and Hong Kong was powered off.
  Its disk, runtime, and named volumes remain retained for operator-led
  recovery, and the closed SSH port is not represented as a successful hot
  rollback.

## Open Questions

- The bounded cutover observation window completed successfully. Ongoing backup and capacity monitoring remain normal production operations and do not reopen this one-time migration.
- A future Tencent CAM identity is justified only if a concrete automated snapshot or firewall task is added; it is not required for this migration.
