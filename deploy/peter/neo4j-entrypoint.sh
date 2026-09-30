#!/bin/sh
set -eu

if [ ! -r /run/secrets/neo4j_auth ]; then
    printf '%s\n' 'required Neo4j secret is unavailable' >&2
    exit 1
fi
NEO4J_AUTH=$(tr -d '\r\n' < /run/secrets/neo4j_auth)
case "$NEO4J_AUTH" in
    neo4j/?*) ;;
    *) printf '%s\n' 'Neo4j secret has an invalid account format' >&2; exit 1 ;;
esac
export NEO4J_AUTH

exec /startup/docker-entrypoint.sh "$@"
