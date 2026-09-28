#!/bin/sh
set -eu

secret_path=/run/secrets/neo4j_auth
if [ ! -r "$secret_path" ]; then
    printf '%s\n' 'required neo4j-auth secret file is unavailable' >&2
    exit 1
fi

NEO4J_AUTH=$(tr -d '\r\n' < "$secret_path")
case "$NEO4J_AUTH" in
    neo4j/?*) ;;
    *)
        printf '%s\n' 'required neo4j-auth secret has an invalid account format' >&2
        exit 1
        ;;
esac
export NEO4J_AUTH

exec /startup/docker-entrypoint.sh "$@"
