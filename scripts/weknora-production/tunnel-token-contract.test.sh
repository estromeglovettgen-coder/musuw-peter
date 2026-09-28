#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
installer="$repo_root/scripts/weknora-production/install-tunnel-token.sh"

fail() {
    printf '%s\n' "$1" >&2
    exit 1
}

[ -x "$installer" ] || fail 'tunnel token installer is missing or not executable'
grep -Fq 'WEKNORA_PRODUCTION_TUNNEL_TOKEN_PATH:-/opt/weknora/tunnel/tunnel_token' "$installer" || \
    fail 'tunnel token installer does not keep the server-owned token path'
grep -Fq 'cloudflared_uid=65532' "$installer" || \
    fail 'tunnel token installer does not pin the cloudflared runtime UID'
grep -Fq 'chmod 600' "$installer" || fail 'tunnel token installer does not enforce mode 0600'
grep -Fq 'chown "$cloudflared_uid:$cloudflared_uid"' "$installer" || \
    fail 'tunnel token installer does not assign ownership to cloudflared UID'
grep -Fq '[ "$owner_uid" = "$cloudflared_uid" ]' "$installer" || \
    fail 'tunnel token installer does not verify cloudflared owner UID'
grep -Fq '[ "$owner_gid" = "$cloudflared_uid" ]' "$installer" || \
    fail 'tunnel token installer does not verify cloudflared group GID'
grep -Fq '[ "$mode" = '"'"'600'"'"' ]' "$installer" || \
    fail 'tunnel token installer does not verify mode 0600 after chown'
grep -Fq '[ "$dir_mode" = '"'"'700'"'"' ]' "$installer" || \
    fail 'tunnel token installer does not verify private token directory mode'
grep -Fq 'reject symlink' "$installer" || fail 'tunnel token installer does not reject symlinked token paths'
if grep -Eq 'cat[[:space:]].*tunnel_token|printf[[:space:]].*token_path' "$installer"; then
    fail 'tunnel token installer may print a credential value'
fi

printf '%s\n' 'production tunnel token permission contract passed'
