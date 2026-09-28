#!/usr/bin/env bash
# The only supported candidate Compose invocation. It deliberately enables
# exactly the native Neo4j and SearXNG profiles, never `full`.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
candidate_env="$repo_root/.runtime/weknora/candidate.env"

if [ ! -r "$candidate_env" ]; then
    printf '%s\n' "run scripts/weknora-candidate/prepare-runtime.sh first" >&2
    exit 1
fi

exec docker compose \
    --project-name weknora-v072-candidate \
    --env-file "$candidate_env" \
    -f "$repo_root/weknora/docker-compose.yml" \
    -f "$repo_root/integration/weknora-candidate/compose.yaml" \
    --profile neo4j \
    --profile searxng \
    "$@"
