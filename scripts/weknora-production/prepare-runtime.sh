#!/usr/bin/env bash
# Create a non-secret production.env from a strict public allow-list. Secrets
# are checked in place and never copied, printed, or added to an env file.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$script_dir/lib.sh"

runtime_dir="$(weknora_production_runtime_dir)"
repo_root="$(weknora_production_repo_root)"
paddle_runtime_contract="$repo_root/integration/weknora-production/paddle-runtime-contract.sh"
weknora_production_require_file "$paddle_runtime_contract"
allowlist_helper="$repo_root/scripts/weknora/paddle-ip-allowlist.sh"
weknora_production_require_file "$allowlist_helper"
weknora_production_require_command curl
weknora_production_require_command jq
# shellcheck source=../../integration/weknora-production/paddle-runtime-contract.sh
. "$paddle_runtime_contract"
public_env="${WEKNORA_PRODUCTION_PUBLIC_ENV:-$runtime_dir/production.public.env}"
auth_public_env="${WEKNORA_PRODUCTION_AUTH_PUBLIC_ENV:-$runtime_dir/auth-public.env}"
secret_dir="${WEKNORA_PRODUCTION_SECRET_DIR:-$runtime_dir/secrets}"
output_env="$runtime_dir/production.env"

weknora_production_require_file "$public_env"
weknora_production_require_file "$auth_public_env"
weknora_production_require_unique_env_keys "$public_env"
weknora_production_require_unique_env_keys "$auth_public_env"

install -d -m 700 "$runtime_dir"
[ "$(weknora_production_file_mode "$runtime_dir")" = '700' ] || weknora_production_die 'production runtime directory permissions are unsafe'
"$allowlist_helper" live "$runtime_dir/paddle-ips"
[ -d "$secret_dir" ] || weknora_production_die 'production secret directory is unavailable'
[ "$(weknora_production_file_mode "$secret_dir")" = '700' ] || weknora_production_die 'production secret directory permissions are unsafe'

for secret in db_password redis_password system_aes_key jwt_secret neo4j_auth oidc_client_id oidc_client_secret supabase_service_role_key searxng_secret openrouter_management_api_key tikhub_api_key paddle_api_key paddle_webhook_secret r2_access_key_id r2_secret_access_key langfuse_public_key langfuse_secret_key; do
    weknora_production_require_secret_file "$secret_dir/$secret"
done

system_aes_key="$(weknora_production_read_secret "$secret_dir/system_aes_key")"
[ "${#system_aes_key}" -eq 32 ] || weknora_production_die 'system AES key must contain exactly 32 bytes'
unset system_aes_key

neo4j_auth="$(weknora_production_read_secret "$secret_dir/neo4j_auth")"
case "$neo4j_auth" in
    neo4j/?*) ;;
    *) weknora_production_die 'Neo4j credential file must use neo4j/password format' ;;
esac
unset neo4j_auth

paddle_api_key="$(weknora_production_read_secret "$secret_dir/paddle_api_key")"
paddle_webhook_secret="$(weknora_production_read_secret "$secret_dir/paddle_webhook_secret")"

langfuse_public_key="$(weknora_production_read_secret "$secret_dir/langfuse_public_key")"
langfuse_secret_key="$(weknora_production_read_secret "$secret_dir/langfuse_secret_key")"
case "$langfuse_public_key" in
    pk-lf-*) ;;
    *) weknora_production_die 'Langfuse public key has an invalid format' ;;
esac
case "$langfuse_secret_key" in
    sk-lf-*) ;;
    *) weknora_production_die 'Langfuse secret key has an invalid format' ;;
esac
unset langfuse_public_key langfuse_secret_key

public_oidc_client_id="$(weknora_production_require_env_value "$auth_public_env" VITE_WEKNORA_OAUTH_CLIENT_ID)"
auth_public_origin="$(weknora_production_require_env_value "$auth_public_env" VITE_AUTH_PUBLIC_ORIGIN)"
[ "$auth_public_origin" = 'https://app.musuw.com' ] || weknora_production_die 'production auth public origin must remain https://app.musuw.com'
supabase_url="$(weknora_production_require_env_value "$auth_public_env" VITE_SUPABASE_URL)"
supabase_publishable_key="$(weknora_production_require_env_value "$auth_public_env" VITE_SUPABASE_PUBLISHABLE_KEY)"
case "$supabase_url" in
    https://*) ;;
    *) weknora_production_die 'Supabase browser URL must use HTTPS' ;;
esac
supabase_authority="${supabase_url#https://}"
supabase_host="${supabase_authority%%/*}"
supabase_host="${supabase_host%%\?*}"
case "$supabase_host" in
    ''|*[!A-Za-z0-9.-]*) weknora_production_die 'Supabase browser URL host is unsafe' ;;
esac
secret_oidc_client_id="$(weknora_production_read_secret "$secret_dir/oidc_client_id")"
[ "$public_oidc_client_id" = "$secret_oidc_client_id" ] || weknora_production_die 'public auth bundle client id does not match its file-backed native OIDC client id'
unset secret_oidc_client_id

tmp_env="$(mktemp "$runtime_dir/production.env.XXXXXX")"
trap 'find "$tmp_env" -type f -delete 2>/dev/null || true' EXIT
chmod 600 "$tmp_env"

awk '
    BEGIN {
        split("WEKNORA_PRODUCTION_RELEASE_ID WEKNORA_PRODUCTION_REVISION WEKNORA_PRODUCTION_APP_IMAGE WEKNORA_PRODUCTION_FRONTEND_IMAGE WEKNORA_PRODUCTION_FRONTEND_PORT WEKNORA_PRODUCTION_APP_PORT WEKNORA_PRODUCTION_POSTGRES_VOLUME WEKNORA_PRODUCTION_FILES_VOLUME WEKNORA_PRODUCTION_DOCREADER_TMP_VOLUME WEKNORA_PRODUCTION_REDIS_VOLUME WEKNORA_PRODUCTION_NEO4J_VOLUME WEKNORA_PRODUCTION_SEARXNG_CONFIG_VOLUME WEKNORA_PRODUCTION_SEARXNG_PORT DB_DRIVER DB_HOST DB_PORT DB_USER DB_NAME REDIS_ADDR STREAM_MANAGER_TYPE REDIS_DB REDIS_PREFIX WEKNORA_REDIS_NAMESPACE NEO4J_ENABLE NEO4J_URI NEO4J_USERNAME STORAGE_TYPE LOCAL_STORAGE_BASE_DIR MAX_FILE_SIZE_MB GIN_MODE LOG_LEVEL TZ AUTO_MIGRATE AUTO_RECOVER_DIRTY DISABLE_REGISTRATION WEKNORA_AUTH_DEFAULT_TENANT_MODE MUSUW_PRODUCT_EDITION APP_EXTERNAL_URL FRONTEND_BASE_URL OIDC_AUTH_ENABLE OIDC_AUTH_ISSUER_URL OIDC_AUTH_DISCOVERY_URL OIDC_AUTH_PROVIDER_DISPLAY_NAME OIDC_AUTH_SCOPES OIDC_USER_INFO_MAPPING_USER_NAME OIDC_USER_INFO_MAPPING_EMAIL MUSUW_PADDLE_ENVIRONMENT MUSUW_PADDLE_CLIENT_TOKEN MUSUW_PADDLE_PLUS_MONTHLY_PRICE_ID MUSUW_PADDLE_PLUS_YEARLY_PRICE_ID MUSUW_PADDLE_PRO_MONTHLY_PRICE_ID MUSUW_PADDLE_PRO_YEARLY_PRICE_ID MUSUW_PADDLE_MAX_MONTHLY_PRICE_ID MUSUW_PADDLE_MAX_YEARLY_PRICE_ID LANGFUSE_ENABLED LANGFUSE_HOST LANGFUSE_RELEASE LANGFUSE_ENVIRONMENT DOCREADER_ADDR DOCREADER_TRANSPORT", keys, " ")
        for (i in keys) allowed[keys[i]] = 1
    }
    /^[[:space:]]*($|#)/ { next }
    /^[A-Za-z_][A-Za-z0-9_]*=/ {
        key = $0
        sub(/=.*/, "", key)
        if (!allowed[key]) {
            print "unapproved production setting" > "/dev/stderr"
            exit 2
        }
        print
        next
    }
    {
        print "invalid production public environment syntax" > "/dev/stderr"
        exit 2
    }
' "$public_env" > "$tmp_env"

for key in \
    WEKNORA_PRODUCTION_RELEASE_ID WEKNORA_PRODUCTION_APP_IMAGE WEKNORA_PRODUCTION_FRONTEND_IMAGE \
    WEKNORA_PRODUCTION_FRONTEND_PORT WEKNORA_PRODUCTION_APP_PORT \
    WEKNORA_PRODUCTION_POSTGRES_VOLUME WEKNORA_PRODUCTION_FILES_VOLUME WEKNORA_PRODUCTION_DOCREADER_TMP_VOLUME \
    WEKNORA_PRODUCTION_REDIS_VOLUME WEKNORA_PRODUCTION_NEO4J_VOLUME WEKNORA_PRODUCTION_SEARXNG_CONFIG_VOLUME WEKNORA_PRODUCTION_SEARXNG_PORT \
    DB_USER DB_NAME STREAM_MANAGER_TYPE WEKNORA_REDIS_NAMESPACE APP_EXTERNAL_URL FRONTEND_BASE_URL OIDC_AUTH_ISSUER_URL OIDC_AUTH_DISCOVERY_URL \
    MUSUW_PADDLE_ENVIRONMENT MUSUW_PADDLE_CLIENT_TOKEN \
    MUSUW_PADDLE_PLUS_MONTHLY_PRICE_ID MUSUW_PADDLE_PLUS_YEARLY_PRICE_ID \
    MUSUW_PADDLE_PRO_MONTHLY_PRICE_ID MUSUW_PADDLE_PRO_YEARLY_PRICE_ID \
    MUSUW_PADDLE_MAX_MONTHLY_PRICE_ID MUSUW_PADDLE_MAX_YEARLY_PRICE_ID \
    LANGFUSE_ENABLED LANGFUSE_HOST LANGFUSE_RELEASE LANGFUSE_ENVIRONMENT; do
    weknora_production_require_env_value "$tmp_env" "$key" >/dev/null
done

product_edition="$(weknora_production_env_value "$tmp_env" MUSUW_PRODUCT_EDITION || true)"
case "$product_edition" in
    ''|lite|standard) ;;
    *) weknora_production_die 'MUSUW_PRODUCT_EDITION must be lite or standard' ;;
esac
unset product_edition

app_image="$(weknora_production_require_env_value "$tmp_env" WEKNORA_PRODUCTION_APP_IMAGE)"
frontend_image="$(weknora_production_require_env_value "$tmp_env" WEKNORA_PRODUCTION_FRONTEND_IMAGE)"
if ! [[ "$app_image" =~ ^ghcr\.io/estromeglovettgen-coder/musuw-app@sha256:[0-9a-fA-F]{64}$ ]]; then
    weknora_production_die 'production app image must be the approved immutable GHCR digest'
fi
if ! [[ "$frontend_image" =~ ^ghcr\.io/estromeglovettgen-coder/musuw-frontend@sha256:[0-9a-fA-F]{64}$ ]]; then
    weknora_production_die 'production frontend image must be the approved immutable GHCR digest'
fi
unset app_image frontend_image

release_id="$(weknora_production_require_env_value "$tmp_env" WEKNORA_PRODUCTION_RELEASE_ID)"
weknora_production_safe_id "$release_id" || weknora_production_die 'production release id is unsafe'
[ "$release_id" = 'weknora-v072-production' ] || weknora_production_die 'production release id is not the approved v0.7.2 identity'

# CI supplies the immutable source revision out-of-band so a runner can use a
# temporary public-env directory without copying server-owned runtime state.
# Keep an existing file value authoritative when it is present, and append the
# selected revision only when the public input intentionally omits it.
file_revision="$(weknora_production_env_value "$tmp_env" WEKNORA_PRODUCTION_REVISION || true)"
selected_revision="${WEKNORA_PRODUCTION_REVISION:-$file_revision}"
if [ -n "$selected_revision" ]; then
    WEKNORA_PRODUCTION_REVISION="$selected_revision"
    selected_revision="$(weknora_production_revision)"
    if [ -n "$file_revision" ] && [ "$file_revision" != "$selected_revision" ]; then
        weknora_production_die 'production public revision does not match the selected release revision'
    fi
    [ -n "$file_revision" ] || printf '%s\n' "WEKNORA_PRODUCTION_REVISION=$selected_revision" >> "$tmp_env"
fi
unset file_revision selected_revision

[ "$(weknora_production_require_env_value "$tmp_env" APP_EXTERNAL_URL)" = 'https://app.musuw.com' ] || weknora_production_die 'APP_EXTERNAL_URL must remain the production HTTPS origin'
[ "$(weknora_production_require_env_value "$tmp_env" FRONTEND_BASE_URL)" = 'https://app.musuw.com' ] || weknora_production_die 'FRONTEND_BASE_URL must remain the production HTTPS origin'
[ "$(weknora_production_require_env_value "$tmp_env" STREAM_MANAGER_TYPE)" = 'redis' ] || weknora_production_die 'production stream manager must remain Redis'
[ "$(weknora_production_require_env_value "$tmp_env" WEKNORA_REDIS_NAMESPACE)" = 'weknora-v072-production' ] || weknora_production_die 'production Redis namespace is not isolated'
[ "$(weknora_production_require_env_value "$tmp_env" OIDC_AUTH_ISSUER_URL)" = "${supabase_url%/}/auth/v1" ] || weknora_production_die 'OIDC issuer must match the public Supabase URL'
[ "$(weknora_production_require_env_value "$tmp_env" OIDC_AUTH_DISCOVERY_URL)" = "${supabase_url%/}/auth/v1/.well-known/openid-configuration" ] || weknora_production_die 'OIDC discovery must match the public Supabase URL'
paddle_environment="$(weknora_production_require_env_value "$tmp_env" MUSUW_PADDLE_ENVIRONMENT)"
paddle_client_token="$(weknora_production_require_env_value "$tmp_env" MUSUW_PADDLE_CLIENT_TOKEN)"
musuw_paddle_validate_production_launch \
    "$paddle_environment" \
    "$paddle_client_token" \
    "$paddle_api_key" \
    "$paddle_webhook_secret" \
    "$(weknora_production_require_env_value "$tmp_env" MUSUW_PADDLE_PLUS_MONTHLY_PRICE_ID)" \
    "$(weknora_production_require_env_value "$tmp_env" MUSUW_PADDLE_PLUS_YEARLY_PRICE_ID)" \
    "$(weknora_production_require_env_value "$tmp_env" MUSUW_PADDLE_PRO_MONTHLY_PRICE_ID)" \
    "$(weknora_production_require_env_value "$tmp_env" MUSUW_PADDLE_PRO_YEARLY_PRICE_ID)" \
    "$(weknora_production_require_env_value "$tmp_env" MUSUW_PADDLE_MAX_MONTHLY_PRICE_ID)" \
    "$(weknora_production_require_env_value "$tmp_env" MUSUW_PADDLE_MAX_YEARLY_PRICE_ID)"
unset paddle_environment paddle_client_token paddle_api_key paddle_webhook_secret
[ "$(weknora_production_require_env_value "$tmp_env" LANGFUSE_ENABLED)" = 'true' ] || weknora_production_die 'production Langfuse tracing must remain enabled'
[ "$(weknora_production_require_env_value "$tmp_env" LANGFUSE_HOST)" = 'https://jp.cloud.langfuse.com' ] || weknora_production_die 'production Langfuse host must remain the JP Cloud endpoint'
[ "$(weknora_production_require_env_value "$tmp_env" LANGFUSE_ENVIRONMENT)" = 'production' ] || weknora_production_die 'production Langfuse environment must remain production'
weknora_production_assert_exact_volume postgres-data "$(weknora_production_require_env_value "$tmp_env" WEKNORA_PRODUCTION_POSTGRES_VOLUME)"
weknora_production_assert_exact_volume data-files "$(weknora_production_require_env_value "$tmp_env" WEKNORA_PRODUCTION_FILES_VOLUME)"
weknora_production_assert_exact_volume docreader-tmp "$(weknora_production_require_env_value "$tmp_env" WEKNORA_PRODUCTION_DOCREADER_TMP_VOLUME)"
weknora_production_assert_exact_volume redis-data "$(weknora_production_require_env_value "$tmp_env" WEKNORA_PRODUCTION_REDIS_VOLUME)"
weknora_production_assert_exact_volume neo4j-data "$(weknora_production_require_env_value "$tmp_env" WEKNORA_PRODUCTION_NEO4J_VOLUME)"
weknora_production_assert_exact_volume searxng-config "$(weknora_production_require_env_value "$tmp_env" WEKNORA_PRODUCTION_SEARXNG_CONFIG_VOLUME)"

printf '%s\n' "WEKNORA_PRODUCTION_SECRET_DIR=$secret_dir" >> "$tmp_env"
printf '%s\n' "SSRF_WHITELIST_EXTRA=searxng,qdrant,milvus,weaviate,doris-fe,doris-be,$supabase_host" >> "$tmp_env"
printf '%s\n' \
    'MUSUW_DEPLOYMENT_ENVIRONMENT=production' \
    "MUSUW_AUTH_PUBLIC_ORIGIN=$auth_public_origin" \
    "MUSUW_SUPABASE_URL=$supabase_url" \
    "MUSUW_SUPABASE_PUBLISHABLE_KEY=$supabase_publishable_key" \
    "MUSUW_WEKNORA_OAUTH_CLIENT_ID=$public_oidc_client_id" >> "$tmp_env"
unset auth_public_origin public_oidc_client_id supabase_url supabase_publishable_key supabase_authority supabase_host
mv "$tmp_env" "$output_env"
trap - EXIT

printf '%s\n' "production non-secret runtime configuration prepared at $output_env"
