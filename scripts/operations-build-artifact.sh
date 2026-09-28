#!/usr/bin/env bash
# Called only in the GitHub Linux build job, after lockfile-based npm installs.
set -euo pipefail
[ "$#" -eq 2 ] || { echo 'usage: operations-build-artifact.sh FULL_SHA OUTPUT_TGZ' >&2; exit 2; }
revision="$1"
output="$2"
[[ "$revision" =~ ^[0-9a-f]{40}$ ]]
[ "$(git rev-parse HEAD)" = "$revision" ]
[ "$(uname -s)" = Linux ]
[ "$(uname -m)" = x86_64 ]
source_root="$(git rev-parse --show-toplevel)"
bundle="$(mktemp -d)"
trap 'rm -rf -- "$bundle"' EXIT
mkdir -p "$bundle/bin" "$bundle/scripts" "$bundle/weknora/frontend"
cp "$(command -v node)" "$bundle/bin/node"
node_root="$(dirname "$(dirname "$(command -v node)")")"
cp "$node_root/LICENSE" "$bundle/NODE-LICENSE"
cp "$source_root/package.json" "$source_root/package-lock.json" "$bundle/"
cp "$source_root/scripts/musuw-admin-server.mjs" "$bundle/scripts/"
cp -a "$source_root/node_modules" "$bundle/node_modules"
cp -a "$source_root/weknora/frontend/dist" "$bundle/weknora/frontend/dist"
# npm command shims are not runtime imports; omit every link from the artifact.
find "$bundle/node_modules" -type l -delete
[ -f "$bundle/weknora/frontend/dist/operations.html" ]
"$bundle/bin/node" --input-type=module -e "import('file://' + process.argv[2])" verify-import "$bundle/scripts/musuw-admin-server.mjs"
python3 "$source_root/scripts/operations-artifact.py" build "$bundle" "$output" "$revision"
sha256sum "$output"
