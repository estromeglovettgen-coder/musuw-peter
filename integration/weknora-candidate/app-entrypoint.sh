#!/bin/sh
# The official image still owns startup, migration, and privilege dropping.
# This tiny wrapper only turns Compose secret-file mounts into the exact native
# upstream environment variables immediately before execing that entrypoint.
set -eu

read_required_secret() {
    secret_path="$1"
    if [ ! -r "$secret_path" ]; then
        printf '%s\n' "required backend secret file is unavailable" >&2
        exit 1
    fi

    secret_value=$(tr -d '\r\n' < "$secret_path")
    if [ -z "$secret_value" ]; then
        printf '%s\n' "required backend secret file is empty" >&2
        exit 1
    fi
    printf '%s' "$secret_value"
}

export OIDC_AUTH_CLIENT_ID="$(read_required_secret /run/secrets/oidc_client_id)"
export OIDC_AUTH_CLIENT_SECRET="$(read_required_secret /run/secrets/oidc_client_secret)"
exec /app/scripts/docker-entrypoint.sh "$@"
