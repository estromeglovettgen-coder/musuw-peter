#!/usr/bin/env bash
# Read-only deployed staging acceptance. It prints operational status only and
# never expands a secret, public token, webhook secret, or personal payload.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
. "$script_dir/lib.sh"

fail() { weknora_staging_die "$1"; }

runtime_dir="$(weknora_staging_runtime_dir)"
staging_env="$runtime_dir/staging.env"
weknora_staging_require_file "$staging_env"
weknora_staging_require_command docker
weknora_staging_require_command curl
weknora_staging_require_command jq
[ -x "$script_dir/capacity-preflight.sh" ] || fail 'staging capacity preflight is unavailable'

# Recheck host capacity and production health after staging has started. The
# guard reads Docker state and host memory metadata only, never production
# environment or secret files.
"$script_dir/capacity-preflight.sh"

revision="$(weknora_staging_revision)"
expected_app="$(weknora_staging_require_env_value "$staging_env" WEKNORA_STAGING_APP_IMAGE)"
expected_frontend="$(weknora_staging_require_env_value "$staging_env" WEKNORA_STAGING_FRONTEND_IMAGE)"
runner_expected_app="${WEKNORA_STAGING_EXPECTED_APP_IMAGE:-}"
runner_expected_frontend="${WEKNORA_STAGING_EXPECTED_FRONTEND_IMAGE:-}"
weknora_staging_require_immutable_image "$expected_app"
weknora_staging_require_immutable_image "$expected_frontend"
weknora_staging_require_immutable_image "$runner_expected_app"
weknora_staging_require_immutable_image "$runner_expected_frontend"
[ "$expected_app" = "$runner_expected_app" ] || fail 'staging app release record differs from the runner-approved digest'
[ "$expected_frontend" = "$runner_expected_frontend" ] || fail 'staging frontend release record differs from the runner-approved digest'

wait_for_healthy() {
    local container="$1" deadline status
    deadline=$(( $(date +%s) + 30 ))
    while [ "$(date +%s)" -lt "$deadline" ]; do
        status="$(docker inspect "$container" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
        [ "$status" = healthy ] && return 0
        case "$status" in unhealthy|exited|dead) fail "staging container is unhealthy: $container" ;; esac
        sleep 1
    done
    fail "staging container health timed out: $container"
}

for container in \
    weknora-v072-staging-neo4j \
    weknora-v072-staging-postgres \
    weknora-v072-staging-redis \
    weknora-v072-staging-docreader \
    weknora-v072-staging-app \
    weknora-v072-staging-frontend \
    weknora-v072-staging-searxng-init \
    weknora-v072-staging-searxng; do
    docker inspect "$container" >/dev/null 2>&1 || fail "staging container is missing: $container"
    project="$(docker inspect "$container" --format '{{index .Config.Labels "com.docker.compose.project"}}')"
    [ "$project" = weknora-v072-staging ] || fail "staging container has the wrong Compose project: $container"
done
wait_for_healthy weknora-v072-staging-neo4j
wait_for_healthy weknora-v072-staging-postgres
init_state="$(docker inspect weknora-v072-staging-searxng-init --format '{{.State.Status}}|{{.State.ExitCode}}' 2>/dev/null || true)"
[ "$init_state" = 'exited|0' ] || fail 'staging SearXNG init did not complete successfully'
wait_for_healthy weknora-v072-staging-searxng
wait_for_healthy weknora-v072-staging-app
wait_for_healthy weknora-v072-staging-frontend

# Promotion re-runs this verifier later, so recheck the database instead of
# trusting the earlier deployment record or the application's liveness probe.
latest_migration_version="$(docker exec weknora-v072-staging-app bash -o pipefail -ec 'find /app/migrations/versioned -maxdepth 1 -type f -name '\''[0-9][0-9][0-9][0-9][0-9][0-9]_*.up.sql'\'' -exec basename {} \; | sed '\''s/_.*//'\'' | sort -n | tail -1')" ||
    fail 'staging app migration inventory is unavailable'
[ -n "$latest_migration_version" ] || fail 'staging app migration inventory is empty'
latest_migration_version="$(printf '%s' "$latest_migration_version" | sed 's/^0*//; s/^$/0/')"
migration_state="$(docker exec weknora-v072-staging-postgres sh -ec 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT version, dirty FROM schema_migrations"')" ||
    fail 'staging database migration state is unavailable'
if [ -z "$latest_migration_version" ] || [ "$migration_state" != "${latest_migration_version}|f" ]; then
    fail "staging database is not cleanly migrated to latest version ${latest_migration_version:-unknown}"
fi

assert_resource_limits() {
    local container="$1" inspection memory nano_cpus pids_limit
    inspection="$(docker inspect "$container" --format '{{.HostConfig.Memory}}|{{.HostConfig.NanoCpus}}|{{.HostConfig.PidsLimit}}' 2>/dev/null || true)"
    [ -n "$inspection" ] || fail "staging resource metadata is unavailable: $container"
    IFS='|' read -r memory nano_cpus pids_limit <<< "$inspection"
    case "$memory" in ''|*[!0-9]*) fail "staging memory limit is invalid: $container" ;; esac
    case "$nano_cpus" in ''|*[!0-9]*) fail "staging CPU limit is invalid: $container" ;; esac
    case "$pids_limit" in ''|*[!0-9]*) fail "staging PID limit is invalid: $container" ;; esac
    [ "$memory" -gt 0 ] || fail "staging memory limit is missing: $container"
    [ "$nano_cpus" -gt 0 ] || fail "staging CPU limit is missing: $container"
    [ "$pids_limit" -gt 0 ] || fail "staging PID limit is missing: $container"
}
for container in \
    weknora-v072-staging-neo4j \
    weknora-v072-staging-postgres \
    weknora-v072-staging-redis \
    weknora-v072-staging-docreader \
    weknora-v072-staging-app \
    weknora-v072-staging-frontend \
    weknora-v072-staging-searxng-init \
    weknora-v072-staging-searxng; do
    assert_resource_limits "$container"
done

actual_app="$(docker inspect weknora-v072-staging-app --format '{{.Config.Image}}')"
actual_frontend="$(docker inspect weknora-v072-staging-frontend --format '{{.Config.Image}}')"
[ "$actual_app" = "$expected_app" ] || fail 'staging app digest does not match the release record'
[ "$actual_frontend" = "$expected_frontend" ] || fail 'staging frontend digest does not match the release record'
for container in weknora-v072-staging-app weknora-v072-staging-frontend; do
    image_revision="$(docker inspect "$container" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
    [ "$image_revision" = "$revision" ] || fail "staging image revision does not match requested SHA: $container"
done

service_names="$(docker ps --filter label=com.docker.compose.project=weknora-v072-staging --format '{{.Names}}' | sort | tr '\n' ' ')"
[ "$service_names" = 'weknora-v072-staging-app weknora-v072-staging-docreader weknora-v072-staging-frontend weknora-v072-staging-neo4j weknora-v072-staging-postgres weknora-v072-staging-redis weknora-v072-staging-searxng ' ] || fail 'staging started services are not the seven-service native stack plus init'

neo4j_port_bindings="$(docker inspect weknora-v072-staging-neo4j --format '{{json .HostConfig.PortBindings}}' 2>/dev/null || true)"
[ "$neo4j_port_bindings" = '{}' ] || [ "$neo4j_port_bindings" = null ] || fail 'staging Neo4j unexpectedly publishes a host port'
neo4j_networks="$(docker inspect weknora-v072-staging-neo4j --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{end}}')"
[ "$neo4j_networks" = weknora-v072-staging-internal ] || fail 'staging Neo4j network is not isolated'
searxng_port_bindings="$(docker inspect weknora-v072-staging-searxng --format '{{json .HostConfig.PortBindings}}' 2>/dev/null || true)"
[ "$searxng_port_bindings" = '{}' ] || [ "$searxng_port_bindings" = 'null' ] || fail 'staging SearXNG exposes a host port'
docker exec weknora-v072-staging-searxng python3 -c 'import json,urllib.request; response=urllib.request.urlopen("http://127.0.0.1:8080/search?q=musuw-staging-health&format=json", timeout=5); assert response.status == 200; assert isinstance(json.loads(response.read()).get("results"), list)' ||
    fail 'staging SearXNG search probe failed'

app_env="$(docker inspect weknora-v072-staging-app --format '{{range .Config.Env}}{{println .}}{{end}}')"
frontend_env="$(docker inspect weknora-v072-staging-frontend --format '{{range .Config.Env}}{{println .}}{{end}}')"
printf '%s\n' "$app_env" | grep -Fqx 'MUSUW_DEPLOYMENT_ENVIRONMENT=staging' || fail 'staging deployment selector is missing at runtime'
printf '%s\n' "$app_env" | grep -Fqx 'LOG_PATH=/var/log/weknora/app.log' || fail 'staging persistent application log is disabled'
log_mount="$(docker inspect weknora-v072-staging-app --format '{{range .Mounts}}{{if eq .Destination "/var/log/weknora"}}{{.Type}}|{{.Name}}|{{.RW}}{{end}}{{end}}')"
[ "$log_mount" = 'volume|weknora-v072-staging-app-logs|true' ] || fail 'staging application log volume is not isolated'
docker exec --user appuser weknora-v072-staging-app sh -ec 'test -w /var/log/weknora && test -s /var/log/weknora/app.log && test -w /var/log/weknora/app.log && test "$(stat -c %a /var/log/weknora)" = 700' || fail 'staging application log is unavailable to the runtime user'
printf '%s\n' "$app_env" | grep -Fqx 'MUSUW_PADDLE_ENVIRONMENT=sandbox' || fail 'staging Paddle selector is not Sandbox at runtime'
printf '%s\n' "$app_env" | grep -Fqx 'LANGFUSE_ENABLED=true' || fail 'staging Langfuse tracing is disabled at runtime'
printf '%s\n' "$app_env" | grep -Fqx 'LANGFUSE_HOST=https://jp.cloud.langfuse.com' || fail 'staging Langfuse host has drifted at runtime'
printf '%s\n' "$app_env" | grep -Fqx 'LANGFUSE_RELEASE=musuw-staging' || fail 'staging Langfuse release identity has drifted at runtime'
printf '%s\n' "$app_env" | grep -Fqx 'LANGFUSE_ENVIRONMENT=staging' || fail 'staging Langfuse environment has drifted at runtime'
printf '%s\n' "$app_env" | grep -Fqx 'NEO4J_ENABLE=true' || fail 'staging Neo4j is disabled at runtime'
printf '%s\n' "$app_env" | grep -Fqx 'NEO4J_URI=bolt://neo4j:7687' || fail 'staging Neo4j endpoint is not isolated'
printf '%s\n' "$app_env" | grep -Fqx 'WEKNORA_REDIS_NAMESPACE=weknora-v072-staging' || fail 'staging Redis namespace is not isolated at runtime'
printf '%s\n' "$app_env" | grep -Fqx 'APP_EXTERNAL_URL=https://staging.musuw.com' || fail 'staging external origin is not dotted HTTPS'
workspace_id="$(weknora_staging_require_env_value "$staging_env" OPENROUTER_WORKSPACE_ID)"
[[ "$workspace_id" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$ ]] || fail 'staging OpenRouter workspace ID is invalid'
printf '%s\n' "$app_env" | grep -Fqx "OPENROUTER_WORKSPACE_ID=$workspace_id" || fail 'staging OpenRouter workspace is not isolated at runtime'
workspace_pin_file="$runtime_dir/openrouter-workspace-id"
weknora_staging_require_file "$workspace_pin_file"
[ -O "$workspace_pin_file" ] || fail 'staging OpenRouter workspace pin ownership is unsafe'
[ "$(weknora_staging_file_mode "$workspace_pin_file")" = 600 ] || fail 'staging OpenRouter workspace pin permissions are unsafe'
workspace_pin="$(awk 'NR == 1 { value = $0 } END { if (NR != 1) exit 1; print value }' "$workspace_pin_file")" ||
    fail 'staging OpenRouter workspace pin must contain exactly one line'
[ "$workspace_id" = "$workspace_pin" ] || fail 'staging OpenRouter runtime differs from the server pin'

printf '%s\n' "$app_env" | grep -Fqx 'S3_BUCKET_NAME=musuw-staging' || fail 'staging app does not point at the commissioned R2 test bucket'
r2_endpoint="$(weknora_staging_require_env_value "$staging_env" MUSUW_STAGING_R2_ENDPOINT)"
case "$r2_endpoint" in https://*.r2.cloudflarestorage.com) ;; *) fail 'staging R2 endpoint is invalid at promotion verification' ;; esac
printf '%s\n' "$app_env" | grep -Fqx "S3_ENDPOINT=$r2_endpoint" || fail 'staging app R2 endpoint differs from the release environment'
printf '%s\n' "$app_env" | grep -Fqx 'MUSUW_SUPABASE_URL=https://achfnnicetupvtoqiwqd.supabase.co' || fail 'staging app Supabase project has drifted'
printf '%s\n' "$frontend_env" | grep -Fqx 'MUSUW_SUPABASE_URL=https://achfnnicetupvtoqiwqd.supabase.co' || fail 'staging frontend Supabase project has drifted'
printf '%s\n' "$frontend_env" | grep -Fqx 'MUSUW_AUTH_PUBLIC_ORIGIN=https://staging.musuw.com' || fail 'staging browser auth origin has drifted'
printf '%s\n' "$app_env" | grep -Fqx 'FRONTEND_BASE_URL=https://staging.musuw.com' || fail 'staging backend frontend origin has drifted'
printf '%s\n' "$app_env" | grep -Fqx 'OIDC_AUTH_ISSUER_URL=https://achfnnicetupvtoqiwqd.supabase.co/auth/v1' || fail 'staging OIDC issuer has drifted'
printf '%s\n' "$app_env" | grep -Fqx 'OIDC_AUTH_DISCOVERY_URL=https://achfnnicetupvtoqiwqd.supabase.co/auth/v1/.well-known/openid-configuration' || fail 'staging OIDC discovery URL has drifted'
printf '%s\n' "$app_env" | grep -Fqx 'OIDC_AUTH_AUTHORIZATION_ENDPOINT=https://achfnnicetupvtoqiwqd.supabase.co/auth/v1/oauth/authorize' || fail 'staging OIDC authorization endpoint has drifted'
printf '%s\n' "$app_env" | grep -Fqx 'OIDC_AUTH_TOKEN_ENDPOINT=https://achfnnicetupvtoqiwqd.supabase.co/auth/v1/oauth/token' || fail 'staging OIDC token endpoint has drifted'
printf '%s\n' "$app_env" | grep -Fqx 'OIDC_AUTH_USER_INFO_ENDPOINT=https://achfnnicetupvtoqiwqd.supabase.co/auth/v1/oauth/userinfo' || fail 'staging OIDC user-info endpoint has drifted'

app_port="$(weknora_staging_require_env_value "$staging_env" WEKNORA_STAGING_APP_PORT)"
frontend_port="$(weknora_staging_require_env_value "$staging_env" WEKNORA_STAGING_FRONTEND_PORT)"
curl -fsS --connect-timeout 5 "http://127.0.0.1:${app_port}/health" >/dev/null
curl -fsS --connect-timeout 5 "http://127.0.0.1:${frontend_port}/health" >/dev/null

headers_have_noindex() {
    local path="$1" headers
    # Preserve response headers even when a fixture/static asset is a 404; the
    # noindex contract applies to error responses on every public surface too.
    headers="$(curl -sS --connect-timeout 5 -D - -o /dev/null "http://127.0.0.1:${frontend_port}${path}")"
    printf '%s\n' "$headers" | grep -Eiq '^X-Robots-Tag:[[:space:]]*noindex[[:space:]]*,[[:space:]]*nofollow[[:space:]]*$' || fail "staging response lacks noindex header: $path"
}
headers_have_noindex '/'
headers_have_noindex '/auth/start'
headers_have_noindex '/api/v1/billing/paddle/public-config'
headers_have_noindex '/assets/'

paddle_json="$(mktemp)"
trap 'rm -f "$paddle_json"' EXIT
curl -fsS --connect-timeout 5 "http://127.0.0.1:${frontend_port}/api/v1/billing/paddle/public-config" > "$paddle_json"
jq -e '(.configured == true) and (.environment == "sandbox") and (.client_token | type == "string" and startswith("test_"))' "$paddle_json" >/dev/null || fail 'staging public Paddle config is not a configured Sandbox unit'

for volume in \
    weknora-v072-staging-app-logs \
    weknora-v072-staging-neo4j-data \
    weknora-v072-staging-postgres-data \
    weknora-v072-staging-data-files \
    weknora-v072-staging-docreader-tmp \
    weknora-v072-staging-redis-data \
    weknora-v072-staging-searxng-config; do
    docker volume inspect "$volume" >/dev/null 2>&1 || fail "staging volume is missing: $volume"
done
docker network inspect weknora-v072-staging-internal >/dev/null 2>&1 || fail 'staging internal network is missing'

printf '%s\n' 'staging deployed green: seven-service health plus init, SearXNG search, noindex, Sandbox public config, isolated volumes/network, same digest release record'
