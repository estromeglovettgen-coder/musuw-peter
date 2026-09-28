#!/usr/bin/env bash
# Build the retained auth screen separately from every WeKnora business asset.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
auth_public_env="$repo_root/.runtime/weknora/auth-public.env"

if [ ! -r "$auth_public_env" ]; then
    printf '%s\n' "run scripts/weknora-candidate/prepare-runtime.sh first" >&2
    exit 1
fi

set -a
# shellcheck disable=SC1090
. "$auth_public_env"
set +a

for required in VITE_AUTH_PUBLIC_ORIGIN VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY VITE_WEKNORA_OAUTH_CLIENT_ID; do
    if [ -z "${!required:-}" ]; then
        printf '%s\n' "candidate auth public configuration is incomplete" >&2
        exit 1
    fi
done

cd "$repo_root/auth"
npm run typecheck
npm exec vite build

if [ ! -f dist/index.html ] || ! find dist/assets -type f -name '*.js' -print -quit | grep -q .; then
    printf '%s\n' "candidate auth build did not produce a complete static bundle" >&2
    exit 1
fi

printf '%s\n' 'candidate auth shell built with the /auth/ base path'
