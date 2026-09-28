#!/bin/sh
# Redis has no PASSWORD_FILE option. Keep its generated config on the writable
# container filesystem (never the named data volume) so the source credential
# remains file-backed and never appears in the process argument list.
set -eu

secret_path=/run/secrets/redis_password
config_path=/run/redis-production.conf

if [ ! -r "$secret_path" ]; then
    printf '%s\n' 'required redis-password secret file is unavailable' >&2
    exit 1
fi

password=$(tr -d '\r\n' < "$secret_path")
if [ -z "$password" ]; then
    printf '%s\n' 'required redis-password secret file is empty' >&2
    exit 1
fi

umask 077
{
    printf '%s\n' 'appendonly yes'
    printf '%s %s\n' 'requirepass' "$password"
} > "$config_path"
unset password
chown redis:redis "$config_path"
chmod 0600 "$config_path"

exec docker-entrypoint.sh redis-server "$config_path"
