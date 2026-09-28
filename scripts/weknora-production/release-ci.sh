#!/usr/bin/env bash
# Fixed server-side release helper. The only caller-selected value is the
# reviewed full Git SHA; source, runtime, Compose project and service names are
# derived locally from this release tree and the fixed production adapters.
set -euo pipefail

# Compose gives inherited shell variables precedence over --env-file values.
# Clear the public OIDC coordinates once at the release boundary so both the
# current wrapper and a rollback through an older wrapper use production.env.
unset \
    OIDC_AUTH_ISSUER_URL \
    OIDC_AUTH_DISCOVERY_URL \
    OIDC_AUTH_AUTHORIZATION_ENDPOINT \
    OIDC_AUTH_TOKEN_ENDPOINT \
    OIDC_AUTH_USER_INFO_ENDPOINT

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
. "$script_dir/lib.sh"

die() {
    weknora_production_die "$1"
}

[ "$#" -eq 1 ] || die 'usage: release-ci.sh <full-sha>'
revision="$1"
[[ "$revision" =~ ^[0-9a-fA-F]{40}$ ]] || die 'release revision must be a full 40-character Git SHA'
revision="$(printf '%s' "$revision" | tr '[:upper:]' '[:lower:]')"

repo_root="$(cd "$script_dir/../.." && pwd -P)"
release_root='/opt/weknora/releases'
runtime_dir="${WEKNORA_PRODUCTION_RUNTIME_DIR:-/opt/weknora/runtime}"
current_link='/opt/weknora/current'
release_id="musuw-$revision"
manifest_script="$script_dir/source-manifest.sh"
for command_name in awk bash curl date docker find install jq ln mktemp mv readlink sha256sum sleep; do
    weknora_production_require_command "$command_name"
done
for required in \
    "$manifest_script" \
    "$script_dir/prepare-runtime.sh" \
    "$script_dir/compose.sh" \
    "$repo_root/deploy/production.public.env" \
    "$repo_root/deploy/auth-public.env"; do
    weknora_production_require_file "$required"
done

[ -d "$runtime_dir" ] && [ ! -L "$runtime_dir" ] || die 'production runtime directory is unavailable or unsafe'

# Bind rollback to the exact release that currently serves production. A
# failed candidate may replace app/frontend containers before it is healthy,
# so preserving only the current symlink is not sufficient.
[ -L "$current_link" ] || die 'current production release is unavailable or unsafe'
previous_source="$(readlink -f "$current_link")"
case "$previous_source" in
    "$release_root"/musuw-*/source) ;;
    *) die 'current production release target is outside the fixed release root' ;;
esac
[ -d "$previous_source" ] && [ ! -L "$previous_source" ] || die 'current production source is unavailable or unsafe'

docker_config=''
rollback_dir=''
runtime_mutated=0
compose_mutated=0
previous_revision=''

restore_runtime_snapshot() {
    local runtime_file
    [ -n "$rollback_dir" ] && [ -d "$rollback_dir" ] || return 1
    for runtime_file in production.public.env auth-public.env production.env; do
        [ -f "$rollback_dir/$runtime_file" ] && [ ! -L "$rollback_dir/$runtime_file" ] || return 1
        install -m 600 "$rollback_dir/$runtime_file" "$runtime_dir/$runtime_file" || return 1
    done
}

rollback_wait_for_healthy() {
    local container="$1"
    local expected_revision="$2"
    local expected_image="$3"
    local deadline=$(( $(date +%s) + 240 ))
    local status image_revision image_reference

    while [ "$(date +%s)" -lt "$deadline" ]; do
        status="$(docker inspect "$container" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
        case "$status" in
            healthy) break ;;
            unhealthy|exited|dead) return 1 ;;
        esac
        sleep 2
    done
    status="$(docker inspect "$container" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
    [ "$status" = healthy ] || return 1
    image_revision="$(docker inspect "$container" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null || true)"
    image_reference="$(docker inspect "$container" --format '{{.Config.Image}}' 2>/dev/null || true)"
    [ "$image_revision" = "$expected_revision" ] && [ "$image_reference" = "$expected_image" ]
}

rollback_production() {
    local previous_compose="$previous_source/scripts/weknora-production/compose.sh"
    local previous_env="$rollback_dir/production.env"
    local previous_app_image previous_frontend_image app_port frontend_port

    restore_runtime_snapshot || return 1
    [ -x "$previous_compose" ] || return 1
    previous_app_image="$(weknora_production_env_value "$previous_env" WEKNORA_PRODUCTION_APP_IMAGE || true)"
    previous_frontend_image="$(weknora_production_env_value "$previous_env" WEKNORA_PRODUCTION_FRONTEND_IMAGE || true)"
    app_port="$(weknora_production_env_value "$previous_env" WEKNORA_PRODUCTION_APP_PORT || true)"
    frontend_port="$(weknora_production_env_value "$previous_env" WEKNORA_PRODUCTION_FRONTEND_PORT || true)"
    [[ "$previous_app_image" =~ ^ghcr\.io/estromeglovettgen-coder/musuw-app@sha256:[0-9a-f]{64}$ ]] || return 1
    [[ "$previous_frontend_image" =~ ^ghcr\.io/estromeglovettgen-coder/musuw-frontend@sha256:[0-9a-f]{64}$ ]] || return 1
    case "$app_port:$frontend_port" in
        *[!0-9:]*|:*|*:) return 1 ;;
    esac

    DOCKER_CONFIG="$docker_config" WEKNORA_PRODUCTION_RUNTIME_DIR="$runtime_dir" \
    WEKNORA_PRODUCTION_REVISION="$previous_revision" \
        "$previous_compose" --edge up -d --no-build --no-deps --force-recreate app frontend || return 1
    rollback_wait_for_healthy weknora-v072-production-app "$previous_revision" "$previous_app_image" || return 1
    rollback_wait_for_healthy weknora-v072-production-frontend "$previous_revision" "$previous_frontend_image" || return 1
    curl -fsS --connect-timeout 10 --retry 6 --retry-delay 2 "http://127.0.0.1:${app_port}/health" >/dev/null || return 1
    curl -fsS --connect-timeout 10 --retry 6 --retry-delay 2 "http://127.0.0.1:${frontend_port}/health" >/dev/null || return 1
}

cleanup() {
    local status=$?
    local rollback_status=0
    trap - EXIT
    set +e
    if [ "$status" -ne 0 ] && [ "${runtime_mutated:-0}" -eq 1 ]; then
        if [ "${compose_mutated:-0}" -eq 1 ]; then
            rollback_production
            rollback_status=$?
        else
            restore_runtime_snapshot
            rollback_status=$?
        fi
        if [ "$rollback_status" -ne 0 ]; then
            printf '%s\n' 'automatic production rollback failed' >&2
        fi
    fi
    if [ -n "${docker_config:-}" ] && [ -d "$docker_config" ]; then
        DOCKER_CONFIG="$docker_config" docker logout ghcr.io >/dev/null 2>&1 || true
        find "$docker_config" -depth -delete 2>/dev/null || true
    fi
    if [ -n "${rollback_dir:-}" ] && [ -d "$rollback_dir" ]; then
        find "$rollback_dir" -depth -delete 2>/dev/null || true
    fi
    unset ghcr_username ghcr_token docker_config rollback_dir
    exit "$status"
}
trap cleanup EXIT

rollback_dir="$(mktemp -d "$runtime_dir/release-rollback.XXXXXX")"
chmod 700 "$rollback_dir"
for runtime_file in production.public.env auth-public.env production.env; do
    [ -f "$runtime_dir/$runtime_file" ] && [ ! -L "$runtime_dir/$runtime_file" ] || \
        die 'existing production runtime configuration is unavailable or unsafe'
    install -m 600 "$runtime_dir/$runtime_file" "$rollback_dir/$runtime_file"
done
previous_revision="$(weknora_production_env_value "$rollback_dir/production.env" WEKNORA_PRODUCTION_REVISION || true)"
[[ "$previous_revision" =~ ^[0-9a-f]{40}$ ]] || die 'existing production revision is unavailable or unsafe'
[ "$previous_source" = "$release_root/musuw-$previous_revision/source" ] || \
    die 'current production source does not match its runtime revision'

# The runner streams a short-lived GitHub token over the restricted SSH
# connection. Keep it out of argv, logs and the persistent runtime directory;
# Docker reads the credential only from this temporary config during pull.
IFS= read -r ghcr_username || die 'GHCR username is missing from the deploy stream'
IFS= read -r ghcr_token || die 'GHCR token is missing from the deploy stream'
case "$ghcr_username" in
    ''|*[!A-Za-z0-9._-]*) die 'GHCR username is unsafe' ;;
esac
[ -n "$ghcr_token" ] || die 'GHCR token is empty'
docker_config="$(mktemp -d /run/musuw-ghcr.XXXXXX)"
chmod 700 "$docker_config"

# The manifest is checked again after rsync and before touching server runtime
# state. It binds the exact release directory to this caller-supplied SHA.
source_bundle_sha256="$(
    WEKNORA_PRODUCTION_RUNTIME_DIR="$runtime_dir" \
    WEKNORA_PRODUCTION_REVISION="$revision" \
        bash "$manifest_script" verify "$repo_root"
)"

runtime_mutated=1
install -m 600 "$repo_root/deploy/production.public.env" "$runtime_dir/production.public.env"
install -m 600 "$repo_root/deploy/auth-public.env" "$runtime_dir/auth-public.env"

WEKNORA_PRODUCTION_RUNTIME_DIR="$runtime_dir" \
WEKNORA_PRODUCTION_REVISION="$revision" \
    "$script_dir/prepare-runtime.sh"

# Images are built and pushed by the GitHub Actions release job. The server
# only pulls the exact digest references carried in production.env and never
# invokes Docker build.
printf '%s\n' "$ghcr_token" |
    DOCKER_CONFIG="$docker_config" docker login ghcr.io \
        --username "$ghcr_username" --password-stdin >/dev/null
DOCKER_CONFIG="$docker_config" WEKNORA_PRODUCTION_RUNTIME_DIR="$runtime_dir" \
    "$script_dir/compose.sh" --edge pull app frontend

# The fixed native Compose project replaces only the application/frontend
# services; named data services and volumes remain authoritative on the host.
compose_mutated=1
DOCKER_CONFIG="$docker_config" WEKNORA_PRODUCTION_RUNTIME_DIR="$runtime_dir" \
WEKNORA_PRODUCTION_REVISION="$revision" \
    "$script_dir/compose.sh" --edge up -d --no-build --no-deps --force-recreate app frontend

wait_for_healthy() {
    local container="$1"
    local deadline=$(( $(date +%s) + 240 ))
    local status image_revision
    while [ "$(date +%s)" -lt "$deadline" ]; do
        status="$(docker inspect "$container" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
        case "$status" in
            healthy) break ;;
            unhealthy|exited|dead) die "production container is not healthy: $container" ;;
        esac
        sleep 2
    done
    status="$(docker inspect "$container" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
    [ "$status" = healthy ] || die "production container health timed out: $container"
    image_revision="$(docker inspect "$container" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
    [ "$image_revision" = "$revision" ] || die "production image revision does not match requested SHA: $container"
}

wait_for_healthy weknora-v072-production-app
wait_for_healthy weknora-v072-production-frontend

# The application health endpoint is intentionally a liveness probe and the
# migrator logs-and-continues on error.  Refuse to activate a release unless
# the authoritative database reached the newest migration in this exact tree.
latest_migration_version="$(docker exec weknora-v072-production-app bash -o pipefail -ec 'find /app/migrations/versioned -maxdepth 1 -type f -name '\''[0-9][0-9][0-9][0-9][0-9][0-9]_*.up.sql'\'' -exec basename {} \; | sed '\''s/_.*//'\'' | sort -n | tail -1')" ||
    die 'production app migration inventory is unavailable'
[ -n "$latest_migration_version" ] || die 'production app migration inventory is empty'
latest_migration_version="$(printf '%s' "$latest_migration_version" | sed 's/^0*//; s/^$/0/')"
migration_state="$(docker exec weknora-v072-production-postgres sh -ec 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT version, dirty FROM schema_migrations"')" ||
    die 'production database migration state is unavailable'
if [ -z "$latest_migration_version" ] || [ "$migration_state" != "${latest_migration_version}|f" ]; then
    die "production database is not cleanly migrated to latest version ${latest_migration_version:-unknown}"
fi

# Verify the running container, not only the rendered release input. These
# public endpoints are intentionally inspected without printing the remaining
# environment so file-backed credentials stay undisclosed.
app_env="$(docker inspect weknora-v072-production-app --format '{{range .Config.Env}}{{println .}}{{end}}')"
printf '%s\n' "$app_env" | grep -Fqx 'LOG_PATH=/var/log/weknora/app.log' || die 'production persistent application log is disabled'
log_mount="$(docker inspect weknora-v072-production-app --format '{{range .Mounts}}{{if eq .Destination "/var/log/weknora"}}{{.Type}}|{{.Name}}|{{.RW}}{{end}}{{end}}')"
[ "$log_mount" = 'volume|weknora-v072-production-app-logs|true' ] || die 'production application log volume is not isolated'
docker exec --user appuser weknora-v072-production-app sh -ec 'test -w /var/log/weknora && test -s /var/log/weknora/app.log && test -w /var/log/weknora/app.log && test "$(stat -c %a /var/log/weknora)" = 700' || die 'production application log is unavailable to the runtime user'
oidc_issuer="$(weknora_production_require_env_value "$runtime_dir/production.env" OIDC_AUTH_ISSUER_URL)"
printf '%s\n' "$app_env" | grep -Fqx "OIDC_AUTH_ISSUER_URL=$oidc_issuer" || die 'production OIDC issuer has drifted at runtime'
printf '%s\n' "$app_env" | grep -Fqx "OIDC_AUTH_DISCOVERY_URL=$oidc_issuer/.well-known/openid-configuration" || die 'production OIDC discovery URL has drifted at runtime'
printf '%s\n' "$app_env" | grep -Fqx "OIDC_AUTH_AUTHORIZATION_ENDPOINT=$oidc_issuer/oauth/authorize" || die 'production OIDC authorization endpoint has drifted at runtime'
printf '%s\n' "$app_env" | grep -Fqx "OIDC_AUTH_TOKEN_ENDPOINT=$oidc_issuer/oauth/token" || die 'production OIDC token endpoint has drifted at runtime'
printf '%s\n' "$app_env" | grep -Fqx "OIDC_AUTH_USER_INFO_ENDPOINT=$oidc_issuer/oauth/userinfo" || die 'production OIDC user-info endpoint has drifted at runtime'
unset app_env oidc_issuer

app_port="$(weknora_production_require_env_value "$runtime_dir/production.env" WEKNORA_PRODUCTION_APP_PORT)"
frontend_port="$(weknora_production_require_env_value "$runtime_dir/production.env" WEKNORA_PRODUCTION_FRONTEND_PORT)"
curl -fsS --connect-timeout 10 --retry 6 --retry-delay 2 "http://127.0.0.1:${app_port}/health" >/dev/null
curl -fsS --connect-timeout 10 --retry 6 --retry-delay 2 "http://127.0.0.1:${frontend_port}/health" >/dev/null
curl -fsS --connect-timeout 10 --retry 6 --retry-delay 2 https://app.musuw.com/health >/dev/null
curl -fsS --connect-timeout 10 --retry 6 --retry-delay 2 https://app.musuw.com/ >/dev/null
curl -fsS --connect-timeout 10 --retry 6 --retry-delay 2 https://app.musuw.com/auth/start >/dev/null

# Health and revision checks pass before the serving pointer changes. The
# atomic current activation is the only source activation operation here.
[ -L "$current_link" ] || [ ! -e "$current_link" ] || die 'current release path is not a symlink'
next_link="$runtime_dir/current.next.$$"
ln -s "$repo_root" "$next_link"
mv -Tf "$next_link" "$current_link"
runtime_mutated=0
compose_mutated=0

# Immutable releases leave old app/frontend images behind. Reclaim only images
# that no running container uses; named volumes and live images are untouched.
docker image prune -a -f >/dev/null || true

printf '%s\n' "simple release green: $release_id source_bundle_sha256=$source_bundle_sha256"
