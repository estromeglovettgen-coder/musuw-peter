#!/usr/bin/env bash
# The supported native production Compose invocation. It does not start
# services by itself; callers pass an explicit Compose subcommand.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$script_dir/lib.sh"

repo_root="$(weknora_production_repo_root)"
runtime_dir="$(weknora_production_runtime_dir)"
production_env="$runtime_dir/production.env"
revision="$(weknora_production_revision)"
use_edge=false

if [ "${1:-}" = '--edge' ]; then
    use_edge=true
    shift
fi

[ "$#" -gt 0 ] || weknora_production_die 'an explicit Docker Compose command is required'
weknora_production_require_file "$production_env"
weknora_production_require_command docker

compose_args=(
    --project-name weknora-v072-production
    --env-file "$production_env"
    -f "$repo_root/weknora/docker-compose.yml"
    -f "$repo_root/integration/weknora-production/compose.yaml"
)
if [ "$use_edge" = true ]; then
    compose_args+=( -f "$repo_root/integration/weknora-production/compose.edge.yaml" )
fi
compose_args+=( --profile neo4j --profile searxng )

exec env \
    -u OIDC_AUTH_ISSUER_URL \
    -u OIDC_AUTH_DISCOVERY_URL \
    -u OIDC_AUTH_AUTHORIZATION_ENDPOINT \
    -u OIDC_AUTH_TOKEN_ENDPOINT \
    -u OIDC_AUTH_USER_INFO_ENDPOINT \
    DOCKER_DEFAULT_PLATFORM=linux/amd64 \
    WEKNORA_PRODUCTION_RUNTIME_DIR="$runtime_dir" \
    WEKNORA_PRODUCTION_REVISION="$revision" \
    docker compose "${compose_args[@]}" "$@"
