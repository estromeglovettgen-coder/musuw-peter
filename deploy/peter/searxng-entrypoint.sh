#!/bin/sh
set -eu

secret_path=/run/secrets/searxng_secret
if [ ! -s "$secret_path" ]; then
  printf '%s\n' 'SearXNG secret is missing or empty' >&2
  exit 1
fi

export SEARXNG_SECRET="$(tr -d '\r\n' < "$secret_path")"
test -n "$SEARXNG_SECRET" || exit 1
exec /usr/local/searxng/entrypoint.sh "$@"
