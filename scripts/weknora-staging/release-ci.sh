#!/usr/bin/env bash
# Fixed server-side staging release helper. The only caller-selected value is
# the full Git SHA; runtime roots, Compose identity, and service names are
# fixed here. App/frontend images are pulled by digest and are never built.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
. "$script_dir/lib.sh"

[ "$#" -eq 1 ] || weknora_staging_die 'usage: release-ci.sh <full-sha>'
revision="$1"
[[ "$revision" =~ ^[0-9a-fA-F]{40}$ ]] || weknora_staging_die 'staging release revision must be a full SHA'
revision="$(printf '%s' "$revision" | tr '[:upper:]' '[:lower:]')"

repo_root="$(cd "$script_dir/../.." && pwd -P)"
release_id="musuw-$revision"
runtime_dir="${WEKNORA_STAGING_RUNTIME_DIR:-/opt/weknora/staging-runtime}"
release_root='/opt/weknora-staging/releases'
current_link='/opt/weknora-staging/current'
manifest_script="$script_dir/source-manifest.sh"

for command_name in bash curl date docker find jq sha256sum; do
    weknora_staging_require_command "$command_name"
done
for required in "$manifest_script" "$script_dir/prepare-runtime.sh" "$script_dir/compose.sh" \
    "$repo_root/deploy/staging.public.env" "$repo_root/deploy/auth-public.env"; do
    weknora_staging_require_file "$required"
done
[ -d "$runtime_dir" ] && [ ! -L "$runtime_dir" ] || weknora_staging_die 'staging runtime directory is unavailable or unsafe'

IFS= read -r ghcr_username || weknora_staging_die 'GHCR username is missing from deploy stream'
IFS= read -r ghcr_token || weknora_staging_die 'GHCR token is missing from deploy stream'
case "$ghcr_username" in ''|*[!A-Za-z0-9._-]*) weknora_staging_die 'GHCR username is unsafe' ;; esac
[ -n "$ghcr_token" ] || weknora_staging_die 'GHCR token is empty'

source_bundle_sha256="$(WEKNORA_STAGING_RUNTIME_DIR="$runtime_dir" WEKNORA_STAGING_REVISION="$revision" bash "$manifest_script" verify "$repo_root")"
install -m 600 "$repo_root/deploy/staging.public.env" "$runtime_dir/staging.public.env"
install -m 600 "$repo_root/deploy/auth-public.env" "$runtime_dir/auth-public.env"
WEKNORA_STAGING_RUNTIME_DIR="$runtime_dir" \
WEKNORA_STAGING_PUBLIC_ENV="$runtime_dir/staging.public.env" \
WEKNORA_STAGING_AUTH_PUBLIC_ENV="$runtime_dir/auth-public.env" \
MUSUW_STAGING_SECRET_DIR="$runtime_dir/secrets" \
    "$script_dir/prepare-runtime.sh"

# Protect the healthy production project before pulling or starting any
# staging service. This guard reads only Docker state and host memory metadata;
# it never opens production env or secret files.
"$script_dir/capacity-preflight.sh"

docker_config="$(mktemp -d /run/musuw-staging-ghcr.XXXXXX)"
chmod 700 "$docker_config"
staging_mutated=0
cleanup() {
    local status=$?
    trap - EXIT
    if [ "$status" -ne 0 ] && [ "${staging_mutated:-0}" -eq 1 ]; then
        DOCKER_CONFIG="$docker_config" WEKNORA_STAGING_RUNTIME_DIR="$runtime_dir" \
            "$script_dir/compose.sh" --edge down --remove-orphans >/dev/null 2>&1 || true
    fi
    if [ -d "${docker_config:-}" ]; then
        DOCKER_CONFIG="$docker_config" docker logout ghcr.io >/dev/null 2>&1 || true
        find "$docker_config" -depth -delete 2>/dev/null || true
    fi
    unset ghcr_username ghcr_token docker_config
    exit "$status"
}
trap cleanup EXIT

printf '%s\n' "$ghcr_token" |
    DOCKER_CONFIG="$docker_config" docker login ghcr.io --username "$ghcr_username" --password-stdin >/dev/null
DOCKER_CONFIG="$docker_config" WEKNORA_STAGING_RUNTIME_DIR="$runtime_dir" \
    "$script_dir/compose.sh" --edge pull app frontend

# Bring up the native staging services, including the isolated SearXNG and Neo4j services.
# The app/frontend recreation is digest-pinned and explicitly --no-build.
staging_mutated=1
DOCKER_CONFIG="$docker_config" WEKNORA_STAGING_RUNTIME_DIR="$runtime_dir" \
    "$script_dir/compose.sh" --edge up -d --no-build postgres redis docreader searxng-init searxng neo4j app frontend

wait_for_healthy() {
    local container="$1" deadline status image_revision
    deadline=$(( $(date +%s) + 300 ))
    while [ "$(date +%s)" -lt "$deadline" ]; do
        status="$(docker inspect "$container" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
        case "$status" in
            healthy) break ;;
            unhealthy|exited|dead) weknora_staging_die "staging container is not healthy: $container" ;;
        esac
        sleep 2
    done
    status="$(docker inspect "$container" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
    [ "$status" = healthy ] || weknora_staging_die "staging container health timed out: $container"
    image_revision="$(docker inspect "$container" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
    [ "$image_revision" = "$revision" ] || weknora_staging_die "staging image revision does not match requested SHA: $container"
}

wait_for_healthy weknora-v072-staging-app
wait_for_healthy weknora-v072-staging-frontend

# Liveness alone cannot prove that the startup migrator succeeded.  Bind the
# deployed database to the newest migration carried by this exact release.
latest_migration_version="$(docker exec weknora-v072-staging-app bash -o pipefail -ec 'find /app/migrations/versioned -maxdepth 1 -type f -name '\''[0-9][0-9][0-9][0-9][0-9][0-9]_*.up.sql'\'' -exec basename {} \; | sed '\''s/_.*//'\'' | sort -n | tail -1')" ||
    weknora_staging_die 'staging app migration inventory is unavailable'
[ -n "$latest_migration_version" ] || weknora_staging_die 'staging app migration inventory is empty'
latest_migration_version="$(printf '%s' "$latest_migration_version" | sed 's/^0*//; s/^$/0/')"
migration_state="$(docker exec weknora-v072-staging-postgres sh -ec 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT version, dirty FROM schema_migrations"')" ||
    weknora_staging_die 'staging database migration state is unavailable'
if [ -z "$latest_migration_version" ] || [ "$migration_state" != "${latest_migration_version}|f" ]; then
    weknora_staging_die "staging database is not cleanly migrated to latest version ${latest_migration_version:-unknown}"
fi

app_port="$(weknora_staging_require_env_value "$runtime_dir/staging.env" WEKNORA_STAGING_APP_PORT)"
frontend_port="$(weknora_staging_require_env_value "$runtime_dir/staging.env" WEKNORA_STAGING_FRONTEND_PORT)"
curl -fsS --connect-timeout 10 --retry 6 --retry-delay 2 "http://127.0.0.1:${app_port}/health" >/dev/null
curl -fsS --connect-timeout 10 --retry 6 --retry-delay 2 "http://127.0.0.1:${frontend_port}/health" >/dev/null

[ -L "$current_link" ] || [ ! -e "$current_link" ] || weknora_staging_die 'staging current path is not a symlink'
install -d -m 755 "$release_root"
release_dir="$release_root/$release_id"
[ ! -e "$release_dir" ] || [ -d "$release_dir" ] || weknora_staging_die 'staging release directory is unsafe'
if [ ! -e "$release_dir" ]; then install -d -m 755 "$release_dir"; fi
record_tmp="$runtime_dir/release-record.json.$$"
jq -n \
    --arg schema 'musuw.staging-release.v1' \
    --arg release_id "$release_id" \
    --arg revision "$revision" \
    --arg source_bundle_sha256 "$source_bundle_sha256" \
    --arg app_image "$(weknora_staging_require_env_value "$runtime_dir/staging.env" WEKNORA_STAGING_APP_IMAGE)" \
    --arg frontend_image "$(weknora_staging_require_env_value "$runtime_dir/staging.env" WEKNORA_STAGING_FRONTEND_IMAGE)" \
    '{schema_version:$schema,release_id:$release_id,revision:$revision,source_bundle_sha256:$source_bundle_sha256,app_image:$app_image,frontend_image:$frontend_image,environment:"staging",paddle_environment:"sandbox"}' \
    > "$record_tmp"
chmod 600 "$record_tmp"
mv -f "$record_tmp" "$runtime_dir/release-record.json"

next_link="$runtime_dir/current.next.$$"
ln -s "$repo_root" "$next_link"
mv -Tf "$next_link" "$current_link"
staging_mutated=0

printf '%s\n' "staging release green: $release_id source_bundle_sha256=$source_bundle_sha256"
