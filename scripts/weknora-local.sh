#!/usr/bin/env bash
# One operator interface for the production-equivalent local WeKnora stack.
# It delegates topology, runtime and verification to the existing candidate
# scripts; named volumes are never removed by this interface.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
candidate_dir="$repo_root/scripts/weknora-candidate"
compose="$candidate_dir/compose.sh"

usage() {
    cat <<'EOF'
Usage: scripts/weknora-local.sh <command> [service]

Commands:
  up                 Start the existing local build on http://localhost:4190
  rebuild            Rebuild frontend, auth and app from local source, then start
  down               Stop local containers; keep all named volumes
  logs [service]     Follow all logs, or one service's logs
  status             Show local container status and the fixed test URL
EOF
}

prepare_local() {
    "$candidate_dir/prepare-local-runtime.sh"
    "$candidate_dir/verify-topology.sh"
}

start_and_verify() {
    "$compose" up -d --no-build
    # Nginx resolves the app service when it starts. Recreate only the local
    # frontend after an app container replacement so it cannot retain the old
    # container IP and return a transient 502.
    "$compose" up -d --no-build --no-deps --force-recreate frontend
    "$candidate_dir/verify-runtime.sh"
    printf '%s\n' 'local WeKnora is ready at http://localhost:4190'
}

command_name="${1:-}"
case "$command_name" in
    up)
        [ "$#" -eq 1 ] || { usage >&2; exit 2; }
        prepare_local
        start_and_verify
        ;;
    rebuild)
        [ "$#" -eq 1 ] || { usage >&2; exit 2; }
        "$candidate_dir/prepare-local-runtime.sh"
        (cd "$repo_root/weknora/frontend" && npm run build)
        "$candidate_dir/build-auth-shell.sh"
        "$candidate_dir/verify-topology.sh"
        "$compose" build frontend app
        start_and_verify
        ;;
    down)
        [ "$#" -eq 1 ] || { usage >&2; exit 2; }
        "$compose" stop
        printf '%s\n' 'local WeKnora stopped; named volumes were preserved'
        ;;
    logs)
        if [ "$#" -gt 2 ]; then
            usage >&2
            exit 2
        fi
        if [ "$#" -eq 2 ]; then
            "$compose" logs --follow --tail=200 "$2"
        else
            "$compose" logs --follow --tail=200
        fi
        ;;
    status)
        [ "$#" -eq 1 ] || { usage >&2; exit 2; }
        "$compose" ps
        printf '%s\n' 'local test URL: http://localhost:4190 (app health: http://localhost:18090/health)'
        ;;
    -h|--help|help)
        usage
        ;;
    *)
        usage >&2
        exit 2
        ;;
esac
