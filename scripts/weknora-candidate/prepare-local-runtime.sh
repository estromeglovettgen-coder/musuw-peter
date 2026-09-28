#!/usr/bin/env bash
# Derive the local candidate runtime only from this checkout's root-only
# runtime files. Local authentication remains independent from production;
# the remaining deployment secrets are reused only for local dependency data.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
production_runtime="$repo_root/.runtime/weknora-production"
local_runtime="$repo_root/.runtime/weknora"
production_secrets="$production_runtime/secrets"
local_secrets="$local_runtime/secrets"
local_source_env="$local_runtime/local.source.env"

die() {
    printf '%s\n' "$1" >&2
    exit 1
}

read_secret() {
    local path="$1"
    local value
    [ -f "$path" ] && [ -r "$path" ] && [ ! -L "$path" ] || die 'local runtime secret input is unavailable'
    value="$(tr -d '\r\n' < "$path")"
    [ -n "$value" ] || die 'local runtime secret input is empty'
    printf '%s' "$value"
}

install -d -m 700 "$local_runtime" "$local_secrets"

for required in \
    "$production_runtime/production.public.env" \
    "$local_runtime/auth-public.env" \
    "$local_secrets/oidc_client_id" \
    "$local_secrets/oidc_client_secret"; do
    [ -f "$required" ] && [ -r "$required" ] || die 'local runtime authentication configuration is unavailable'
done
for secret_name in db_password redis_password system_aes_key jwt_secret neo4j_auth searxng_secret; do
    read_secret "$production_secrets/$secret_name" >/dev/null
done

# Only deployment-independent public settings become the input to the existing
# candidate preparer. Candidate identity, ports, URLs, OIDC and volume names
# remain authoritative in prepare-runtime.sh.
awk '
    /^[[:space:]]*($|#)/ { next }
    /^[A-Za-z_][A-Za-z0-9_]*=/ {
        key = $0
        sub(/=.*/, "", key)
        if (key !~ /^WEKNORA_PRODUCTION_/ && key != "DB_USER") print
    }
' "$production_runtime/production.public.env" > "$local_source_env"

neo4j_auth="$(read_secret "$production_secrets/neo4j_auth")"
case "$neo4j_auth" in
    neo4j/?*) neo4j_password="${neo4j_auth#neo4j/}" ;;
    *) die 'local Neo4j credential format is invalid' ;;
esac

printf '%s\n' \
    'DB_USER=postgres' \
    "DB_PASSWORD=$(read_secret "$production_secrets/db_password")" \
    "REDIS_PASSWORD=$(read_secret "$production_secrets/redis_password")" \
    "SYSTEM_AES_KEY=$(read_secret "$production_secrets/system_aes_key")" \
    "JWT_SECRET=$(read_secret "$production_secrets/jwt_secret")" \
    "NEO4J_PASSWORD=$neo4j_password" \
    "SEARXNG_SECRET=$(read_secret "$production_secrets/searxng_secret")" >> "$local_source_env"
unset neo4j_auth neo4j_password
chmod 600 "$local_source_env"

WEKNORA_LEGACY_ENV="$local_source_env" \
    "$repo_root/scripts/weknora-candidate/prepare-runtime.sh"

printf '%s\n' 'local runtime prepared entirely from this checkout; fresh named volumes may be created by Compose'
