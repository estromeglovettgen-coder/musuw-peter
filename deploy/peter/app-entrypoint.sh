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

if [[ ! -r /run/secrets/neo4j_auth ]]; then
    printf '%s\n' 'required Neo4j secret is unavailable' >&2
    exit 1
fi
neo4j_auth=$(tr -d '\r\n' < /run/secrets/neo4j_auth)
case "$neo4j_auth" in
    neo4j/?*) export NEO4J_PASSWORD="${neo4j_auth#neo4j/}" ;;
    *) printf '%s\n' 'Neo4j secret has an invalid account format' >&2; exit 1 ;;
esac
unset neo4j_auth

exec /app/scripts/docker-entrypoint.sh "$@"
