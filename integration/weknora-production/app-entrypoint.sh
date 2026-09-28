#!/bin/sh
# The upstream entrypoint remains responsible for migration and privilege
# dropping. This wrapper only reads Docker secret files immediately before it
# execs the native WeKnora process.
set -eu

# Private named-volume logs must remain writable after native privilege drop.
# The existing logger bounds and rotates app.log; never place it in /data/files.
install -d -m 0700 -o appuser -g appuser /var/log/weknora

paddle_runtime_contract=/opt/weknora-production/paddle-runtime-contract.sh
if [ ! -r "$paddle_runtime_contract" ]; then
    printf '%s\n' 'required Paddle runtime contract is unavailable' >&2
    exit 1
fi
# shellcheck source=paddle-runtime-contract.sh
. /opt/weknora-production/paddle-runtime-contract.sh

read_required_secret() {
    secret_path="$1"
    secret_name="$2"
    if [ ! -r "$secret_path" ]; then
        printf '%s\n' "required ${secret_name} secret file is unavailable" >&2
        exit 1
    fi
    secret_value=$(tr -d '\r\n' < "$secret_path")
    if [ -z "$secret_value" ]; then
        printf '%s\n' "required ${secret_name} secret file is empty" >&2
        exit 1
    fi
    printf '%s' "$secret_value"
}

export DB_PASSWORD="$(read_required_secret /run/secrets/db_password database-password)"
export REDIS_PASSWORD="$(read_required_secret /run/secrets/redis_password redis-password)"
export SYSTEM_AES_KEY="$(read_required_secret /run/secrets/system_aes_key system-aes-key)"
export JWT_SECRET="$(read_required_secret /run/secrets/jwt_secret jwt-secret)"
export OIDC_AUTH_CLIENT_ID="$(read_required_secret /run/secrets/oidc_client_id oidc-client-id)"
export OIDC_AUTH_CLIENT_SECRET="$(read_required_secret /run/secrets/oidc_client_secret oidc-client-secret)"
export MUSUW_SUPABASE_SERVICE_ROLE_KEY="$(read_required_secret /run/secrets/supabase_service_role_key supabase-service-role-key)"
export OPENROUTER_MANAGEMENT_API_KEY="$(read_required_secret /run/secrets/openrouter_management_api_key openrouter-management-api-key)"
export TIKHUB_API_KEY="$(read_required_secret /run/secrets/tikhub_api_key tikhub-api-key)"
export MUSUW_PADDLE_API_KEY="$(read_required_secret /run/secrets/paddle_api_key paddle-api-key)"
export MUSUW_PADDLE_WEBHOOK_SECRET="$(read_required_secret /run/secrets/paddle_webhook_secret paddle-webhook-secret)"
musuw_paddle_validate_production_launch \
    "${MUSUW_PADDLE_ENVIRONMENT:-}" \
    "${MUSUW_PADDLE_CLIENT_TOKEN:-}" \
    "$MUSUW_PADDLE_API_KEY" \
    "$MUSUW_PADDLE_WEBHOOK_SECRET" \
    "${MUSUW_PADDLE_PLUS_MONTHLY_PRICE_ID:-}" \
    "${MUSUW_PADDLE_PLUS_YEARLY_PRICE_ID:-}" \
    "${MUSUW_PADDLE_PRO_MONTHLY_PRICE_ID:-}" \
    "${MUSUW_PADDLE_PRO_YEARLY_PRICE_ID:-}" \
    "${MUSUW_PADDLE_MAX_MONTHLY_PRICE_ID:-}" \
    "${MUSUW_PADDLE_MAX_YEARLY_PRICE_ID:-}"
export S3_ACCESS_KEY="$(read_required_secret /run/secrets/r2_access_key_id r2-access-key-id)"
export S3_SECRET_KEY="$(read_required_secret /run/secrets/r2_secret_access_key r2-secret-access-key)"
export LANGFUSE_PUBLIC_KEY="$(read_required_secret /run/secrets/langfuse_public_key langfuse-public-key)"
export LANGFUSE_SECRET_KEY="$(read_required_secret /run/secrets/langfuse_secret_key langfuse-secret-key)"

if [ "${#SYSTEM_AES_KEY}" -ne 32 ]; then
    printf '%s\n' 'required system-aes-key has an invalid length' >&2
    exit 1
fi

neo4j_auth="$(read_required_secret /run/secrets/neo4j_auth neo4j-auth)"
case "$neo4j_auth" in
    neo4j/?*) export NEO4J_PASSWORD="${neo4j_auth#neo4j/}" ;;
    *)
        printf '%s\n' 'required neo4j-auth secret has an invalid account format' >&2
        exit 1
        ;;
esac
unset neo4j_auth

exec /app/scripts/docker-entrypoint.sh "$@"
