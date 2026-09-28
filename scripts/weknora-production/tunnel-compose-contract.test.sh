#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
compose_file="$repo_root/integration/weknora-production/compose.tunnel.yaml"

[ -f "$compose_file" ] || {
    printf '%s\n' 'production Tunnel Compose definition is missing' >&2
    exit 1
}

grep -Fq 'cloudflare/cloudflared:2026.7.3@sha256:e39ee8da81ad5e05d77f38d2f51c60ca51bf2a8450ac3abab50c17fdb91d91bf' "$compose_file"
grep -Fq -- '--protocol' "$compose_file"
grep -Fq -- 'http2' "$compose_file"
grep -Fq -- '--token-file' "$compose_file"
grep -Fq -- '/run/secrets/tunnel_token' "$compose_file"
grep -Fq 'file: /opt/weknora/tunnel/tunnel_token' "$compose_file"
grep -Fq 'user: "65532:65532"' "$compose_file"
grep -Fq 'name: musnow-production_edge' "$compose_file"
grep -Fq 'external: true' "$compose_file"
grep -Fq 'restart: unless-stopped' "$compose_file"

if grep -Eq '(^|[[:space:]])ports:|TUNNEL_TOKEN|token:[[:space:]]|depends_on:' "$compose_file"; then
    printf '%s\n' 'production Tunnel Compose expands its public or credential surface' >&2
    exit 1
fi

service_count="$(awk '
    /^services:/ { services = 1; next }
    services && /^[^[:space:]]/ { services = 0 }
    services && /^  [A-Za-z0-9_.-]+:$/ { count += 1 }
    END { print count + 0 }
' "$compose_file")"
[ "$service_count" -eq 1 ] || {
    printf '%s\n' 'production Tunnel Compose must contain exactly one service' >&2
    exit 1
}

printf '%s\n' 'production Tunnel Compose contract passed'
