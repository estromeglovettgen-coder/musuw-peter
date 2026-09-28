#!/usr/bin/env bash
# The only supported staging Compose entrypoint. It never enables optional
# profiles and never passes a build command; callers must explicitly request a
# Compose operation such as config, pull, up, or down.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
. "$script_dir/lib.sh"

repo_root="$(weknora_staging_repo_root)"
runtime_dir="$(weknora_staging_runtime_dir)"
staging_env="$runtime_dir/staging.env"
use_edge=false
if [ "${1:-}" = '--edge' ]; then
    use_edge=true
    shift
fi
[ "$#" -gt 0 ] || weknora_staging_die 'an explicit staging Compose command is required'
weknora_staging_require_file "$staging_env"
weknora_staging_require_command docker

compose_args=(
    --project-name weknora-v072-staging
    --env-file "$staging_env"
    -f "$repo_root/weknora/docker-compose.yml"
    -f "$repo_root/integration/weknora-staging/compose.yaml"
)
if [ "$use_edge" = true ]; then
    compose_args+=( -f "$repo_root/integration/weknora-staging/compose.edge.yaml" )
fi

exec env \
    -u OIDC_AUTH_ISSUER_URL \
    -u OIDC_AUTH_DISCOVERY_URL \
    -u OIDC_AUTH_AUTHORIZATION_ENDPOINT \
    -u OIDC_AUTH_TOKEN_ENDPOINT \
    -u OIDC_AUTH_USER_INFO_ENDPOINT \
    DOCKER_DEFAULT_PLATFORM=linux/amd64 \
    DB_PASSWORD="${DB_PASSWORD:-__staging_file_backed__}" \
    REDIS_PASSWORD="${REDIS_PASSWORD:-__staging_file_backed__}" \
    WEKNORA_STAGING_RUNTIME_DIR="$runtime_dir" \
    WEKNORA_STAGING_REVISION="$(weknora_staging_revision)" \
    docker compose "${compose_args[@]}" "$@"
