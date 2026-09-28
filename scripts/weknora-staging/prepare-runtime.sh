#!/usr/bin/env bash
# Build the non-secret staging Compose env from an allowlisted public input.
# Secret files are checked as metadata only; their values stay inside the
# container app entrypoint and are never copied into staging.env or logs.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
. "$script_dir/lib.sh"

runtime_dir="$(weknora_staging_runtime_dir)"
repo_root="$(weknora_staging_repo_root)"
allowlist_helper="$repo_root/scripts/weknora/paddle-ip-allowlist.sh"
weknora_staging_require_file "$allowlist_helper"
public_env="${WEKNORA_STAGING_PUBLIC_ENV:-$runtime_dir/staging.public.env}"
auth_public_env="${WEKNORA_STAGING_AUTH_PUBLIC_ENV:-$runtime_dir/auth-public.env}"
secret_dir="${MUSUW_STAGING_SECRET_DIR:-$runtime_dir/secrets}"
openrouter_workspace_pin="$runtime_dir/openrouter-workspace-id"
output_env="$runtime_dir/staging.env"

weknora_staging_require_command awk
weknora_staging_require_command sha256sum
weknora_staging_require_command curl
weknora_staging_require_command jq
weknora_staging_require_file "$public_env"
weknora_staging_require_file "$auth_public_env"
weknora_staging_require_file "$openrouter_workspace_pin"
weknora_staging_require_unique_env_keys "$public_env"
weknora_staging_require_unique_env_keys "$auth_public_env"
[ -O "$openrouter_workspace_pin" ] || weknora_staging_die 'staging OpenRouter workspace pin ownership is unsafe'
[ "$(weknora_staging_file_mode "$openrouter_workspace_pin")" = 600 ] || weknora_staging_die 'staging OpenRouter workspace pin permissions are unsafe'
[ -s "$openrouter_workspace_pin" ] || weknora_staging_die 'staging OpenRouter workspace pin is empty'
install -d -m 700 "$runtime_dir"
[ "$(weknora_staging_file_mode "$runtime_dir")" = 700 ] || weknora_staging_die 'staging runtime directory permissions are unsafe'
"$allowlist_helper" sandbox "$runtime_dir/paddle-ips"
[ -d "$secret_dir" ] && [ ! -L "$secret_dir" ] || weknora_staging_die 'staging secret directory is unavailable or unsafe'
[ "$(weknora_staging_file_mode "$secret_dir")" = 700 ] || weknora_staging_die 'staging secret directory permissions are unsafe'

# Keep this list deliberately finite. The generated env is consumed by Compose
# and is not a general-purpose shell environment.
allowed_public_keys='WEKNORA_STAGING_RELEASE_ID WEKNORA_STAGING_REVISION WEKNORA_STAGING_APP_IMAGE WEKNORA_STAGING_FRONTEND_IMAGE WEKNORA_STAGING_FRONTEND_PORT WEKNORA_STAGING_APP_PORT WEKNORA_STAGING_POSTGRES_VOLUME WEKNORA_STAGING_FILES_VOLUME WEKNORA_STAGING_DOCREADER_TMP_VOLUME WEKNORA_STAGING_REDIS_VOLUME WEKNORA_STAGING_SEARXNG_CONFIG_VOLUME MUSUW_STAGING_SECRET_DIR MUSUW_STAGING_R2_ENDPOINT MUSUW_STAGING_R2_BUCKET DB_DRIVER DB_HOST DB_PORT DB_USER DB_NAME REDIS_ADDR STREAM_MANAGER_TYPE REDIS_DB REDIS_PREFIX WEKNORA_REDIS_NAMESPACE NEO4J_ENABLE STORAGE_TYPE LOCAL_STORAGE_BASE_DIR MAX_FILE_SIZE_MB GIN_MODE LOG_LEVEL TZ AUTO_MIGRATE AUTO_RECOVER_DIRTY DISABLE_REGISTRATION WEKNORA_AUTH_DEFAULT_TENANT_MODE MUSUW_PRODUCT_EDITION APP_EXTERNAL_URL FRONTEND_BASE_URL OIDC_AUTH_ENABLE OIDC_AUTH_ISSUER_URL OIDC_AUTH_DISCOVERY_URL OIDC_AUTH_PROVIDER_DISPLAY_NAME OIDC_AUTH_SCOPES OIDC_USER_INFO_MAPPING_USER_NAME OIDC_USER_INFO_MAPPING_EMAIL MUSUW_PADDLE_ENVIRONMENT MUSUW_PADDLE_API_URL MUSUW_PADDLE_CLIENT_TOKEN MUSUW_PADDLE_PLUS_MONTHLY_PRICE_ID MUSUW_PADDLE_PLUS_YEARLY_PRICE_ID MUSUW_PADDLE_PRO_MONTHLY_PRICE_ID MUSUW_PADDLE_PRO_YEARLY_PRICE_ID MUSUW_PADDLE_MAX_MONTHLY_PRICE_ID MUSUW_PADDLE_MAX_YEARLY_PRICE_ID OPENROUTER_WORKSPACE_ID LANGFUSE_ENABLED LANGFUSE_HOST LANGFUSE_RELEASE LANGFUSE_ENVIRONMENT'

tmp_env="$(mktemp "$runtime_dir/staging.env.XXXXXX")"
trap 'rm -f "$tmp_env"' EXIT
chmod 600 "$tmp_env"

awk -v allowed="$allowed_public_keys" '
    BEGIN {
        split(allowed, keys, " ")
        for (i in keys) permitted[keys[i]] = 1
    }
    /^[[:space:]]*($|#)/ { next }
    /^[A-Za-z_][A-Za-z0-9_]*=/ {
        key = $0
        sub(/=.*/, "", key)
        if (!permitted[key]) {
            print "unapproved staging setting" > "/dev/stderr"
            exit 2
        }
        print
        next
    }
    { print "invalid staging public environment syntax" > "/dev/stderr"; exit 2 }
' "$public_env" > "$tmp_env" || weknora_staging_die 'staging public environment is not allowlisted'

release_id="$(weknora_staging_require_env_value "$tmp_env" WEKNORA_STAGING_RELEASE_ID)"
[ "$release_id" = 'weknora-v072-staging' ] || weknora_staging_die 'staging release identity is not approved'
revision="$(weknora_staging_require_env_value "$tmp_env" WEKNORA_STAGING_REVISION)"
[[ "$revision" =~ ^[0-9a-fA-F]{40}$ ]] || weknora_staging_die 'staging revision must be a full Git SHA'
app_image="$(weknora_staging_require_env_value "$tmp_env" WEKNORA_STAGING_APP_IMAGE)"
frontend_image="$(weknora_staging_require_env_value "$tmp_env" WEKNORA_STAGING_FRONTEND_IMAGE)"
weknora_staging_require_immutable_image "$app_image"
weknora_staging_require_immutable_image "$frontend_image"
unset app_image frontend_image

for key in \
    WEKNORA_STAGING_FRONTEND_PORT WEKNORA_STAGING_APP_PORT \
    WEKNORA_STAGING_POSTGRES_VOLUME WEKNORA_STAGING_FILES_VOLUME \
    WEKNORA_STAGING_DOCREADER_TMP_VOLUME WEKNORA_STAGING_REDIS_VOLUME WEKNORA_STAGING_SEARXNG_CONFIG_VOLUME \
    DB_USER DB_NAME APP_EXTERNAL_URL FRONTEND_BASE_URL OIDC_AUTH_ISSUER_URL \
    OIDC_AUTH_DISCOVERY_URL MUSUW_STAGING_R2_ENDPOINT MUSUW_STAGING_R2_BUCKET \
    MUSUW_PADDLE_ENVIRONMENT MUSUW_PADDLE_API_URL MUSUW_PADDLE_CLIENT_TOKEN \
    MUSUW_PADDLE_PLUS_MONTHLY_PRICE_ID MUSUW_PADDLE_PLUS_YEARLY_PRICE_ID \
    MUSUW_PADDLE_PRO_MONTHLY_PRICE_ID MUSUW_PADDLE_PRO_YEARLY_PRICE_ID \
    MUSUW_PADDLE_MAX_MONTHLY_PRICE_ID MUSUW_PADDLE_MAX_YEARLY_PRICE_ID \
    OPENROUTER_WORKSPACE_ID LANGFUSE_ENABLED LANGFUSE_HOST LANGFUSE_RELEASE LANGFUSE_ENVIRONMENT; do
    weknora_staging_require_env_value "$tmp_env" "$key" >/dev/null
done

product_edition="$(weknora_staging_env_value "$tmp_env" MUSUW_PRODUCT_EDITION || true)"
[ -z "$product_edition" ] || [ "$product_edition" = lite ] ||
    weknora_staging_die 'staging product edition must be Lite'
unset product_edition

for port_key in WEKNORA_STAGING_FRONTEND_PORT WEKNORA_STAGING_APP_PORT; do
    port="$(weknora_staging_require_env_value "$tmp_env" "$port_key")"
    [[ "$port" =~ ^[0-9]+$ ]] || weknora_staging_die 'staging port is invalid'
done
for volume_key in WEKNORA_STAGING_POSTGRES_VOLUME WEKNORA_STAGING_FILES_VOLUME WEKNORA_STAGING_DOCREADER_TMP_VOLUME WEKNORA_STAGING_REDIS_VOLUME WEKNORA_STAGING_SEARXNG_CONFIG_VOLUME; do
    weknora_staging_assert_volume "$(weknora_staging_require_env_value "$tmp_env" "$volume_key")"
done
[ "$(weknora_staging_require_env_value "$tmp_env" APP_EXTERNAL_URL)" = 'https://staging.musuw.com' ] || weknora_staging_die 'staging APP_EXTERNAL_URL is not the dotted HTTPS origin'
[ "$(weknora_staging_require_env_value "$tmp_env" FRONTEND_BASE_URL)" = 'https://staging.musuw.com' ] || weknora_staging_die 'staging FRONTEND_BASE_URL is not the dotted HTTPS origin'
[ "$(weknora_staging_require_env_value "$tmp_env" MUSUW_PADDLE_ENVIRONMENT)" = sandbox ] || weknora_staging_die 'staging Paddle environment must be Sandbox'
[ "$(weknora_staging_require_env_value "$tmp_env" MUSUW_PADDLE_API_URL)" = 'https://sandbox-api.paddle.com' ] || weknora_staging_die 'staging Paddle API URL must be Sandbox'
[ "$(weknora_staging_require_env_value "$tmp_env" NEO4J_ENABLE)" = true ] || weknora_staging_die 'staging must enable its isolated Neo4j'
[ "$(weknora_staging_require_env_value "$tmp_env" LANGFUSE_ENABLED)" = true ] || weknora_staging_die 'staging Langfuse tracing must remain enabled'
[ "$(weknora_staging_require_env_value "$tmp_env" LANGFUSE_HOST)" = 'https://jp.cloud.langfuse.com' ] || weknora_staging_die 'staging Langfuse host must remain the JP Cloud endpoint'
[ "$(weknora_staging_require_env_value "$tmp_env" LANGFUSE_RELEASE)" = 'musuw-staging' ] || weknora_staging_die 'staging Langfuse release identity is not approved'
[ "$(weknora_staging_require_env_value "$tmp_env" LANGFUSE_ENVIRONMENT)" = staging ] || weknora_staging_die 'staging Langfuse environment must remain staging'

r2_endpoint="$(weknora_staging_require_env_value "$tmp_env" MUSUW_STAGING_R2_ENDPOINT)"
case "$r2_endpoint" in https://*.r2.cloudflarestorage.com) ;; *) weknora_staging_die 'staging R2 endpoint is invalid' ;; esac
r2_bucket="$(weknora_staging_require_env_value "$tmp_env" MUSUW_STAGING_R2_BUCKET)"
[ "$r2_bucket" = musuw-staging ] || weknora_staging_die 'staging R2 bucket is not the commissioned test bucket'

for price_key in MUSUW_PADDLE_PLUS_MONTHLY_PRICE_ID MUSUW_PADDLE_PLUS_YEARLY_PRICE_ID MUSUW_PADDLE_PRO_MONTHLY_PRICE_ID MUSUW_PADDLE_PRO_YEARLY_PRICE_ID MUSUW_PADDLE_MAX_MONTHLY_PRICE_ID MUSUW_PADDLE_MAX_YEARLY_PRICE_ID; do
    price="$(weknora_staging_require_env_value "$tmp_env" "$price_key")"
    [[ "$price" =~ ^pri_[A-Za-z0-9_-]+$ ]] || weknora_staging_die 'staging Paddle price identifier is invalid'
done
client_token="$(weknora_staging_require_env_value "$tmp_env" MUSUW_PADDLE_CLIENT_TOKEN)"
case "$client_token" in test_?*) ;; *) weknora_staging_die 'staging Paddle client token must be Sandbox' ;; esac
unset client_token r2_endpoint r2_bucket price
workspace_id="$(weknora_staging_require_env_value "$tmp_env" OPENROUTER_WORKSPACE_ID)"
[[ "$workspace_id" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$ ]] ||
    weknora_staging_die 'staging OpenRouter workspace ID must be a UUID'
workspace_pin="$(awk 'NR == 1 { value = $0 } END { if (NR != 1) exit 1; print value }' "$openrouter_workspace_pin")" ||
    weknora_staging_die 'staging OpenRouter workspace pin must contain exactly one line'
[[ "$workspace_pin" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$ ]] ||
    weknora_staging_die 'staging OpenRouter workspace pin must be a UUID'
[ "$workspace_id" = "$workspace_pin" ] || weknora_staging_die 'staging OpenRouter workspace differs from the server pin'
unset workspace_id workspace_pin

public_origin="$(weknora_staging_require_env_value "$auth_public_env" MUSUW_AUTH_PUBLIC_ORIGIN)"
[ "$public_origin" = 'https://staging.musuw.com' ] || weknora_staging_die 'staging auth origin must be the dotted HTTPS origin'
supabase_url="$(weknora_staging_require_env_value "$auth_public_env" MUSUW_SUPABASE_URL)"
[ "$supabase_url" = 'https://achfnnicetupvtoqiwqd.supabase.co' ] || weknora_staging_die 'staging Supabase URL is not the commissioned test project'
supabase_authority="${supabase_url#https://}"
supabase_host="${supabase_authority%%/*}"
case "$supabase_host" in ''|*[!A-Za-z0-9.-]*) weknora_staging_die 'staging Supabase host is unsafe' ;; esac
publishable_key="$(weknora_staging_require_env_value "$auth_public_env" MUSUW_SUPABASE_PUBLISHABLE_KEY)"
oauth_client_id="$(weknora_staging_require_env_value "$auth_public_env" MUSUW_WEKNORA_OAUTH_CLIENT_ID)"
case "$publishable_key" in *' '|*'	'|*'='*) weknora_staging_die 'staging Supabase publishable key is malformed' ;; esac
case "$oauth_client_id" in ''|*[!A-Za-z0-9._:-]*) weknora_staging_die 'staging public OIDC client id is unsafe' ;; esac
unset publishable_key

oidc_issuer="$(weknora_staging_require_env_value "$tmp_env" OIDC_AUTH_ISSUER_URL)"
oidc_discovery="$(weknora_staging_require_env_value "$tmp_env" OIDC_AUTH_DISCOVERY_URL)"
[ "$oidc_issuer" = "${supabase_url%/}/auth/v1" ] || weknora_staging_die 'staging OIDC issuer does not match Supabase URL'
[ "$oidc_discovery" = "${supabase_url%/}/auth/v1/.well-known/openid-configuration" ] || weknora_staging_die 'staging OIDC discovery does not match Supabase URL'

# Values below are generated by this helper when they are not already present
# in the allowlisted public input. A caller may provide them for readability,
# but conflicting identity values are rejected and the generated file always
# contains one canonical value for each key.
input_secret_dir="$(weknora_staging_env_value "$tmp_env" MUSUW_STAGING_SECRET_DIR || true)"
[ -z "$input_secret_dir" ] || [ "$input_secret_dir" = "$secret_dir" ] ||
    weknora_staging_die 'staging secret directory does not match the selected runtime root'
input_redis_namespace="$(weknora_staging_env_value "$tmp_env" WEKNORA_REDIS_NAMESPACE || true)"
[ -z "$input_redis_namespace" ] || [ "$input_redis_namespace" = weknora-v072-staging ] ||
    weknora_staging_die 'staging Redis namespace is not the fixed staging identity'
unset input_secret_dir input_redis_namespace

# Only non-secret metadata is checked. Values are read exclusively by the
# container entrypoints from their mounted secret files.
required_secrets=(db_password redis_password system_aes_key jwt_secret oidc_client_id oidc_client_secret supabase_service_role_key openrouter_management_api_key tikhub_api_key paddle_api_key paddle_webhook_secret r2_access_key_id r2_secret_access_key langfuse_public_key langfuse_secret_key searxng_secret neo4j_auth)
for secret in "${required_secrets[@]}"; do
    weknora_staging_require_secret_file "$secret_dir/$secret"
done

append_if_absent() {
    local key="$1" value="$2"
    if ! grep -Eq "^${key}=" "$tmp_env"; then
        printf '%s=%s\n' "$key" "$value" >> "$tmp_env"
    fi
}

append_if_absent WEKNORA_STAGING_RUNTIME_DIR "$runtime_dir"
append_if_absent MUSUW_STAGING_SECRET_DIR "$secret_dir"
append_if_absent WEKNORA_REDIS_NAMESPACE weknora-v072-staging
append_if_absent MUSUW_DEPLOYMENT_ENVIRONMENT staging
append_if_absent MUSUW_PRODUCT_EDITION lite
append_if_absent MUSUW_AUTH_PUBLIC_ORIGIN "$public_origin"
append_if_absent MUSUW_SUPABASE_URL "$supabase_url"
append_if_absent MUSUW_SUPABASE_PUBLISHABLE_KEY "$(weknora_staging_require_env_value "$auth_public_env" MUSUW_SUPABASE_PUBLISHABLE_KEY)"
append_if_absent MUSUW_WEKNORA_OAUTH_CLIENT_ID "$oauth_client_id"
append_if_absent SSRF_WHITELIST_EXTRA "searxng,qdrant,milvus,weaviate,doris-fe,doris-be,$supabase_host"

mv -f "$tmp_env" "$output_env"
trap - EXIT
printf '%s\n' "staging non-secret runtime configuration prepared at $output_env"
