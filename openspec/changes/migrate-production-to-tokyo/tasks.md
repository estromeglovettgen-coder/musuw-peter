## 1. Discovery and Trust

- [x] 1.1 Confirm the Tencent-created private key matches the bound Tokyo public key by completing a key-only login, then store a mode-0600 operator copy behind a dedicated SSH alias.
- [x] 1.2 Inventory Hong Kong and Tokyo CPU, memory, swap, disk, sockets, current release, containers, named-volume sizes, runtime-file modes, and measured production working set without exposing secret values.
- [x] 1.3 Capture and pin the Tokyo SSH host keys, verify the existing restricted deploy-key fingerprint against Hong Kong, and record only non-sensitive fingerprints/booleans.

## 2. Tokyo Host Bootstrap

- [x] 2.1 Patch Ubuntu from official repositories; verify time sync, swap, disk, outbound DNS/HTTPS, and reboot state.
- [x] 2.2 Install Docker Engine, Buildx, and Compose from Docker's official Ubuntu repository and enable the daemon.
- [x] 2.3 Enforce key-only SSH and host firewall policy while retaining the tested Tencent operator key; verify no application or data port is publicly listening.
- [x] 2.4 Install and negatively test the checked-in forced-command `musuw-deploy` gate with the existing authoritative deploy public key.

## 3. Dark Runtime Rehearsal

- [x] 3.1 Create production runtime paths, named volumes, and external edge network; stream runtime files from Hong Kong with ownership/modes and equality checks but no values in output or artifacts.
- [x] 3.2 Copy the current Tunnel definition and credential material to Tokyo without starting its connector.
- [x] 3.3 Create and restore a rehearsal PostgreSQL dump, Redis snapshot, Neo4j dump, and legacy local-file inventory; verify schema/count/graph/cache/R2 evidence.
- [x] 3.4 Deploy the current exact SHA and immutable GHCR digests through the existing restricted release interface, with the Tokyo Tunnel still stopped.
- [x] 3.5 Verify loopback health, auth, R2, billing preflight, model/catalog, knowledge, chat/tool, Wiki/graph, memory, disk, and zero OOM events under realistic smoke.

## 4. Final Cutover

- [x] 4.1 Record a Hong Kong rollback snapshot and begin the bounded maintenance window by quiescing public writers/background work.
- [x] 4.2 Produce sealed final PostgreSQL, Redis, Neo4j, and required file backups; compare non-sensitive manifests and restore them to Tokyo.
- [x] 4.3 Stop the Hong Kong Tunnel, start exactly one Tokyo connector, and verify the unchanged public `app.musuw.com` health/auth/knowledge/chat/billing interfaces and exact revision.
- [x] 4.4 Rotate only the `server-production` restricted remote and pinned host keys, dispatch the exact current SHA, and require terminal CI/release/manifest/health evidence from Tokyo.

## 5. Observation and Rollback Readiness

- [x] 5.1 Monitor Tokyo container health, OOM/kernel events, memory/swap, disk, Tunnel health, errors, and normal production probes through the observation window.
- [x] 5.2 Resolve rollback scope: the user selected a stop-and-retain-disk recovery posture rather than a hot reverse-sync. Hong Kong has zero active public services and is powered off with its disk, runtime, data, source releases, Tunnel inputs, named volumes, and old Hong Kong host-specific values retained.
- [x] 5.3 Run one consolidated adversarial review of secret handling, one-writer ordering, data parity, release authority, capacity, failure recovery, and post-write rollback.
- [x] 5.4 Update deployment documentation and sanitized verification evidence, validate all OpenSpec changes strictly, commit/push the exact final state, and report any residual capacity trade-off.
