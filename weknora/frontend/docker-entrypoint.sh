#!/bin/sh
set -eu

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

# Runtime values are public browser coordinates only. Keep the accepted
# character set narrower than JavaScript string syntax so this shell can emit
# config.js without evaluating or interpolating an operator-controlled value.
require_public_value() {
  value_name="$1"
  value="$2"
  [ -n "$value" ] || fail "required public runtime value is unavailable"
  if ! printf '%s' "$value" | LC_ALL=C awk '
    length($0) > 0 && length($0) <= 4096 &&
      $0 !~ /[^!-~]/ && $0 !~ /["\\<>[:space:]]/ { valid = 1 }
    END { exit valid ? 0 : 1 }
  '; then
    fail "public runtime value is unsafe"
  fi
  # Keep the local variable name used for diagnostics out of the generated
  # browser file; the value itself is never logged.
  : "$value_name"
}

deployment_environment="${MUSUW_DEPLOYMENT_ENVIRONMENT:-production}"
case "$deployment_environment" in
  production|staging) ;;
  *) fail "deployment environment is invalid" ;;
esac

auth_public_origin="${MUSUW_AUTH_PUBLIC_ORIGIN:-}"
supabase_url="${MUSUW_SUPABASE_URL:-}"
supabase_publishable_key="${MUSUW_SUPABASE_PUBLISHABLE_KEY:-}"
weknora_oauth_client_id="${MUSUW_WEKNORA_OAUTH_CLIENT_ID:-}"
require_public_value public_origin "$auth_public_origin"
require_public_value supabase_url "$supabase_url"
require_public_value supabase_publishable_key "$supabase_publishable_key"
require_public_value weknora_oauth_client_id "$weknora_oauth_client_id"

case "$auth_public_origin" in
  https://app.musuw.com|https://staging.musuw.com|http://localhost:4190|http://127.0.0.1:4190) ;;
  *) fail "public runtime origin is invalid" ;;
esac

if ! printf '%s' "$supabase_url" | LC_ALL=C awk '
  $0 ~ /^https:\/\/[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]+)?$/ ||
  $0 ~ /^http:\/\/(localhost|127\.0\.0\.1)(:[0-9]+)?$/ { valid = 1 }
  END { exit valid ? 0 : 1 }
'; then
  fail "public runtime identity URL is invalid"
fi

max_file_size_mb="${MAX_FILE_SIZE_MB:-50}"
case "$max_file_size_mb" in
  ''|*[!0-9]*) fail "maximum file size is invalid" ;;
esac

# Only emit whitelisted locale tags to avoid config.js injection from env values.
runtime_default_locale=""
case "${DEFAULT_LOCALE:-}" in
  zh-CN|en-US|ru-RU|ko-KR) runtime_default_locale="${DEFAULT_LOCALE}" ;;
esac

# This file is intentionally the sole public runtime seam shared by the
# native frontend and auth shell. Values have passed the strict serializer
# guard above and contain no server-side provider material.
cat > /usr/share/nginx/html/config.js <<EOF
window.__RUNTIME_CONFIG__ = {
  MAX_FILE_SIZE_MB: ${max_file_size_mb},
  auth: {
    publicOrigin: "${auth_public_origin}",
    supabaseUrl: "${supabase_url}",
    publishableKey: "${supabase_publishable_key}",
    weknoraOAuthClientId: "${weknora_oauth_client_id}"
  },
  DEFAULT_LOCALE: "${runtime_default_locale}"
};
EOF

# Nginx add_header directives are not inherited when a location declares any
# own header. Include this generated file in every relevant location instead
# of relying on server-level inheritance.
noindex_file=/etc/nginx/musuw-noindex.conf
if [ "$deployment_environment" = staging ]; then
  printf '%s\n' 'add_header X-Robots-Tag "noindex, nofollow" always;' > "$noindex_file"
else
  : > "$noindex_file"
fi

export MAX_FILE_SIZE="${max_file_size_mb}M"
export APP_HOST="${APP_HOST:-app}"
export APP_PORT="${APP_PORT:-8080}"
export APP_SCHEME="${APP_SCHEME:-http}"
envsubst '${MAX_FILE_SIZE} ${APP_HOST} ${APP_PORT} ${APP_SCHEME}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
