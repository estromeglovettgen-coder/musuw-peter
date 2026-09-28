# Private server operations console

This is the existing operations Node gateway, hosted under systemd on the Tokyo
server. It listens only on `127.0.0.1:4187`; the operator uses the existing SSH
identity to forward HTTP from their Mac. There is no public administrator route.
The Mac tunnel may reconnect after sleep; the console and database connection
remain on the server. This release never switches `/opt/weknora/current`, edits
the production application environment, or restarts its app/frontend containers.

The Mac client rereads the current macOS SOCKS setting on each SSH connection.
When enabled it uses that SOCKS5 endpoint; otherwise it connects directly. This
does not modify global SSH or proxy settings. Its stable helper is copied to
`~/Library/Application Support/MusuwOperations/operations-local-client.py` and
used by both installation preflight and launchd reconnects. The connection timeout
is bounded, while idle connections have no netcat inactivity timeout. Failed
cutover restores the previous local configuration.

## One-time root installation

Install only the reviewed, merged GitHub revision. Install the shared production
SSH dispatcher's `operations-only` branch first, then run:

```sh
sudo bash scripts/operations-bootstrap.sh /secure/path/operations-deploy.pub
```

The dedicated `musuw-operations-deploy` key can invoke only
`musuw-operations deploy <full SHA> <archive SHA-256>`. It cannot invoke app
deployment, rsync, a shell, port forwarding, or arbitrary root commands. The
root gate and systemd unit are installed by the operator; artifacts cannot replace
them. Their future changes require the same explicit reviewed bootstrap step.

Populate `/opt/musuw-operations/runtime/production.env` and the runtime agent's
file-backed credentials separately, without putting values in GitHub artifacts
or logs. Secret files are owned by `musuw-operations`, mode `0600`; the runtime
directory is `root:musuw-operations`, mode `0750`, with its `secrets` subdirectory
owned by `musuw-operations`, mode `0700`. Include
`MUSUW_ADMIN_DATABASE_HOST_FILE=/run/musuw-operations/database-host` in
`production.env`. Use the existing read-only
database role, never the production database owner's credentials.

Before every start the fixed root helper resolves the PostgreSQL container's
current address from `weknora-v072-production-internal` and atomically writes
`/run/musuw-operations/database-host`. It reads no credential. Server runtime
readiness detects database loss and exits so systemd restarts and resolves again.

## GitHub release

Create the `operations-production` GitHub Environment with the same required
account-owner reviewer as `server-production`. Keep it separate: application
promotion resolves its baseline from the latest `server-production` deployment.
Set these operations-only Environment secrets:

- `MUSUW_OPERATIONS_SSH_PRIVATE_KEY`
- `MUSUW_OPERATIONS_SSH_KNOWN_HOSTS`
- `MUSUW_OPERATIONS_SSH_REMOTE` (`musuw-operations-deploy@HOST`)
- `MUSUW_OPERATIONS_SSH_PORT` (optional; defaults to 22)

Dispatch `deploy-operations.yml` from `main` with the exact 40-character commit.
Authorization requires that commit to be on `origin/main`, have successful
canonical push CI, and retain the owner reviewer. The GitHub build uses the
existing lockfiles/frontend build, packages the pinned Linux Node runtime,
and records the complete artifact SHA-256. Only the approved deploy job receives
the SSH key. No Mac-built code or server npm build is a deployment input.

The server verifies the archive checksum, revision and every file checksum. The
unprivileged operations account extracts only regular allowlisted files into a
fresh directory. Absolute paths, traversal, symlinks, hardlinks, special files,
unmanifested files, and attempts to overwrite the gate/unit are rejected. Root
then freezes the release under `/opt/musuw-operations/releases/<SHA>`, switches
the independent `current` symlink and restarts only `musuw-operations.service`.
The gate waits for `/readyz`, which checks the actual database, not only HTTP.

## Verification and recovery

Run `python3 scripts/operations-deploy.test.py` for artifact rejection, digest
stability, gate rejection and rollback contracts. The unprivileged gate simulation
never accesses real services or credentials. CI should also run existing runtime
tests, the server-runtime tests and operations browser acceptance.

After deployment verify the private UI's users page, identity/CSRF rejection,
loopback-only listener, current SHA, and process recovery after terminating only
the operations process. Record the application current SHA before and after to
prove it was unaffected. Verify tunnel recovery after disconnect/reconnect on the
Mac separately; no server reboot or database restart is needed for acceptance.

The gate automatically restores the previous operations symlink and process if
the new release fails readiness, and returns failure rather than claiming success.
First-deployment failure stops the service and removes the current pointer. Old
immutable releases remain available. For an operator-directed rollback, replay
the **original** retained GitHub workflow artifact with its recorded digest through
the same protected gate; do not rebuild or modify a retained release in place.
No database/schema migration or production application rollback is part of this
console release.
