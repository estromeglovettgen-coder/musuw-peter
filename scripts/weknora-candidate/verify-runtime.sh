#!/usr/bin/env bash
# Runtime acceptance for the v0.7.2-data upgrade candidate. It prints only safe
# operational facts and never expands candidate.env or secret-file contents.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
candidate_env="$repo_root/.runtime/weknora/candidate.env"
app_image="weknora-v072-candidate-app:81142df"
app_port="$(awk -F= '/^WEKNORA_CANDIDATE_APP_PORT=/{print $2; exit}' "$candidate_env")"
frontend_port="$(awk -F= '/^WEKNORA_CANDIDATE_FRONTEND_PORT=/{print $2; exit}' "$candidate_env")"

if [ -z "$app_port" ] || [ -z "$frontend_port" ]; then
    printf '%s\n' 'candidate runtime ports are unavailable' >&2
    exit 1
fi
if ! docker image inspect "$app_image" >/dev/null; then
    printf '%s\n' 'candidate fixed-main app image is unavailable' >&2
    exit 1
fi

image_version="$(docker image inspect "$app_image" --format '{{ index .Config.Labels "org.opencontainers.image.version" }}')"
image_revision="$(docker image inspect "$app_image" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}')"
if [ "$image_version" != 'main-81142df' ] || [ "$image_revision" != '81142dfd17b2778087e95d3a317483a2fd909b91' ]; then
    printf '%s\n' 'candidate image provenance labels are not the fixed upstream main source' >&2
    exit 1
fi

docker run --rm --entrypoint /bin/sh "$app_image" -ec '
    test -x /app/WeKnora
    test -x /app/scripts/docker-entrypoint.sh
    test -f /app/migrations/versioned/000080_default_searxng_provider.up.sql
    test -f /app/migrations/versioned/000081_builtin_agent_model_defaults.up.sql
    test -d /app/config
    test -d /app/skills/preloaded
    test -f /app/migrations/versioned/000104_skill_catalog.up.sql
    grep -aq "main-81142df" /app/WeKnora
    grep -aq "81142dfd17b2778087e95d3a317483a2fd909b91" /app/WeKnora
    grep -aq "anydoc" /app/WeKnora
    ! grep -aq "a47981a" /app/WeKnora
'

deadline=$(( $(date +%s) + 180 ))
until curl -fsS --connect-timeout 2 "http://127.0.0.1:${app_port}/health" >/dev/null; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
        printf '%s\n' 'candidate native app health did not become ready' >&2
        exit 1
    fi
    sleep 2
done

curl -fsS --connect-timeout 2 "http://127.0.0.1:${frontend_port}/" >/dev/null
curl -fsS --connect-timeout 2 "http://127.0.0.1:${frontend_port}/health" >/dev/null
curl -fsS --connect-timeout 2 "http://127.0.0.1:${frontend_port}/auth/start" >/dev/null

# This only constructs the provider URL and browser binding cookie locally;
# it does not exchange a code or contact the provider.
oidc_response="$(mktemp)"
oidc_cookies="$(mktemp)"
trap 'rm -f "$oidc_response" "$oidc_cookies"' EXIT
curl -fsS --connect-timeout 2 -c "$oidc_cookies" \
    --get --data-urlencode "redirect_uri=http://localhost:${frontend_port}/" \
    "http://127.0.0.1:${frontend_port}/api/v1/auth/oidc/url" > "$oidc_response"
jq -e '(.authorization_url | type == "string") and (.authorization_url | contains("code_challenge=")) and (.authorization_url | contains("code_challenge_method=S256"))' "$oidc_response" >/dev/null
grep -q 'weknora_oidc_binding' "$oidc_cookies"

# psql -A -t uses its default | field separator, so this output contains no
# connection parameters or database content.
latest_migration_version="$(find "$repo_root/weknora/migrations/versioned" -maxdepth 1 -type f -name '[0-9][0-9][0-9][0-9][0-9][0-9]_*.up.sql' -exec basename {} \; | sed 's/_.*//' | sort -n | tail -1)"
latest_migration_version="$(printf '%s' "$latest_migration_version" | sed 's/^0*//; s/^$/0/')"
migration_state="$(docker exec weknora-v072-candidate-postgres sh -ec 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT version, dirty FROM schema_migrations"')"
if [ -z "$latest_migration_version" ] || [ "$migration_state" != "${latest_migration_version}|f" ]; then
    printf '%s\n' "candidate database is not cleanly migrated to latest version ${latest_migration_version:-unknown}" >&2
    exit 1
fi

service_names="$(docker ps --filter label=com.docker.compose.project=weknora-v072-candidate --format '{{.Names}}' | sort | tr '\n' ' ')"
case "$service_names" in
    *musnow*|*Musnow*)
        printf '%s\n' 'candidate runtime contains a legacy service' >&2
        exit 1
        ;;
esac

printf '%s\n' "candidate runtime green: main-81142df binary/provenance with AnyDoc, native/direct and frontend-proxied health, UI/OIDC PKCE, migration ${latest_migration_version}, no legacy service"
