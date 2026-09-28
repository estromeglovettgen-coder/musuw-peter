#!/usr/bin/env bash
# Build the two static browser bundles locally before release staging. It reads
# only public browser configuration; server credentials remain file-backed.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$script_dir/lib.sh"

repo_root="$(weknora_production_repo_root)"
runtime_dir="$(weknora_production_runtime_dir)"
auth_public_env="${WEKNORA_PRODUCTION_AUTH_PUBLIC_ENV:-$runtime_dir/auth-public.env}"
# weknora_production_revision resolves WEKNORA_PRODUCTION_REVISION, the
# runner's GITHUB_SHA, or the explicit local-development fallback.
revision="$(weknora_production_revision)"

weknora_production_require_command npm
weknora_production_require_file "$auth_public_env"
weknora_production_require_unique_env_keys "$auth_public_env"
for key in VITE_AUTH_PUBLIC_ORIGIN VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY VITE_WEKNORA_OAUTH_CLIENT_ID; do
    weknora_production_require_env_value "$auth_public_env" "$key" >/dev/null
done

auth_public_origin="$(weknora_production_require_env_value "$auth_public_env" VITE_AUTH_PUBLIC_ORIGIN)"
[ "$auth_public_origin" = 'https://app.musuw.com' ] || weknora_production_die 'production auth public origin must remain https://app.musuw.com'
supabase_url="$(weknora_production_require_env_value "$auth_public_env" VITE_SUPABASE_URL)"
supabase_publishable_key="$(weknora_production_require_env_value "$auth_public_env" VITE_SUPABASE_PUBLISHABLE_KEY)"
oidc_client_id="$(weknora_production_require_env_value "$auth_public_env" VITE_WEKNORA_OAUTH_CLIENT_ID)"

(
    cd "$repo_root/weknora/frontend"
    VITE_FRONTEND_COMMIT="$revision" VITE_IS_DOCKER=true npm ci
    VITE_FRONTEND_COMMIT="$revision" VITE_IS_DOCKER=true npm run build
)
(
    cd "$repo_root/auth"
    VITE_SUPABASE_URL="$supabase_url" \
    VITE_SUPABASE_PUBLISHABLE_KEY="$supabase_publishable_key" \
    VITE_WEKNORA_OAUTH_CLIENT_ID="$oidc_client_id" \
    VITE_AUTH_PUBLIC_ORIGIN="$auth_public_origin" \
    npm run build
)
unset auth_public_origin supabase_url supabase_publishable_key oidc_client_id revision

[ -f "$repo_root/weknora/frontend/dist/index.html" ] || weknora_production_die 'native frontend static build is incomplete'
[ -f "$repo_root/auth/dist/index.html" ] || weknora_production_die 'auth static build is incomplete'
find "$repo_root/weknora/frontend/dist/assets" -type f -name '*.js' -print -quit | grep -q . || weknora_production_die 'native frontend static assets are incomplete'
find "$repo_root/auth/dist/assets" -type f -name '*.js' -print -quit | grep -q . || weknora_production_die 'auth static assets are incomplete'

printf '%s\n' 'native frontend and same-origin auth static bundles built'
