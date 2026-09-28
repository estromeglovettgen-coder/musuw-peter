#!/usr/bin/env bash
# Synthetic command fixture for the staging host-capacity guard. It exercises
# the positive path, the allowed successful searxng init one-shot, and the
# fail-closed restart threshold without contacting Docker or production.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
preflight="$script_dir/capacity-preflight.sh"
root_dir="$(mktemp -d "${TMPDIR:-/tmp}/musuw-staging-capacity.XXXXXX")"
trap 'find "$root_dir" -depth -delete 2>/dev/null || true' EXIT
fail() { printf '%s\n' "$1" >&2; exit 1; }

meminfo="$root_dir/meminfo"
cat > "$meminfo" <<'EOF'
MemTotal:       3670016 kB
MemAvailable:   1048576 kB
SwapTotal:      1048576 kB
SwapFree:        524288 kB
EOF

docker_fixture="$root_dir/docker"
cat > "$docker_fixture" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
case "${1:-}" in
    ps)
        cat <<'NAMES'
weknora-v072-production-app
weknora-v072-production-frontend
weknora-v072-production-postgres
weknora-v072-production-redis
weknora-v072-production-searxng-init
NAMES
        ;;
    inspect)
        container="${2:?container}"
        case "$container" in
            weknora-v072-production-app|weknora-v072-production-frontend|weknora-v072-production-postgres)
                printf '%s\n' 'running|healthy|false|0|0' ;;
            weknora-v072-production-redis)
                printf '%s\n' "running|none|false|${FAKE_REDIS_RESTARTS:-1}|0" ;;
            weknora-v072-production-searxng-init)
                printf '%s\n' 'exited|none|false|0|0' ;;
            *) exit 1 ;;
        esac
        ;;
    *) exit 1 ;;
esac
EOF
chmod 755 "$docker_fixture"

WEKNORA_STAGING_CAPACITY_TEST_MODE=1 \
WEKNORA_STAGING_CAPACITY_DOCKER_BIN="$docker_fixture" \
WEKNORA_STAGING_CAPACITY_MEMINFO="$meminfo" \
    "$preflight" >/dev/null

if FAKE_REDIS_RESTARTS=4 \
    WEKNORA_STAGING_CAPACITY_TEST_MODE=1 \
    WEKNORA_STAGING_CAPACITY_DOCKER_BIN="$docker_fixture" \
    WEKNORA_STAGING_CAPACITY_MEMINFO="$meminfo" \
        "$preflight" >/dev/null 2>&1; then
    fail 'staging capacity preflight accepted an excessive production restart count'
fi

printf '%s\n' 'staging capacity preflight fixture green'
