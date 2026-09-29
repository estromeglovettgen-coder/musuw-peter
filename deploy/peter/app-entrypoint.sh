#!/usr/bin/env bash
set -euo pipefail

# The native entrypoint uses gosu, which resets supplementary groups. Add the
# mounted daemon's group to the trusted app account before it drops privileges.
# Guest sandboxes never receive this socket or any host directory mount.
if [[ -S /var/run/docker.sock ]]; then
    socket_gid=$(stat -c '%g' /var/run/docker.sock)
    if ! getent group "$socket_gid" >/dev/null; then
        groupadd --gid "$socket_gid" peter-sandbox
    fi
    usermod --append --groups "$socket_gid" appuser
fi
exec /app/scripts/docker-entrypoint.sh "$@"
