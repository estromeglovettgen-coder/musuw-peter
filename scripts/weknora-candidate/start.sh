#!/usr/bin/env bash
# Build and start only after the isolated candidate preflight passes.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

"$repo_root/scripts/weknora-candidate/prepare-runtime.sh"
"$repo_root/scripts/weknora-candidate/build-auth-shell.sh"
"$repo_root/scripts/weknora-candidate/verify-topology.sh"
"$repo_root/scripts/weknora-candidate/clone-rehearsal-volumes.sh"
"$repo_root/scripts/weknora-candidate/compose.sh" build frontend app
"$repo_root/scripts/weknora-candidate/compose.sh" up -d
"$repo_root/scripts/weknora-candidate/verify-runtime.sh"
