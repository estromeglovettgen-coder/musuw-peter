# Migration verification evidence

All evidence below is sanitized: it records booleans, counts, and statuses only.
No credential values, host addresses, user content, image digests, or full commit
identifiers are stored here.

## Release and access

- Tokyo operator SSH: `musuw-tokyo` direct path and pinned host key: pass.
- Tokyo restricted deploy account and gate: positive and negative contracts: pass.
- Hong Kong recovery bundle: prepared locally with mode `0600`; authentication
  through the restricted gate passed before the guest shutdown.
- Canonical production workflow: authorize, build, immutable push, gate deploy,
  manifest, health evidence, and cleanup: terminal success.
- `server-production` rotation: only restricted remote and pinned host key
  changed to Tokyo; private deploy key and runtime/public environment inputs were
  retained.
- Tokyo current source pointer, app/frontend revision labels, image config
  references, and image repository digests: exact booleans all true.
- Digest authority is the canonical CI artifact manifest together with the
  production runtime `Config.Image`/repository-digest values; the host source
  manifest is source-only and is not treated as a standalone digest authority.

## Rehearsal restore

- PostgreSQL: 55 public tables, 10,366 rows.
- Redis: 55 persisted keys after expiry of ephemeral queue entries.
- Neo4j: 26 nodes, 5 relationships, 0 retained constraints.
- Legacy files: 38 files, 10,173,779 bytes.
- R2 reachability: pass; R2 remains the authoritative object store.
- Tokyo Tunnel before readiness gate: stopped.

## Final cutover

- First bounded window: Hong Kong writers/background services and Tunnel were
  quiesced, then restored after the local image bootstrap blocker; public health,
  root, and auth-start probes returned 2xx. This is the recorded pre-cutover
  rollback rehearsal and Hong Kong remained intact.
- Second bounded window: Hong Kong pre-quiesce counts were unchanged from the
  sealed rehearsal baseline; app/frontend/docreader were stopped before the final
  export and the Tunnel remained stopped.
- Sealed final exports: PostgreSQL custom dump, Redis `SAVE`/RDB tar, Neo4j APOC
  stream, and legacy-file tar all completed with empty stderr evidence.
- Final Tokyo parity before public traffic: PostgreSQL 55/10,366; Redis 55;
  Neo4j 26/5/0; files 38/10,173,779.
- Tokyo app/frontend/docreader after final restore: running and healthy.
- Final Tokyo loopback app health, frontend health, root, and auth-start: pass.
- Tokyo CPU, memory, disk, outbound connector precheck, and zero recent OOM
  events: pass.
- Exactly one active Tunnel connector: Tokyo running; Hong Kong stopped.
- Tunnel token runtime permission: owner/group UID `65532`, mode `0600`; host
  token file is not world-readable. The checked-in installer and contract test
  make this repeatable without storing the token. The first connector start
  recorded 10 permission-denied attempts before the owner fix; all subsequent
  starts were healthy.
- Public app health, root, auth-start, and both storefront domains: 2xx.
- Authenticated functional smoke: approved reviewer password login established
  a native WeKnora session; `/auth/me` returned success, the current entitlement
  read returned plan `max`, and the knowledge-base list/read paths returned 2xx.
- Temporary English knowledge smoke: one temporary knowledge base and one
  temporary manual document were created, read, updated, and then deleted;
  post-cleanup document and knowledge-base reads returned 404. No fixture data
  was retained.

## Observation and rollback readiness

- Observation log samples record public probes, required container health and
  restart counts, Tunnel restart count, and normalized 5xx/database-error
  counters. The completed 900-second window recorded 25 total samples, all
  public probes true, all required services healthy/running with zero restarts,
  and zero normalized 5xx/database-error counts.
- The 119 PostgreSQL `FATAL`/missing-database events observed in the initial
  20-minute diagnostic window were caused by the inherited healthcheck probing
  the default database instead of the configured production database. A
  production-specific healthcheck now names both configured user and database;
  the post-fix 45-second window recorded zero such events, with app health and
  public health still true.
- Hong Kong runtime, source releases, named volumes, Tunnel inputs, and rollback
  environment bundle remain retained; no destructive cleanup was performed.
- Hong Kong final rollback posture: the guest precheck found zero active public
  services, synchronization completed, and an authorized system poweroff
  completed; the SSH port is closed while the disk, runtime, and named volumes
  remain retained.
- Reverse-sync rollback was intentionally not executed: the user selected a
  stop-and-retain-disk posture rather than a hot cutback. Hong Kong app/Tunnel
  remain stopped and its runtime, data, source releases, Tunnel inputs, and
  rollback environment bundle remain retained. No stale-state traffic flip was
  used.
- Residual operational note: direct Tokyo SSH is healthy through the pinned
  `musuw-tokyo` alias after the local Clash DIRECT rule; no Tencent control-plane
  API credential or firewall change was required.
- Consolidated adversarial review found no P0/P1 in the migration delta after
  the stop-and-retain-disk boundary, fixed cloudflared UID, and explicit
  PostgreSQL database healthcheck corrections. The remaining capacity trade-off
  is Tokyo's 4 GB class; the bounded observation and smoke produced no OOM, but
  normal memory and swap monitoring remains required.
- Hong Kong shutdown evidence is guest-level: the zero-public-service precheck,
  synchronized system poweroff, and closed SSH port passed. No Alibaba
  control-plane credential was available, so this evidence does not claim an
  independently read cloud-console power-state receipt.

## 2026-08-23 current deployed revision

- The selected revision completed all seven CI jobs on the first run. Cloudflare
  storefront and Tokyo production delivery each reached terminal success.
- Tokyo's current source pointer, source manifest, application/frontend runtime
  labels, image labels, and immutable image references all matched the selected
  revision. Required containers and the Tunnel were healthy.
- Loopback and public health, root, and auth probes returned HTTP 200. Both
  storefront domains also returned HTTP 200; the one transient first primary-
  domain probe recovered within its bounded retry, and the subsequent complete
  probe group passed.
- Runtime sensitive-file permissions and read-only credential mounts passed.
  The complete Paddle unit remains Sandbox-only.
- The Alibaba control-plane receipt remains open and is not claimed; the retained
  guest-level shutdown evidence and stop-and-retain-disk boundary are unchanged.
