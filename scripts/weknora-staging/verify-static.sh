#!/usr/bin/env bash
# Static staging acceptance. It renders Compose with synthetic, non-secret
# fixtures and validates the source/gate contract without creating Docker
# resources or contacting a server/provider.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd "$script_dir/../.." && pwd -P)"
staging_root="$repo_root/integration/weknora-staging"
# shellcheck source=lib.sh
. "$script_dir/lib.sh"

fail() { printf '%s\n' "$1" >&2; exit 1; }

for required in \
    "$staging_root/compose.yaml" "$staging_root/compose.edge.yaml" "$staging_root/app-entrypoint.sh" \
    "$repo_root/weknora/docker/searxng/settings.yml" "$repo_root/integration/weknora-production/searxng-entrypoint.sh" \
    "$staging_root/staging.env.example" "$staging_root/auth-public.env.example" \
    "$script_dir/lib.sh" "$script_dir/source-manifest.sh" "$script_dir/capacity-preflight.sh" "$script_dir/capacity-preflight.test.sh" "$script_dir/prepare-runtime.sh" \
    "$script_dir/compose.sh" "$script_dir/release-ci.sh" "$script_dir/verify-deployed.sh" \
    "$repo_root/scripts/weknora/paddle-ip-allowlist.sh" \
    "$repo_root/scripts/weknora-staging-deploy.sh" \
    "$script_dir/server/musuw-staging-deploy-gate" \
    "$script_dir/server/musuw-staging-deploy-ssh-gate" \
    "$script_dir/server/bootstrap-musuw-staging-deploy.sh" \
    "$script_dir/server/verify-musuw-staging-deploy-gate.sh"; do
    [ -f "$required" ] && [ ! -L "$required" ] || fail 'staging static inputs are incomplete'
done

bash -n "$repo_root/scripts/weknora/paddle-ip-allowlist.sh"

for script in "$script_dir"/*.sh "$script_dir/server"/*.sh "$repo_root/scripts/weknora-staging-deploy.sh"; do
    bash -n "$script" || fail "staging shell syntax is invalid: $script"
done

grep -Fq 'MUSUW_DEPLOYMENT_ENVIRONMENT: staging' "$staging_root/compose.yaml" || fail 'staging selector is missing'
grep -Fq 'MUSUW_PRODUCT_EDITION: lite' "$staging_root/compose.yaml" || fail 'staging product edition is not explicitly Lite'
grep -Fqx 'MUSUW_PRODUCT_EDITION=lite' "$staging_root/staging.env.example" || fail 'staging product edition fixture is missing'
grep -Fq 'MUSUW_PRODUCT_EDITION' "$script_dir/prepare-runtime.sh" || fail 'staging runtime does not carry the Lite product edition'
grep -Fq 'MUSUW_PADDLE_ENVIRONMENT: sandbox' "$staging_root/compose.yaml" || fail 'staging Paddle selector is not Sandbox'
grep -Fq 'MUSUW_PADDLE_API_URL: ${MUSUW_PADDLE_API_URL:-https://sandbox-api.paddle.com}' "$staging_root/compose.yaml" || fail 'staging Paddle API URL is not Sandbox'
grep -Fq 'NEO4J_ENABLE: "true"' "$staging_root/compose.yaml" || fail 'staging must enable isolated Neo4j'
grep -Fq 'MUSUW_STAGING_R2_BUCKET' "$staging_root/compose.yaml" || fail 'staging R2 bucket is not explicit'
grep -Fq '/opt/weknora/staging-runtime/secrets' "$staging_root/compose.yaml" || fail 'staging fixed secret root is missing'
grep -Fq '/opt/weknora-staging/app-entrypoint.sh' "$staging_root/compose.yaml" || fail 'staging does not mount its Sandbox-only entrypoint'
grep -Fq 'weknora-v072-staging-searxng' "$staging_root/compose.yaml" || fail 'staging SearXNG service identity is missing'
grep -Fq 'sha256:73aaf090f3d85aa34ee199857f03fa3a95c8ede2ffd4cc2cdb5b94e566b11662' "$staging_root/compose.yaml" || fail 'staging SearXNG init image is not pinned'
grep -Fq 'sha256:11a9b34cdc0b1ec2b991470a2762ecb5a1a531898289fb51dcd015260450729e' "$staging_root/compose.yaml" || fail 'staging SearXNG image is not pinned'
grep -Fq 'profiles: !reset []' "$staging_root/compose.yaml" || fail 'staging SearXNG profiles are not cleared'
grep -Fq 'WEKNORA_STAGING_SEARXNG_CONFIG_VOLUME' "$staging_root/compose.yaml" || fail 'staging SearXNG config volume is not isolated'
grep -Fq 'searxng_secret' "$staging_root/compose.yaml" || fail 'staging SearXNG secret is not file-backed'
grep -Fq 'musuw_paddle_validate_configuration' "$staging_root/app-entrypoint.sh" || fail 'staging entrypoint does not call generic Paddle validator'
grep -Fq 'sandbox' "$staging_root/app-entrypoint.sh" || fail 'staging entrypoint does not select Paddle Sandbox'
if grep -Fq 'musuw_paddle_validate_production_launch' "$staging_root/app-entrypoint.sh"; then
    fail 'staging entrypoint calls the production Live-only Paddle wrapper'
fi
if grep -Fq '/opt/weknora-production/app-entrypoint.sh' "$staging_root/compose.yaml"; then
    fail 'staging Compose mounts an unused production app entrypoint'
fi
if grep -Fq 'integration/weknora-production/app-entrypoint.sh' "$script_dir/source-manifest.sh"; then
    fail 'staging source manifest carries an unused production app entrypoint'
fi
grep -Fq 'weknora/docker/searxng/settings.yml' "$script_dir/source-manifest.sh" || fail 'staging source manifest omits the SearXNG settings template'
grep -Fq 'integration/weknora-production/searxng-entrypoint.sh' "$script_dir/source-manifest.sh" || fail 'staging source manifest omits the reused SearXNG entrypoint'
grep -Fq 'export TIKHUB_API_KEY="$(read_required_secret /run/secrets/tikhub_api_key tikhub-api-key)"' "$staging_root/app-entrypoint.sh" ||
    fail 'staging entrypoint does not read the TikHub API key from a secret'
grep -Fq 'source: tikhub_api_key' "$staging_root/compose.yaml" || fail 'staging app does not mount the TikHub secret'
grep -Fq 'file: ${MUSUW_STAGING_SECRET_DIR:?set MUSUW_STAGING_SECRET_DIR}/tikhub_api_key' "$staging_root/compose.yaml" ||
    fail 'staging TikHub secret is not file-backed'
grep -Fq 'tikhub_api_key' "$script_dir/prepare-runtime.sh" || fail 'staging runtime does not require the TikHub secret'
for langfuse_secret in langfuse_public_key langfuse_secret_key; do
    grep -Fq "source: $langfuse_secret" "$staging_root/compose.yaml" ||
        fail "staging app does not mount the Langfuse $langfuse_secret secret"
    grep -Fq "file: \${MUSUW_STAGING_SECRET_DIR:?set MUSUW_STAGING_SECRET_DIR}/$langfuse_secret" "$staging_root/compose.yaml" ||
        fail "staging Langfuse $langfuse_secret is not file-backed"
done
grep -Fq 'export LANGFUSE_PUBLIC_KEY="$(read_required_secret /run/secrets/langfuse_public_key langfuse-public-key)"' "$staging_root/app-entrypoint.sh" ||
    fail 'staging entrypoint does not export the Langfuse public key'
grep -Fq 'export LANGFUSE_SECRET_KEY="$(read_required_secret /run/secrets/langfuse_secret_key langfuse-secret-key)"' "$staging_root/app-entrypoint.sh" ||
    fail 'staging entrypoint does not export the Langfuse secret key'
grep -Fq 'LANGFUSE_ENABLED: "true"' "$staging_root/compose.yaml" ||
    fail 'staging Langfuse tracing is not enabled by default'
grep -Fq 'LANGFUSE_ENABLED=true' "$staging_root/staging.env.example" ||
    fail 'staging Langfuse tracing example is not enabled'
grep -Fq "LANGFUSE_ENABLED=true" "$script_dir/verify-deployed.sh" ||
    fail 'staging deployed verification does not assert Langfuse tracing is enabled'
for langfuse_secret in langfuse_public_key langfuse_secret_key; do
    grep -Fq "$langfuse_secret" "$script_dir/prepare-runtime.sh" ||
        fail "staging runtime does not require the Langfuse $langfuse_secret"
done
grep -Fq 'staging-web' "$staging_root/compose.edge.yaml" || fail 'staging edge alias is missing'
grep -Fq 'musnow-production_edge' "$staging_root/compose.edge.yaml" || fail 'staging tunnel network is missing'
grep -Fq 'HostConfig.Memory' "$script_dir/verify-deployed.sh" || fail 'staging deployed verification does not assert memory limits'
grep -Fq 'capacity-preflight.sh' "$script_dir/release-ci.sh" || fail 'staging release helper has no capacity preflight'
grep -Fq 'searxng-init searxng neo4j app frontend' "$script_dir/release-ci.sh" || fail 'staging release helper does not start SearXNG'

tmp_root="$(mktemp -d "${TMPDIR:-/tmp}/musuw-staging-static.XXXXXX")"
trap 'find "$tmp_root" -depth -delete 2>/dev/null || true' EXIT
runtime_dir="$tmp_root/runtime"
secret_dir="$runtime_dir/secrets"
mkdir -m 700 -p "$secret_dir"
for name in db_password redis_password system_aes_key jwt_secret oidc_client_id oidc_client_secret supabase_service_role_key openrouter_management_api_key paddle_api_key paddle_webhook_secret r2_access_key_id r2_secret_access_key langfuse_public_key langfuse_secret_key searxng_secret tikhub_api_key neo4j_auth; do
    printf '%s\n' 'staging-static-placeholder' > "$secret_dir/$name"
    chmod 600 "$secret_dir/$name"
done
workspace_id='00000000-0000-4000-8000-000000000001'
printf '%s\n' "$workspace_id" > "$runtime_dir/openrouter-workspace-id"
chmod 600 "$runtime_dir/openrouter-workspace-id"

revision='0123456789abcdef0123456789abcdef01234567'
cat > "$runtime_dir/staging.public.env" <<EOF
WEKNORA_STAGING_RELEASE_ID=weknora-v072-staging
WEKNORA_STAGING_REVISION=$revision
WEKNORA_STAGING_APP_IMAGE=ghcr.io/estromeglovettgen-coder/musuw-app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
WEKNORA_STAGING_FRONTEND_IMAGE=ghcr.io/estromeglovettgen-coder/musuw-frontend@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
WEKNORA_STAGING_FRONTEND_PORT=4192
WEKNORA_STAGING_APP_PORT=18092
WEKNORA_STAGING_POSTGRES_VOLUME=weknora-v072-staging-postgres-data
WEKNORA_STAGING_FILES_VOLUME=weknora-v072-staging-data-files
WEKNORA_STAGING_DOCREADER_TMP_VOLUME=weknora-v072-staging-docreader-tmp
WEKNORA_STAGING_REDIS_VOLUME=weknora-v072-staging-redis-data
WEKNORA_STAGING_SEARXNG_CONFIG_VOLUME=weknora-v072-staging-searxng-config
MUSUW_STAGING_SECRET_DIR=$secret_dir
MUSUW_STAGING_R2_ENDPOINT=https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com
MUSUW_STAGING_R2_BUCKET=musuw-staging
DB_DRIVER=postgres
DB_HOST=postgres
DB_PORT=5432
DB_USER=weknora_staging
DB_NAME=WeKnoraStaging
REDIS_ADDR=redis:6379
STREAM_MANAGER_TYPE=redis
REDIS_DB=0
REDIS_PREFIX=stream:
WEKNORA_REDIS_NAMESPACE=weknora-v072-staging
NEO4J_ENABLE=true
STORAGE_TYPE=s3
LOCAL_STORAGE_BASE_DIR=/data/files
MAX_FILE_SIZE_MB=50
GIN_MODE=release
LOG_LEVEL=info
TZ=Asia/Shanghai
AUTO_MIGRATE=true
AUTO_RECOVER_DIRTY=true
DISABLE_REGISTRATION=false
WEKNORA_AUTH_DEFAULT_TENANT_MODE=create_personal
MUSUW_PRODUCT_EDITION=lite
APP_EXTERNAL_URL=https://staging.musuw.com
FRONTEND_BASE_URL=https://staging.musuw.com
OIDC_AUTH_ENABLE=true
OIDC_AUTH_ISSUER_URL=https://identity-staging.example/auth/v1
OIDC_AUTH_DISCOVERY_URL=https://identity-staging.example/auth/v1/.well-known/openid-configuration
OIDC_AUTH_PROVIDER_DISPLAY_NAME=Musuw
OIDC_AUTH_SCOPES=openid profile email
OIDC_USER_INFO_MAPPING_USER_NAME=name
OIDC_USER_INFO_MAPPING_EMAIL=email
MUSUW_PADDLE_ENVIRONMENT=sandbox
MUSUW_PADDLE_API_URL=https://sandbox-api.paddle.com
MUSUW_PADDLE_CLIENT_TOKEN=test_static-client-token
MUSUW_PADDLE_PLUS_MONTHLY_PRICE_ID=pri_static_plus_monthly
MUSUW_PADDLE_PLUS_YEARLY_PRICE_ID=pri_static_plus_yearly
MUSUW_PADDLE_PRO_MONTHLY_PRICE_ID=pri_static_pro_monthly
MUSUW_PADDLE_PRO_YEARLY_PRICE_ID=pri_static_pro_yearly
MUSUW_PADDLE_MAX_MONTHLY_PRICE_ID=pri_static_max_monthly
MUSUW_PADDLE_MAX_YEARLY_PRICE_ID=pri_static_max_yearly
OPENROUTER_WORKSPACE_ID=$workspace_id
LANGFUSE_ENABLED=true
LANGFUSE_HOST=https://jp.cloud.langfuse.com
LANGFUSE_RELEASE=musuw-staging
LANGFUSE_ENVIRONMENT=staging
EOF
cat > "$runtime_dir/auth-public.env" <<'EOF'
MUSUW_AUTH_PUBLIC_ORIGIN=https://staging.musuw.com
MUSUW_SUPABASE_URL=https://achfnnicetupvtoqiwqd.supabase.co
MUSUW_SUPABASE_PUBLISHABLE_KEY=static-sandbox-publishable-key
MUSUW_WEKNORA_OAUTH_CLIENT_ID=static-staging-oidc-client
EOF

replace_env_value() {
    local path="$1" key="$2" value="$3" tmp
    tmp="$path.tmp"
    awk -v key="$key" -v value="$value" 'index($0, key "=") == 1 { print key "=" value; next } { print }' "$path" > "$tmp"
    chmod 600 "$tmp"
    mv -f "$tmp" "$path"
}

expect_prepare_rejects() {
    local label="$1"
    if WEKNORA_STAGING_RUNTIME_DIR="$runtime_dir" MUSUW_STAGING_SECRET_DIR="$secret_dir" \
        WEKNORA_STAGING_PUBLIC_ENV="$runtime_dir/staging.public.env" \
        WEKNORA_STAGING_AUTH_PUBLIC_ENV="$runtime_dir/auth-public.env" \
        "$script_dir/prepare-runtime.sh" >/dev/null 2>&1; then
        fail "staging runtime accepted $label"
    fi
}

replace_env_value "$runtime_dir/staging.public.env" MUSUW_STAGING_R2_BUCKET musuw-production
expect_prepare_rejects 'the production R2 bucket'
replace_env_value "$runtime_dir/staging.public.env" MUSUW_STAGING_R2_BUCKET musuw-staging

replace_env_value "$runtime_dir/staging.public.env" MUSUW_PRODUCT_EDITION standard
expect_prepare_rejects 'the Standard product edition'
replace_env_value "$runtime_dir/staging.public.env" MUSUW_PRODUCT_EDITION lite

replace_env_value "$runtime_dir/staging.public.env" LANGFUSE_ENABLED false
expect_prepare_rejects 'disabled Langfuse tracing'
replace_env_value "$runtime_dir/staging.public.env" LANGFUSE_ENABLED true

replace_env_value "$runtime_dir/auth-public.env" MUSUW_SUPABASE_URL https://production-identity.example
replace_env_value "$runtime_dir/staging.public.env" OIDC_AUTH_ISSUER_URL https://production-identity.example/auth/v1
replace_env_value "$runtime_dir/staging.public.env" OIDC_AUTH_DISCOVERY_URL https://production-identity.example/auth/v1/.well-known/openid-configuration
expect_prepare_rejects 'a non-staging Supabase project'
replace_env_value "$runtime_dir/auth-public.env" MUSUW_SUPABASE_URL https://achfnnicetupvtoqiwqd.supabase.co
replace_env_value "$runtime_dir/staging.public.env" OIDC_AUTH_ISSUER_URL https://achfnnicetupvtoqiwqd.supabase.co/auth/v1
replace_env_value "$runtime_dir/staging.public.env" OIDC_AUTH_DISCOVERY_URL https://achfnnicetupvtoqiwqd.supabase.co/auth/v1/.well-known/openid-configuration

printf '%s\n' '00000000-0000-4000-8000-000000000002' > "$runtime_dir/openrouter-workspace-id"
expect_prepare_rejects 'an OpenRouter workspace different from the server pin'
printf '%s\n' "$workspace_id" > "$runtime_dir/openrouter-workspace-id"

WEKNORA_STAGING_RUNTIME_DIR="$runtime_dir" MUSUW_STAGING_SECRET_DIR="$secret_dir" \
WEKNORA_STAGING_PUBLIC_ENV="$runtime_dir/staging.public.env" \
WEKNORA_STAGING_AUTH_PUBLIC_ENV="$runtime_dir/auth-public.env" \
    "$script_dir/prepare-runtime.sh" >/dev/null
weknora_staging_require_unique_env_keys "$runtime_dir/staging.env" || fail 'generated staging environment contains duplicate keys'
grep -Fqx 'MUSUW_PRODUCT_EDITION=lite' "$runtime_dir/staging.env" || fail 'generated staging environment is not explicitly Lite'

config_json="$runtime_dir/compose.json"
edge_config_json="$runtime_dir/compose-edge.json"
WEKNORA_STAGING_RUNTIME_DIR="$runtime_dir" MUSUW_STAGING_SECRET_DIR="$secret_dir" \
    "$script_dir/compose.sh" config --format json > "$config_json"
WEKNORA_STAGING_RUNTIME_DIR="$runtime_dir" MUSUW_STAGING_SECRET_DIR="$secret_dir" \
    "$script_dir/compose.sh" --edge config --format json > "$edge_config_json"

conflicting_config_json="$runtime_dir/compose-conflicting-shell.json"
OIDC_AUTH_ISSUER_URL=https://production-identity.example/auth/v1 \
OIDC_AUTH_DISCOVERY_URL=https://production-identity.example/auth/v1/.well-known/openid-configuration \
OIDC_AUTH_AUTHORIZATION_ENDPOINT=https://production-identity.example/auth/v1/oauth/authorize \
OIDC_AUTH_TOKEN_ENDPOINT=https://production-identity.example/auth/v1/oauth/token \
OIDC_AUTH_USER_INFO_ENDPOINT=https://production-identity.example/auth/v1/oauth/userinfo \
WEKNORA_STAGING_RUNTIME_DIR="$runtime_dir" MUSUW_STAGING_SECRET_DIR="$secret_dir" \
    "$script_dir/compose.sh" config --format json > "$conflicting_config_json"
jq -e '
    .services.app.environment.OIDC_AUTH_ISSUER_URL == "https://achfnnicetupvtoqiwqd.supabase.co/auth/v1" and
    .services.app.environment.OIDC_AUTH_DISCOVERY_URL == "https://achfnnicetupvtoqiwqd.supabase.co/auth/v1/.well-known/openid-configuration" and
    .services.app.environment.OIDC_AUTH_AUTHORIZATION_ENDPOINT == "https://achfnnicetupvtoqiwqd.supabase.co/auth/v1/oauth/authorize" and
    .services.app.environment.OIDC_AUTH_TOKEN_ENDPOINT == "https://achfnnicetupvtoqiwqd.supabase.co/auth/v1/oauth/token" and
    .services.app.environment.OIDC_AUTH_USER_INFO_ENDPOINT == "https://achfnnicetupvtoqiwqd.supabase.co/auth/v1/oauth/userinfo"
' "$conflicting_config_json" >/dev/null || fail 'staging Compose accepted inherited OIDC endpoint drift'

jq -e '
    ([.services | keys[]] | sort) == ["app", "docreader", "frontend", "neo4j", "postgres", "redis", "searxng", "searxng-init"] and
    ([.services[] | select(has("build"))] | length) == 0 and
    (.services.frontend.image | test("^ghcr\\.io/estromeglovettgen-coder/musuw-frontend@sha256:[0-9a-f]{64}$")) and
    (.services.app.image | test("^ghcr\\.io/estromeglovettgen-coder/musuw-app@sha256:[0-9a-f]{64}$")) and
    .services.frontend.ports[0].host_ip == "127.0.0.1" and .services.frontend.ports[0].published == "4192" and
    .services.app.ports[0].host_ip == "127.0.0.1" and .services.app.ports[0].published == "18092" and
    .services.app.environment.MUSUW_DEPLOYMENT_ENVIRONMENT == "staging" and
    .services.app.environment.LOG_PATH == "/var/log/weknora/app.log" and
    .volumes["app-logs"].name == "weknora-v072-staging-app-logs" and
    ([.services.app.volumes[] | select(.source == "app-logs" and .target == "/var/log/weknora" and .type == "volume" and .read_only != true)] | length) == 1 and
    ([.services.frontend.volumes[]? | select(.source == "app-logs")] | length) == 0 and
    .services.app.environment.MUSUW_PADDLE_ENVIRONMENT == "sandbox" and
    .services.app.environment.MUSUW_PADDLE_API_URL == "https://sandbox-api.paddle.com" and
    .services.app.environment.LANGFUSE_ENABLED == "true" and
    .services.app.environment.LANGFUSE_HOST == "https://jp.cloud.langfuse.com" and
    .services.app.environment.LANGFUSE_RELEASE == "musuw-staging" and
    .services.app.environment.LANGFUSE_ENVIRONMENT == "staging" and
    .services.app.environment.OPENROUTER_WORKSPACE_ID == "00000000-0000-4000-8000-000000000001" and
    .services.app.environment.S3_BUCKET_NAME == "musuw-staging" and
    .services.app.environment.NEO4J_ENABLE == "true" and
    .services.app.environment.NEO4J_URI == "bolt://neo4j:7687" and
    .services.app.depends_on.neo4j.condition == "service_healthy" and
    ([.services.app.secrets[] | select(.source == "neo4j_auth")] | length) == 1 and
    .services.neo4j.container_name == "weknora-v072-staging-neo4j" and
    (.services.neo4j.ports | length == 0) and (.services.neo4j.profiles | length == 0) and
    (.services.neo4j.mem_limit | tonumber) == 805306368 and .services.neo4j.pids_limit == 256 and
    .services.neo4j.environment.NEO4J_server_memory_heap_max__size == "256m" and
    .services.neo4j.environment.NEO4J_server_memory_pagecache_size == "128m" and
    (.services.neo4j.healthcheck.test | join(" ") | contains("7474")) and
    .volumes["neo4j-data"].name == "weknora-v072-staging-neo4j-data" and
    .secrets.neo4j_auth.file == "'"$secret_dir"'/neo4j_auth" and
    .services.app.environment.WEKNORA_REDIS_NAMESPACE == "weknora-v072-staging" and
    .services.app.environment.APP_EXTERNAL_URL == "https://staging.musuw.com" and
    .services.app.environment.OIDC_AUTH_AUTHORIZATION_ENDPOINT == "https://achfnnicetupvtoqiwqd.supabase.co/auth/v1/oauth/authorize" and
    .services.app.environment.OIDC_AUTH_TOKEN_ENDPOINT == "https://achfnnicetupvtoqiwqd.supabase.co/auth/v1/oauth/token" and
    .services.app.environment.OIDC_AUTH_USER_INFO_ENDPOINT == "https://achfnnicetupvtoqiwqd.supabase.co/auth/v1/oauth/userinfo" and
    .services.frontend.environment.MUSUW_AUTH_PUBLIC_ORIGIN == "https://staging.musuw.com" and
    (.services.searxng.image == "searxng/searxng@sha256:11a9b34cdc0b1ec2b991470a2762ecb5a1a531898289fb51dcd015260450729e") and
    (.services["searxng-init"].image == "busybox@sha256:73aaf090f3d85aa34ee199857f03fa3a95c8ede2ffd4cc2cdb5b94e566b11662") and
    (.services.searxng.ports | length == 0) and
    (.services.searxng.profiles | length == 0) and (.services["searxng-init"].profiles | length == 0) and
    ([.services[] | select((.cpus // "") != "" and (.mem_limit // "") != "" and (.pids_limit // "") != "")] | length) == 8 and
    ([.services[].cpus | tonumber] | add) <= 1.75 and
    ([.services[].mem_limit | tonumber] | add) <= 2717908992 and
    ([.services.app.secrets[] | select(.source == "langfuse_public_key" and .target == "langfuse_public_key")] | length) == 1 and
    ([.services.app.secrets[] | select(.source == "langfuse_secret_key" and .target == "langfuse_secret_key")] | length) == 1
' "$config_json" >/dev/null || fail 'staging Compose topology/resource contract failed'

jq -e '
    .networks.edge.external == true and .networks.edge.name == "musnow-production_edge" and
    (.services.frontend.networks.edge.aliases | index("staging-web")) and
    (.networks["WeKnora-network"].name == "weknora-v072-staging-internal") and
    ([.volumes[].name] | all(test("^weknora-v072-staging-"))) and
    ([.secrets[].file] | all(startswith("'"$secret_dir"'"))) and
    (.secrets.langfuse_public_key.file == "'"$secret_dir"'/langfuse_public_key") and
    (.secrets.langfuse_secret_key.file == "'"$secret_dir"'/langfuse_secret_key")
' "$edge_config_json" >/dev/null || fail 'staging edge/data/secret isolation contract failed'

# Verify that the fixture itself cannot be expanded into an app credential
# environment and that generated browser config names remain public-only.
if grep -Eq '^(DB_PASSWORD|MUSUW_PADDLE_API_KEY|MUSUW_PADDLE_WEBHOOK_SECRET|OPENROUTER_MANAGEMENT_API_KEY|TIKHUB_API_KEY)=' "$runtime_dir/staging.env"; then
    fail 'staging runtime env contains a server credential value'
fi
if grep -Eq '^VITE_' "$runtime_dir/auth-public.env"; then
    fail 'staging auth public env retains build-time VITE aliases'
fi

printf '%s\n' 'staging static contract green: seven-service native stack plus init, SearXNG health/search contract, isolated resources, Sandbox selector, immutable images, edge alias, metadata-only secrets'
