#!/bin/sh
# SearXNG accepts its secret through an environment variable. Read the Docker
# secret file only at startup, then hand control to the image's own entrypoint.
set -eu

secret_path=/run/secrets/searxng_secret
if [ ! -r "$secret_path" ]; then
    printf '%s\n' 'required searxng secret file is unavailable' >&2
    exit 1
fi

export SEARXNG_SECRET="$(tr -d '\r\n' < "$secret_path")"
if [ -z "$SEARXNG_SECRET" ]; then
    printf '%s\n' 'required searxng secret file is empty' >&2
    exit 1
fi

exec /usr/local/searxng/entrypoint.sh "$@"
