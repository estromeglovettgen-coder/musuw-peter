#!/usr/bin/env bash
# Static-only contract for the production overlay.  It renders Compose but
# never builds images, creates Docker resources, or contacts a remote host.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
overlay="$repo_root/integration/weknora-production/compose.yaml"
edge_overlay="$repo_root/integration/weknora-production/compose.edge.yaml"
compose_helper="$repo_root/scripts/weknora-production/compose.sh"
builtin_models_config="$repo_root/weknora/config/builtin_models.yaml"
production_env_example="$repo_root/integration/weknora-production/production.env.example"
paddle_runtime_contract="$repo_root/integration/weknora-production/paddle-runtime-contract.sh"

for required in \
    "$overlay" \
    "$edge_overlay" \
    "$compose_helper" \
    "$builtin_models_config" \
    "$production_env_example" \
    "$paddle_runtime_contract" \
    "$repo_root/integration/weknora-production/app-entrypoint.sh" \
    "$repo_root/integration/weknora-production/redis-entrypoint.sh" \
    "$repo_root/integration/weknora-production/neo4j-entrypoint.sh" \
    "$repo_root/scripts/weknora/paddle-ip-allowlist.sh"; do
    if [ ! -f "$required" ]; then
        printf '%s\n' 'production overlay is incomplete' >&2
        exit 1
    fi
done

bash -n "$repo_root/scripts/weknora/paddle-ip-allowlist.sh"

grep -Fqx 'MUSUW_PADDLE_ENVIRONMENT=live' "$production_env_example" || {
    printf '%s\n' 'checked production example must select Paddle Live' >&2
    exit 1
}
case "$(awk -F= '$1 == "MUSUW_PADDLE_CLIENT_TOKEN" { print substr($0, index($0, "=") + 1); exit }' "$production_env_example")" in
    live_*) ;;
    *)
        printf '%s\n' 'checked production example must use a Paddle Live client token' >&2
        exit 1
        ;;
esac

sh -n "$paddle_runtime_contract"
# shellcheck source=../../integration/weknora-production/paddle-runtime-contract.sh
. "$paddle_runtime_contract"
paddle_prices=(
    pri_static_plus_monthly
    pri_static_plus_yearly
    pri_static_pro_monthly
    pri_static_pro_yearly
    pri_static_max_monthly
    pri_static_max_yearly
)
musuw_paddle_validate_configuration \
    sandbox test_static-client-token pdl_sdbx_apikey_static-verification \
    pdl_ntfset_static-verification "${paddle_prices[@]}"
musuw_paddle_validate_configuration \
    live live_static-client-token pdl_live_apikey_static-verification \
    pdl_ntfset_static-verification "${paddle_prices[@]}"
musuw_paddle_validate_production_launch \
    live live_static-client-token pdl_live_apikey_static-verification \
    pdl_ntfset_static-verification "${paddle_prices[@]}"
if musuw_paddle_validate_production_launch \
    sandbox test_static-client-token pdl_sdbx_apikey_static-verification \
    pdl_ntfset_static-verification "${paddle_prices[@]}" >/dev/null 2>&1; then
    printf '%s\n' 'fixed production launch accepted Paddle Sandbox after Live authorization' >&2
    exit 1
fi

if musuw_paddle_validate_configuration \
    sandbox live_static-client-token pdl_sdbx_apikey_static-verification \
    pdl_ntfset_static-verification "${paddle_prices[@]}" >/dev/null 2>&1; then
    printf '%s\n' 'Paddle contract accepted a Live client token in Sandbox' >&2
    exit 1
fi
if musuw_paddle_validate_configuration \
    sandbox test_static-client-token pdl_live_apikey_static-verification \
    pdl_ntfset_static-verification "${paddle_prices[@]}" >/dev/null 2>&1; then
    printf '%s\n' 'Paddle contract accepted a Live API key in Sandbox' >&2
    exit 1
fi
if musuw_paddle_validate_configuration \
    live test_static-client-token pdl_live_apikey_static-verification \
    pdl_ntfset_static-verification "${paddle_prices[@]}" >/dev/null 2>&1; then
    printf '%s\n' 'Paddle contract accepted a Sandbox client token in Live' >&2
    exit 1
fi
if musuw_paddle_validate_configuration \
    live live_static-client-token pdl_sdbx_apikey_static-verification \
    pdl_ntfset_static-verification "${paddle_prices[@]}" >/dev/null 2>&1; then
    printf '%s\n' 'Paddle contract accepted a Sandbox API key in Live' >&2
    exit 1
fi
if musuw_paddle_validate_configuration \
    sandbox test_static-client-token pdl_sdbx_apikey_static-verification \
    invalid-webhook-secret "${paddle_prices[@]}" >/dev/null 2>&1; then
    printf '%s\n' 'Paddle contract accepted an invalid notification secret' >&2
    exit 1
fi
if musuw_paddle_validate_configuration \
    sandbox test_static-client-token pdl_sdbx_apikey_static-verification \
    pdl_ntfset_static-verification \
    "${paddle_prices[0]}" "${paddle_prices[1]}" "${paddle_prices[2]}" \
    "${paddle_prices[3]}" "${paddle_prices[4]}" '' >/dev/null 2>&1; then
    printf '%s\n' 'Paddle contract accepted a missing price mapping' >&2
    exit 1
fi
if musuw_paddle_validate_configuration \
    sandbox test_static-client-token pdl_sdbx_apikey_static-verification \
    pdl_ntfset_static-verification \
    "${paddle_prices[0]}" "${paddle_prices[1]}" "${paddle_prices[2]}" \
    "${paddle_prices[3]}" "${paddle_prices[4]}" "${paddle_prices[4]}" >/dev/null 2>&1; then
    printf '%s\n' 'Paddle contract accepted duplicate price mappings' >&2
    exit 1
fi
unset paddle_prices

for tool in docker jq; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        printf '%s\n' 'production static verification requires docker and jq' >&2
        exit 1
    fi
done

for model_id in \
    builtin-deepseek-v4-pro \
    builtin-deepseek-v4-flash \
    builtin-openrouter-qwen-max \
    builtin-openrouter-gpt-luna \
    builtin-openrouter-gpt-terra \
    builtin-openrouter-gpt-sol \
    builtin-openrouter-gemini-flash \
    builtin-openrouter-gemini-pro \
    builtin-openrouter-claude-haiku \
    builtin-openrouter-claude-sonnet \
    builtin-openrouter-claude-opus \
    builtin-openrouter-embedding \
    builtin-openrouter-rerank \
    builtin-openrouter-vlm \
    builtin-openrouter-asr; do
    grep -Fq "id: $model_id" "$builtin_models_config" || {
        printf '%s\n' 'production builtin model catalog is incomplete' >&2
        exit 1
    }
done

runtime_dir="$(mktemp -d)"
cleanup_runtime_dir() {
    [ -d "$runtime_dir" ] && find "$runtime_dir" -depth -delete 2>/dev/null || true
}
trap cleanup_runtime_dir EXIT
secret_dir="$runtime_dir/secrets"
mkdir -m 700 "$secret_dir"

# Deliberately synthetic values: this test proves file mounts and interpolation
# only. It never reads an operator credential or prints a secret value.
for name in db_password redis_password system_aes_key jwt_secret neo4j_auth oidc_client_id oidc_client_secret supabase_service_role_key searxng_secret openrouter_management_api_key tikhub_api_key paddle_api_key paddle_webhook_secret r2_access_key_id r2_secret_access_key langfuse_public_key langfuse_secret_key; do
    printf '%s\n' 'static-verification-placeholder' > "$secret_dir/$name"
    chmod 600 "$secret_dir/$name"
done
printf '%s\n' '0123456789abcdef0123456789abcdef' > "$secret_dir/system_aes_key"
printf '%s\n' 'neo4j/static-verification-password' > "$secret_dir/neo4j_auth"
printf '%s\n' 'static-native-oidc-client' > "$secret_dir/oidc_client_id"
printf '%s\n' 'pdl_live_apikey_static-verification' > "$secret_dir/paddle_api_key"
printf '%s\n' 'pdl_ntfset_static-verification' > "$secret_dir/paddle_webhook_secret"
printf '%s\n' 'pk-lf-static-verification' > "$secret_dir/langfuse_public_key"
printf '%s\n' 'sk-lf-static-verification' > "$secret_dir/langfuse_secret_key"

# Exercise prepare-runtime.sh using only synthetic, non-production values.
auth_public_env="$runtime_dir/auth-public.env"
printf '%s\n' \
    'VITE_AUTH_PUBLIC_ORIGIN=https://app.musuw.com' \
    'VITE_SUPABASE_URL=https://identity.example' \
    'VITE_SUPABASE_PUBLISHABLE_KEY=static-public-browser-key' \
    'VITE_WEKNORA_OAUTH_CLIENT_ID=static-native-oidc-client' > "$auth_public_env"

{
    printf '%s\n' \
        'WEKNORA_PRODUCTION_RELEASE_ID=weknora-v072-production' \
        'WEKNORA_PRODUCTION_APP_IMAGE=ghcr.io/estromeglovettgen-coder/musuw-app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' \
        'WEKNORA_PRODUCTION_FRONTEND_IMAGE=ghcr.io/estromeglovettgen-coder/musuw-frontend@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' \
        'WEKNORA_PRODUCTION_FRONTEND_PORT=4191' \
        'WEKNORA_PRODUCTION_APP_PORT=18091' \
        'WEKNORA_PRODUCTION_POSTGRES_VOLUME=weknora-v072-production-postgres-data' \
        'WEKNORA_PRODUCTION_FILES_VOLUME=weknora-v072-production-data-files' \
        'WEKNORA_PRODUCTION_DOCREADER_TMP_VOLUME=weknora-v072-production-docreader-tmp' \
        'WEKNORA_PRODUCTION_REDIS_VOLUME=weknora-v072-production-redis-data' \
        'WEKNORA_PRODUCTION_NEO4J_VOLUME=weknora-v072-production-neo4j-data' \
        'WEKNORA_PRODUCTION_SEARXNG_CONFIG_VOLUME=weknora-v072-production-searxng-config' \
        'WEKNORA_PRODUCTION_SEARXNG_PORT=8891' \
        'DB_DRIVER=postgres' \
        'DB_HOST=postgres' \
        'DB_PORT=5432' \
        'DB_USER=weknora' \
        'DB_NAME=WeKnora' \
        'REDIS_ADDR=redis:6379' \
        'STREAM_MANAGER_TYPE=redis' \
        'REDIS_DB=0' \
        'REDIS_PREFIX=stream:' \
        'WEKNORA_REDIS_NAMESPACE=weknora-v072-production' \
        'NEO4J_ENABLE=true' \
        'NEO4J_URI=bolt://neo4j:7687' \
        'NEO4J_USERNAME=neo4j' \
        'APP_EXTERNAL_URL=https://app.musuw.com' \
        'FRONTEND_BASE_URL=https://app.musuw.com' \
        'OIDC_AUTH_ENABLE=true' \
        'OIDC_AUTH_ISSUER_URL=https://identity.example/auth/v1' \
        'OIDC_AUTH_DISCOVERY_URL=https://identity.example/auth/v1/.well-known/openid-configuration' \
        'OIDC_AUTH_PROVIDER_DISPLAY_NAME=Musuw' \
        'OIDC_AUTH_SCOPES=openid profile email' \
        'OIDC_USER_INFO_MAPPING_USER_NAME=name' \
        'OIDC_USER_INFO_MAPPING_EMAIL=email' \
        'MUSUW_PADDLE_ENVIRONMENT=live' \
        'MUSUW_PADDLE_CLIENT_TOKEN=live_static-client-token' \
        'MUSUW_PADDLE_PLUS_MONTHLY_PRICE_ID=pri_static_plus_monthly' \
        'MUSUW_PADDLE_PLUS_YEARLY_PRICE_ID=pri_static_plus_yearly' \
        'MUSUW_PADDLE_PRO_MONTHLY_PRICE_ID=pri_static_pro_monthly' \
        'MUSUW_PADDLE_PRO_YEARLY_PRICE_ID=pri_static_pro_yearly' \
        'MUSUW_PADDLE_MAX_MONTHLY_PRICE_ID=pri_static_max_monthly' \
        'MUSUW_PADDLE_MAX_YEARLY_PRICE_ID=pri_static_max_yearly' \
        'LANGFUSE_ENABLED=true' \
        'LANGFUSE_HOST=https://jp.cloud.langfuse.com' \
        'LANGFUSE_RELEASE=musuw-production' \
        'LANGFUSE_ENVIRONMENT=production' \
        'AUTO_MIGRATE=true' \
        'DISABLE_REGISTRATION=false' \
        'GIN_MODE=release' \
        'TZ=Asia/Shanghai'
} > "$runtime_dir/production.public.env"

WEKNORA_PRODUCTION_RUNTIME_DIR="$runtime_dir" "$repo_root/scripts/weknora-production/prepare-runtime.sh" >/dev/null
for expected_runtime_public in \
    'MUSUW_DEPLOYMENT_ENVIRONMENT=production' \
    'MUSUW_AUTH_PUBLIC_ORIGIN=https://app.musuw.com' \
    'MUSUW_SUPABASE_URL=https://identity.example' \
    'MUSUW_SUPABASE_PUBLISHABLE_KEY=static-public-browser-key' \
    'MUSUW_WEKNORA_OAUTH_CLIENT_ID=static-native-oidc-client'; do
    grep -Fqx "$expected_runtime_public" "$runtime_dir/production.env" || {
        printf '%s\n' 'production runtime did not derive the complete browser startup configuration' >&2
        exit 1
    }
done
if grep -Eq '^(DB_PASSWORD|REDIS_PASSWORD|SYSTEM_AES_KEY|JWT_SECRET|NEO4J_AUTH|OIDC_AUTH_CLIENT_SECRET|SEARXNG_SECRET|OPENROUTER_MANAGEMENT_API_KEY|TIKHUB_API_KEY|MUSUW_PADDLE_API_KEY|MUSUW_PADDLE_WEBHOOK_SECRET|LANGFUSE_PUBLIC_KEY|LANGFUSE_SECRET_KEY)=' "$runtime_dir/production.env"; then
    printf '%s\n' 'production runtime env contains a credential value instead of only a file path' >&2
    exit 1
fi

# The fixed launch accepts only a complete Live environment. Mixing the Live
# public unit with a Sandbox server key must fail before runtime generation.
printf '%s\n' 'pdl_sdbx_apikey_static-verification' > "$secret_dir/paddle_api_key"
if WEKNORA_PRODUCTION_RUNTIME_DIR="$runtime_dir" \
   "$repo_root/scripts/weknora-production/prepare-runtime.sh" >/dev/null 2>&1; then
    printf '%s\n' 'production runtime accepted a Sandbox API key with Live public settings' >&2
    exit 1
fi
sandbox_public_env="$runtime_dir/sandbox-production.public.env"
awk '
    /^MUSUW_PADDLE_ENVIRONMENT=/ { print "MUSUW_PADDLE_ENVIRONMENT=sandbox"; next }
    /^MUSUW_PADDLE_CLIENT_TOKEN=/ { print "MUSUW_PADDLE_CLIENT_TOKEN=test_static-client-token"; next }
    { print }
' "$runtime_dir/production.public.env" > "$sandbox_public_env"
printf '%s\n' 'pdl_sdbx_apikey_static-verification' > "$secret_dir/paddle_api_key"
WEKNORA_PRODUCTION_RUNTIME_DIR="$runtime_dir" \
WEKNORA_PRODUCTION_PUBLIC_ENV="$sandbox_public_env" \
    "$repo_root/scripts/weknora-production/prepare-runtime.sh" >/dev/null 2>&1 && {
    printf '%s\n' 'fixed production preflight accepted a complete Sandbox environment after Live authorization' >&2
    exit 1
}
printf '%s\n' 'pdl_live_apikey_static-verification' > "$secret_dir/paddle_api_key"
if WEKNORA_PRODUCTION_RUNTIME_DIR="$runtime_dir" \
   WEKNORA_PRODUCTION_PUBLIC_ENV="$sandbox_public_env" \
   "$repo_root/scripts/weknora-production/prepare-runtime.sh" >/dev/null 2>&1; then
    printf '%s\n' 'production runtime accepted a Live API key with Sandbox public settings' >&2
    exit 1
fi
WEKNORA_PRODUCTION_RUNTIME_DIR="$runtime_dir" "$repo_root/scripts/weknora-production/prepare-runtime.sh" >/dev/null

# Duplicate keys are rejected before fixed-value validation.  This prevents an
# early parser from reading one value while Compose consumes the later value.
duplicate_public_env="$runtime_dir/duplicate-production.public.env"
cp "$runtime_dir/production.public.env" "$duplicate_public_env"
printf '%s\n' 'APP_EXTERNAL_URL=https://evil.example' >> "$duplicate_public_env"
if WEKNORA_PRODUCTION_RUNTIME_DIR="$runtime_dir" \
   WEKNORA_PRODUCTION_PUBLIC_ENV="$duplicate_public_env" \
   "$repo_root/scripts/weknora-production/prepare-runtime.sh" >/dev/null 2>&1; then
    printf '%s\n' 'production runtime accepted duplicate public environment keys' >&2
    exit 1
fi

# The public input cannot supply an arbitrary SSRF allow-list; prepare-runtime
# must derive that one from the public Supabase authority.
printf '%s\n' 'SSRF_WHITELIST_EXTRA=untrusted.example' >> "$runtime_dir/production.public.env"
if WEKNORA_PRODUCTION_RUNTIME_DIR="$runtime_dir" "$repo_root/scripts/weknora-production/prepare-runtime.sh" >/dev/null 2>&1; then
    printf '%s\n' 'production runtime accepted an operator-supplied SSRF allow-list' >&2
    exit 1
fi

config_json="$runtime_dir/compose.json"
edge_config_json="$runtime_dir/compose-edge.json"

DB_PASSWORD=static-verification-placeholder REDIS_PASSWORD=static-verification-placeholder WEKNORA_PRODUCTION_RUNTIME_DIR="$runtime_dir" "$compose_helper" config --quiet
DB_PASSWORD=static-verification-placeholder REDIS_PASSWORD=static-verification-placeholder WEKNORA_PRODUCTION_RUNTIME_DIR="$runtime_dir" "$compose_helper" config --format json > "$config_json"
DB_PASSWORD=static-verification-placeholder REDIS_PASSWORD=static-verification-placeholder WEKNORA_PRODUCTION_RUNTIME_DIR="$runtime_dir" "$compose_helper" --edge config --quiet
DB_PASSWORD=static-verification-placeholder REDIS_PASSWORD=static-verification-placeholder WEKNORA_PRODUCTION_RUNTIME_DIR="$runtime_dir" "$compose_helper" --edge config --format json > "$edge_config_json"

conflicting_config_json="$runtime_dir/compose-conflicting-shell.json"
OIDC_AUTH_ISSUER_URL=https://staging-identity.example/auth/v1 \
OIDC_AUTH_DISCOVERY_URL=https://staging-identity.example/auth/v1/.well-known/openid-configuration \
OIDC_AUTH_AUTHORIZATION_ENDPOINT=https://staging-identity.example/auth/v1/oauth/authorize \
OIDC_AUTH_TOKEN_ENDPOINT=https://staging-identity.example/auth/v1/oauth/token \
OIDC_AUTH_USER_INFO_ENDPOINT=https://staging-identity.example/auth/v1/oauth/userinfo \
DB_PASSWORD=static-verification-placeholder REDIS_PASSWORD=static-verification-placeholder \
WEKNORA_PRODUCTION_RUNTIME_DIR="$runtime_dir" \
    "$compose_helper" config --format json > "$conflicting_config_json"
jq -e '
  .services.app.environment.OIDC_AUTH_ISSUER_URL == "https://identity.example/auth/v1" and
  .services.app.environment.OIDC_AUTH_DISCOVERY_URL == "https://identity.example/auth/v1/.well-known/openid-configuration" and
  .services.app.environment.OIDC_AUTH_AUTHORIZATION_ENDPOINT == "https://identity.example/auth/v1/oauth/authorize" and
  .services.app.environment.OIDC_AUTH_TOKEN_ENDPOINT == "https://identity.example/auth/v1/oauth/token" and
  .services.app.environment.OIDC_AUTH_USER_INFO_ENDPOINT == "https://identity.example/auth/v1/oauth/userinfo"
' "$conflicting_config_json" >/dev/null || {
    printf '%s\n' 'production Compose accepted inherited OIDC endpoint drift' >&2
    exit 1
}

for service in frontend app docreader postgres redis neo4j searxng-init searxng; do
    jq -e --arg service "$service" '.services[$service].platform == "linux/amd64"' "$config_json" >/dev/null || {
        printf '%s\n' 'production service is not pinned to linux/amd64' >&2
        exit 1
    }
done

jq -e '
  (.services.frontend.ports | length == 1) and
  (.services.frontend.image | test("^ghcr\\.io/estromeglovettgen-coder/musuw-frontend@sha256:[0-9a-f]{64}$")) and
  (.services.app.image | test("^ghcr\\.io/estromeglovettgen-coder/musuw-app@sha256:[0-9a-f]{64}$")) and
  ((.services.frontend | has("build")) | not) and
  ((.services.app | has("build")) | not) and
  (.services.frontend.ports[0].host_ip == "127.0.0.1") and
  (.services.frontend.ports[0].published == "4191") and
  (.services.frontend.ports[0].target == 8080) and
  (.services.frontend.environment.APP_HOST == "weknora-v072-production-app") and
  (.services.frontend.environment.MUSUW_DEPLOYMENT_ENVIRONMENT == "production") and
  (.services.frontend.environment.MUSUW_AUTH_PUBLIC_ORIGIN == "https://app.musuw.com") and
  (.services.frontend.environment.MUSUW_SUPABASE_URL == "https://identity.example") and
  (.services.frontend.environment.MUSUW_SUPABASE_PUBLISHABLE_KEY == "static-public-browser-key") and
  (.services.frontend.environment.MUSUW_WEKNORA_OAUTH_CLIENT_ID == "static-native-oidc-client") and
  ((.services.frontend.networks | has("edge")) | not) and
  (.services.app.environment.APP_EXTERNAL_URL == "https://app.musuw.com") and
  (.services.app.environment.FRONTEND_BASE_URL == "https://app.musuw.com") and
  (.services.app.environment.LOG_PATH == "/var/log/weknora/app.log") and
  (.volumes["app-logs"].name == "weknora-v072-production-app-logs") and
  ([.services.app.volumes[] | select(.source == "app-logs" and .target == "/var/log/weknora" and .type == "volume" and .read_only != true)] | length == 1) and
  ([.services.frontend.volumes[]? | select(.source == "app-logs")] | length == 0) and
  (.services.app.environment.OIDC_AUTH_AUTHORIZATION_ENDPOINT == "https://identity.example/auth/v1/oauth/authorize") and
  (.services.app.environment.OIDC_AUTH_TOKEN_ENDPOINT == "https://identity.example/auth/v1/oauth/token") and
  (.services.app.environment.OIDC_AUTH_USER_INFO_ENDPOINT == "https://identity.example/auth/v1/oauth/userinfo") and
  (.services.app.environment.RETRIEVE_DRIVER == "postgres") and
  (.services.app.environment.STREAM_MANAGER_TYPE == "redis") and
  (.services.app.environment.WEKNORA_REDIS_NAMESPACE == "weknora-v072-production") and
  (.services.app.environment.WEKNORA_HOUSEKEEPING_ENABLED == "true") and
  (.services.app.environment.MUSUW_PADDLE_ENVIRONMENT == "live") and
  (.services.app.environment.MUSUW_PADDLE_CLIENT_TOKEN == "live_static-client-token") and
  (.services.app.environment.MUSUW_PADDLE_PLUS_MONTHLY_PRICE_ID == "pri_static_plus_monthly") and
  (.services.app.environment.MUSUW_PADDLE_PLUS_YEARLY_PRICE_ID == "pri_static_plus_yearly") and
  (.services.app.environment.MUSUW_PADDLE_PRO_MONTHLY_PRICE_ID == "pri_static_pro_monthly") and
  (.services.app.environment.MUSUW_PADDLE_PRO_YEARLY_PRICE_ID == "pri_static_pro_yearly") and
  (.services.app.environment.MUSUW_PADDLE_MAX_MONTHLY_PRICE_ID == "pri_static_max_monthly") and
  (.services.app.environment.MUSUW_PADDLE_MAX_YEARLY_PRICE_ID == "pri_static_max_yearly") and
  ([.services.app.volumes[] | select(
    .target == "/opt/weknora-production/paddle-runtime-contract.sh" and
    .read_only == true
  )] | length == 1) and
  (.services.app.environment.LANGFUSE_ENABLED == "true") and
  (.services.app.environment.LANGFUSE_HOST == "https://jp.cloud.langfuse.com") and
  (.services.app.environment.LANGFUSE_RELEASE == "musuw-production") and
  (.services.app.environment.LANGFUSE_ENVIRONMENT == "production") and
  (.services.app.environment.STORAGE_TYPE == "s3") and
  (.services.app.environment.S3_ENDPOINT == "https://c692db4757e1454b71880ec6c431db9c.r2.cloudflarestorage.com") and
  (.services.app.environment.S3_REGION == "auto") and
  (.services.app.environment.S3_BUCKET_NAME == "musuw-production") and
  (.services.app.environment.S3_PATH_PREFIX == "weknora") and
  (.services.app.environment.S3_FORCE_PATH_STYLE == "true") and
  (.services.app.environment.SSRF_WHITELIST_EXTRA == "searxng,qdrant,milvus,weaviate,doris-fe,doris-be,identity.example") and
  (.services.searxng.ports | length == 1) and
  (.services.searxng.ports[0].host_ip == "127.0.0.1") and
  (.services.searxng.ports[0].published == "8891") and
  (.services.searxng.ports[0].target == 8080)
' "$config_json" >/dev/null || {
    printf '%s\n' 'production base topology does not keep the new frontend staged and same-origin' >&2
    exit 1
}

jq -e '
  .networks.edge.external == true and
  .networks.edge.name == "musnow-production_edge" and
  (.services.frontend.networks.edge.aliases | index("web"))
' "$edge_config_json" >/dev/null || {
    printf '%s\n' 'production edge overlay does not reserve the existing web alias' >&2
    exit 1
}

for secret in db_password redis_password system_aes_key jwt_secret neo4j_auth oidc_client_id oidc_client_secret supabase_service_role_key searxng_secret openrouter_management_api_key tikhub_api_key paddle_api_key paddle_webhook_secret r2_access_key_id r2_secret_access_key langfuse_public_key langfuse_secret_key; do
    jq -e --arg secret "$secret" '.secrets[$secret].file | type == "string"' "$config_json" >/dev/null || {
        printf '%s\n' 'production Compose does not use a file-backed required secret' >&2
        exit 1
    }
done

for secret in supabase_service_role_key openrouter_management_api_key tikhub_api_key paddle_api_key paddle_webhook_secret r2_access_key_id r2_secret_access_key langfuse_public_key langfuse_secret_key; do
    jq -e --arg secret "$secret" \
        '[.services.app.secrets[]?.source] | index($secret) != null' "$config_json" >/dev/null || {
        printf '%s\n' 'production app does not mount a required platform model secret' >&2
        exit 1
    }
done

for export_name in MUSUW_SUPABASE_SERVICE_ROLE_KEY OPENROUTER_MANAGEMENT_API_KEY TIKHUB_API_KEY MUSUW_PADDLE_API_KEY MUSUW_PADDLE_WEBHOOK_SECRET LANGFUSE_PUBLIC_KEY LANGFUSE_SECRET_KEY; do
    grep -Fq "export ${export_name}=\"\$(read_required_secret" "$repo_root/integration/weknora-production/app-entrypoint.sh" || {
        printf '%s\n' 'production entrypoint does not export a required server-only platform secret' >&2
        exit 1
    }
done

if ! grep -Fq '. /opt/weknora-production/paddle-runtime-contract.sh' "$repo_root/integration/weknora-production/app-entrypoint.sh" ||
   ! grep -Fq 'musuw_paddle_validate_production_launch' "$repo_root/integration/weknora-production/app-entrypoint.sh"; then
    printf '%s\n' 'production app entrypoint does not enforce the shared Paddle environment contract' >&2
    exit 1
fi

nginx_template="$repo_root/integration/weknora-production/nginx.conf.template"
if ! grep -Fq 'listen 8080;' "$nginx_template" ||
   ! grep -Fq 'location /api/' "$nginx_template" ||
   ! grep -Fq 'location = /files' "$nginx_template" ||
   ! grep -Fq 'location ^~ /r/' "$nginx_template" ||
   ! grep -Fq 'location = /health' "$nginx_template"; then
    printf '%s\n' 'production frontend is not the native Nginx route surface on port 8080' >&2
    exit 1
fi

if grep -Eq '^COPY[[:space:]].*(legacy/|backend/|web/)' "$repo_root/integration/weknora-production/Dockerfile.frontend"; then
    printf '%s\n' 'production frontend Dockerfile contains a legacy business asset' >&2
    exit 1
fi

if ! grep -Fq 'COPY --from=builder /app/WeKnora ./WeKnora' "$repo_root/integration/weknora-production/Dockerfile.app.runtime" ||
   ! grep -Fq 'make build-prod' "$repo_root/integration/weknora-production/Dockerfile.app.runtime"; then
    printf '%s\n' 'production app Dockerfile does not build the full native source' >&2
    exit 1
fi

if ! grep -Fq 'COPY third_party/anydoc-go/go.mod third_party/anydoc-go/go.mod' "$repo_root/integration/weknora-production/Dockerfile.app.runtime" ||
   ! grep -Fq 'ARG WITH_ANYDOC=1' "$repo_root/integration/weknora-production/Dockerfile.app.runtime" ||
   ! grep -Fq './scripts/build-anydoc-lib.sh' "$repo_root/integration/weknora-production/Dockerfile.app.runtime" ||
   ! grep -Fq 'make build-prod GO_BUILD_TAGS=anydoc' "$repo_root/integration/weknora-production/Dockerfile.app.runtime"; then
    printf '%s\n' 'production app Dockerfile does not link the default AnyDoc engine' >&2
    exit 1
fi

if ! grep -Fq 'go mod download || go mod download || go mod download' "$repo_root/integration/weknora-production/Dockerfile.app.runtime"; then
    printf '%s\n' 'production app Dockerfile lacks bounded official Go module download retries' >&2
    exit 1
fi

runtime_dockerfile="$repo_root/integration/weknora-production/Dockerfile.app.runtime"
if ! grep -Fq "github.com/golang-migrate/migrate/v4/cmd/migrate@v4.19.1" "$runtime_dockerfile" ||
   grep -Fq "github.com/golang-migrate/migrate/v4/cmd/migrate@latest" "$runtime_dockerfile"; then
    printf '%s\n' 'production app Dockerfile does not pin the migrate tool to the application dependency version' >&2
    exit 1
fi

go_network_env_line="$(grep -n '^ENV GOPROXY=https://proxy.golang.org,direct' "$runtime_dockerfile" | cut -d: -f1)"
first_go_network_line="$(grep -nE '(^|[[:space:]])go (install|mod download|run) ' "$runtime_dockerfile" | cut -d: -f1 | sed -n '1p')"
if [ -z "$go_network_env_line" ] || [ -z "$first_go_network_line" ] ||
   [ "$go_network_env_line" -ge "$first_go_network_line" ] ||
   ! grep -Fq 'GOSUMDB=sum.golang.org' "$runtime_dockerfile" ||
   grep -Fq 'mirrors.tencent.com' "$runtime_dockerfile" ||
   grep -Fq 'sum.golang.google.cn' "$runtime_dockerfile" ||
   grep -Fq 'GOSUMDB=off' "$runtime_dockerfile"; then
    printf '%s\n' 'production app Dockerfile does not use the official Go module proxy and checksum database' >&2
    exit 1
fi

if ! grep -Fq -- '--mount=type=cache,target=/go/pkg/mod' "$runtime_dockerfile" ||
   ! grep -Fq -- '--mount=type=cache,target=/root/.cache/go-build' "$runtime_dockerfile"; then
    printf '%s\n' 'production app Dockerfile does not use both Go module and compilation caches' >&2
    exit 1
fi

if [ "$(grep -Fc 'Acquire::Retries "5";' "$runtime_dockerfile")" -lt 2 ] ||
   [ "$(grep -Fc 'Acquire::http::Timeout "30";' "$runtime_dockerfile")" -lt 2 ] ||
   [ "$(grep -Fc 'Acquire::https::Timeout "30";' "$runtime_dockerfile")" -lt 2 ]; then
    printf '%s\n' 'production app Dockerfile lacks bounded apt retry and timeout policy in both stages' >&2
    exit 1
fi

if grep -Fq "sed -i 's@http://deb.debian.org@https://deb.debian.org@g'" "$runtime_dockerfile"; then
    printf '%s\n' 'production app Dockerfile must not require HTTPS before the slim runtime installs ca-certificates' >&2
    exit 1
fi

if grep -Fq 'APT_MIRROR_ARG' "$runtime_dockerfile" || grep -Fq 'mirrors.cloud.tencent.com' "$runtime_dockerfile"; then
    printf '%s\n' 'production app Dockerfile still contains a self-hosted regional apt mirror override' >&2
    exit 1
fi

runtime_revision_arg_line="$(grep -n '^ARG IMAGE_REVISION_ARG=' "$runtime_dockerfile" | cut -d: -f1)"
runtime_packages_line="$(grep -n 'build-essential postgresql-client' "$runtime_dockerfile" | cut -d: -f1)"
runtime_label_line="$(grep -n '^LABEL org.opencontainers.image.version=' "$runtime_dockerfile" | cut -d: -f1)"
if grep -Fq 'ARG COMMIT_ID_ARG=' "$runtime_dockerfile" ||
   ! grep -Fq 'COMMIT_ID=81142dfd17b2778087e95d3a317483a2fd909b91' "$runtime_dockerfile" ||
   [ -z "$runtime_revision_arg_line" ] ||
   [ "$runtime_revision_arg_line" -le "$runtime_packages_line" ] ||
   [ "$runtime_revision_arg_line" -ge "$runtime_label_line" ]; then
    printf '%s\n' 'volatile release SHA invalidates stable dependency or runtime package layers' >&2
    exit 1
fi

printf '%s\n' 'production static contract is green: amd64, staged loopback frontend, edge web alias, file secrets, native Nginx routes'
