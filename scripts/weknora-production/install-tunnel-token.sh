#!/usr/bin/env bash
# Apply the least-privilege ownership required by the non-root cloudflared
# image. The token value is never read, copied, or printed.
set -euo pipefail

die() {
    printf '%s\n' "$1" >&2
    exit 1
}

token_path="${WEKNORA_PRODUCTION_TUNNEL_TOKEN_PATH:-/opt/weknora/tunnel/tunnel_token}"
cloudflared_uid=65532
[ "$(id -u)" -eq 0 ] || die 'tunnel token permissions require root'
[ -e "$token_path" ] || die 'tunnel token file is missing'
[ -L "$token_path" ] && die 'reject symlinked token path'
[ -f "$token_path" ] || die 'tunnel token path is not a regular file'
[ -s "$token_path" ] || die 'tunnel token file is empty'

token_dir="$(dirname "$token_path")"
[ -d "$token_dir" ] || die 'tunnel token directory is missing'

file_mode() {
    if stat -c '%a' "$1" >/dev/null 2>&1; then
        stat -c '%a' "$1"
    else
        stat -f '%Lp' "$1"
    fi
}

dir_mode="$(file_mode "$token_dir")"
[ "$dir_mode" = '700' ] || die 'tunnel token directory mode must be 0700'

chown "$cloudflared_uid:$cloudflared_uid" "$token_path"
chmod 600 "$token_path"

owner_uid="$(stat -c '%u' "$token_path" 2>/dev/null || stat -f '%u' "$token_path")"
owner_gid="$(stat -c '%g' "$token_path" 2>/dev/null || stat -f '%g' "$token_path")"
mode="$(file_mode "$token_path")"
[ "$owner_uid" = "$cloudflared_uid" ] || die 'tunnel token owner UID is not cloudflared'
[ "$owner_gid" = "$cloudflared_uid" ] || die 'tunnel token owner GID is not cloudflared'
[ "$mode" = '600' ] || die 'tunnel token mode is not 0600'

printf '%s\n' "production tunnel token permissions prepared: uid=$owner_uid gid=$owner_gid mode=$mode"
