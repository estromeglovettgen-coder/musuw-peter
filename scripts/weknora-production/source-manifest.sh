#!/usr/bin/env bash
# Generate, verify and materialise the allowlisted source bundle used by the
# runner -> server release seam.  A full release never copies the worktree
# directly: materialize() first creates a fresh tree from tracked Git files
# and the two public runtime inputs. GitHub-built browser output stays in GHCR.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
. "$script_dir/lib.sh"

fail() {
    weknora_production_die "$1"
}

manifest_path() {
    case "$1" in
        weknora/docker-compose.yml|weknora/config/config.yaml|weknora/docker/searxng/settings.yml|\
        integration/weknora-production/*|scripts/weknora-production/*|\
        scripts/weknora/paddle-ip-allowlist.sh|\
        deploy/production.public.env|deploy/auth-public.env) ;;
        *) fail 'source manifest contains a path outside the production allowlist' ;;
    esac
}

line_path() {
    local line="$1"
    local checksum
    checksum="${line%%  *}"
    [ "$checksum" != "$line" ] || fail 'source bundle checksum line is malformed'
    printf '%s' "${line#"$checksum  "}"
}

line_checksum() {
    local line="$1"
    printf '%s' "${line%%  *}"
}

require_regular_file() {
    local path="$1"
    local label="${2:-source input}"
    [ -f "$path" ] && [ ! -L "$path" ] || fail "$label is unavailable or unsafe: $path"
}

require_regular_tree() {
    local directory="$1"
    local label="${2:-source tree}"
    [ -d "$directory" ] && [ ! -L "$directory" ] || fail "$label is unavailable or unsafe: $directory"
    while IFS= read -r -d '' path; do
        if [ -L "$path" ]; then
            fail "$label contains a symbolic link: ${path#"$directory/"}"
        fi
        if [ ! -f "$path" ] && [ ! -d "$path" ]; then
            fail "$label contains a special file: ${path#"$directory/"}"
        fi
    done < <(find "$directory" -mindepth 1 -print0)
}

append_tracked_paths() {
    local prefix="$1"
    local path_list="$2"
    local relative source_path
    while IFS= read -r -d '' relative; do
        case "$relative" in
            */node_modules|*/node_modules/*|*/.vite|*/.vite/*|*/dist|*/dist/*) continue ;;
            # Runtime/env/dump material is never a source input.  The only
            # accepted env files are the versioned examples at these roots.
            weknora/.env.example|auth/.env.example) ;;
            */.env|*/.env.*|*.env|*.env.*|*/.dump|*.dump) continue ;;
            weknora/server|weknora/server/*|weknora/desktop|weknora/desktop/*|weknora/WeKnora|weknora/WeKnora/*) continue ;;
        esac
        case "$relative" in *$'\n'*) fail 'source manifest cannot encode a filename containing a newline' ;; esac
        source_path="$repo_root/$relative"
        require_regular_file "$source_path" 'tracked source input'
        printf '%s\n' "$relative" >> "$path_list"
    done < <(git -C "$repo_root" ls-files -z -- "$prefix")
}

source_path_for() {
    local relative="$1"
    case "$relative" in
        deploy/production.public.env) printf '%s/production.public.env' "$runner_runtime" ;;
        deploy/auth-public.env) printf '%s/auth-public.env' "$runner_runtime" ;;
        *) printf '%s/%s' "$repo_root" "$relative" ;;
    esac
}

generate_manifest() {
    [ "$#" -eq 6 ] || fail 'usage: source-manifest.sh generate <repo-root> <runner-runtime-dir> <release-id> <revision> <mode> <output-dir>'
    repo_root="$(cd "$1" && pwd -P)"
    runner_runtime="$(cd "$2" && pwd -P)"
    release_id="$3"
    revision="$4"
    mode="$5"
    output_dir="$6"
    weknora_production_safe_id "$release_id" || fail 'source manifest release id is unsafe'
    if [ "$revision" != 'local' ]; then
        [[ "$revision" =~ ^[0-9a-fA-F]+$ ]] || fail 'source manifest revision is unsafe'
        case "${#revision}" in
            40) ;;
            *) fail 'source manifest revision must be a full 40-character Git SHA' ;;
        esac
    fi
    [ "$mode" = update ] || fail 'source manifest mode is unsafe'
    [ -d "$repo_root" ] || fail 'source manifest repository root is unavailable'
    [ -d "$runner_runtime" ] || fail 'source manifest runner runtime directory is unavailable'
    [ "$(git -C "$repo_root" rev-parse --is-inside-work-tree 2>/dev/null || true)" = true ] || \
        fail 'source manifest repository root must be a Git worktree'
    mkdir -p "$output_dir"
    chmod 700 "$output_dir"

    path_list="$output_dir/.source-paths.$$"
    manifest_file="$output_dir/source-manifest.sha256"
    : > "$path_list"
    : > "$manifest_file"
    chmod 600 "$manifest_file"

    # Application and browser code is already bound to the approved revision
    # inside the two immutable GHCR images. The server release tree therefore
    # carries only the Compose/runtime inputs that the native release helper
    # reads. Keeping that boundary explicit avoids copying a second, unused
    # copy of the full application over the restricted SSH seam.
    append_tracked_paths weknora/docker-compose.yml "$path_list"
    append_tracked_paths weknora/config/config.yaml "$path_list"
    append_tracked_paths weknora/docker/searxng/settings.yml "$path_list"
    append_tracked_paths integration/weknora-production "$path_list"
    append_tracked_paths scripts/weknora-production "$path_list"
    printf '%s\n' scripts/weknora/paddle-ip-allowlist.sh >> "$path_list"

    printf '%s\n' deploy/production.public.env deploy/auth-public.env >> "$path_list"

    while IFS= read -r relative; do
        [ -n "$relative" ] || continue
        manifest_path "$relative"
        case "$relative" in
            deploy/production.public.env|deploy/auth-public.env) ;;
            *) require_regular_file "$(source_path_for "$relative")" 'source manifest input' ;;
        esac
    done < <(LC_ALL=C sort -u "$path_list")

    while IFS= read -r relative; do
        [ -n "$relative" ] || continue
        source_path="$(source_path_for "$relative")"
        require_regular_file "$source_path" 'source manifest input'
        source_hash="$(sha256sum "$source_path" | awk '{print $1}')"
        printf '%s  %s\n' "$source_hash" "$relative" >> "$manifest_file"
    done < <(LC_ALL=C sort -u "$path_list")
    rm -f "$path_list"

    LC_ALL=C sort -k2,2 "$manifest_file" -o "$manifest_file"
    source_bundle_sha256="$(sha256sum "$manifest_file" | awk '{print $1}')"
    source_file_count="$(wc -l < "$manifest_file" | tr -d ' ')"
    source_bytes=0
    while IFS= read -r line; do
        [ -n "$line" ] || continue
        relative="$(line_path "$line")"
        source_path="$(source_path_for "$relative")"
        bytes="$(wc -c < "$source_path" | tr -d ' ')"
        source_bytes=$((source_bytes + bytes))
    done < "$manifest_file"
    jq -n \
        --arg schema 'musuw.source-bundle.v1' \
        --arg release_id "$release_id" \
        --arg revision "$revision" \
        --arg mode "$mode" \
        --arg source_bundle_sha256 "$source_bundle_sha256" \
        --argjson file_count "$source_file_count" \
        --argjson bytes "$source_bytes" \
        '{schema_version:$schema,release_id:$release_id,revision:$revision,mode:$mode,source_bundle_sha256:$source_bundle_sha256,source_file_count:$file_count,source_bytes:$bytes}' \
        > "$output_dir/release-manifest.json"
    chmod 600 "$output_dir/release-manifest.json"
    sha256sum "$output_dir/release-manifest.json" > "$output_dir/release-manifest.json.sha256"
    chmod 600 "$output_dir/release-manifest.json.sha256"
    printf '%s\n' "$source_bundle_sha256"
}

materialize_tree() {
    [ "$#" -eq 7 ] || fail 'usage: source-manifest.sh materialize <repo-root> <runner-runtime-dir> <release-id> <revision> <mode> <output-dir> <tree-dir>'
    repo_root="$(cd "$1" && pwd -P)"
    runner_runtime="$(cd "$2" && pwd -P)"
    release_id="$3"
    revision="$4"
    mode="$5"
    output_dir="$6"
    tree_dir="$7"
    [ ! -e "$tree_dir" ] || fail 'materialized deploy tree already exists'
    # A full release is defined by the immutable clean checkout, not by the
    # current mutable index/worktree. This catches modified/staged/revision
    # mismatch even when the helper is called directly in a test or workflow.
    [ "$mode" = update ] || fail 'unsupported source release materialization mode'
    weknora_production_require_clean_checkout "$repo_root" "$revision"
    mkdir -p "$tree_dir"
    chmod 700 "$tree_dir"
    generate_manifest "$repo_root" "$runner_runtime" "$release_id" "$revision" "$mode" "$output_dir" >/dev/null

    while IFS= read -r line; do
        [ -n "$line" ] || continue
        relative="$(line_path "$line")"
        manifest_path "$relative"
        source_path="$(source_path_for "$relative")"
        require_regular_file "$source_path" 'materialized source input'
        destination="$tree_dir/$relative"
        mkdir -p "$(dirname "$destination")"
        cp -p "$source_path" "$destination"
        [ -f "$destination" ] && [ ! -L "$destination" ] || fail "materialized source input is unsafe: $relative"
    done < "$output_dir/source-manifest.sha256"

    mkdir -p "$tree_dir/deploy"
    cp -p "$output_dir/source-manifest.sha256" "$tree_dir/deploy/source-manifest.sha256"
    cp -p "$output_dir/release-manifest.json" "$tree_dir/deploy/release-manifest.json"
    cp -p "$output_dir/release-manifest.json.sha256" "$tree_dir/deploy/release-manifest.json.sha256"
    require_regular_tree "$tree_dir" 'materialized deploy tree'
    bundle_hash="$(sha256sum "$tree_dir/deploy/source-manifest.sha256" | awk '{print $1}')"
    printf '%s\n' "$bundle_hash"
}

verify_tree_has_no_unmanifested_files() {
    local source_root="$1"
    local manifest_file="$source_root/deploy/source-manifest.sha256"
    local path relative
    while IFS= read -r -d '' path; do
        relative="${path#"$source_root/"}"
        case "$relative" in
            deploy/source-manifest.sha256|deploy/release-manifest.json|deploy/release-manifest.json.sha256) continue ;;
        esac
        grep -Fqx "$(grep -F "  $relative" "$manifest_file" || true)" "$manifest_file" 2>/dev/null || {
            # Avoid a substring match: compare the path field line by line.
            listed=false
            while IFS= read -r manifest_line; do
                [ "$(line_path "$manifest_line")" = "$relative" ] && listed=true && break
            done < "$manifest_file"
            [ "$listed" = true ] || fail "source bundle contains an unmanifested file: $relative"
        }
    done < <(find "$source_root" -type f -print0)
}

verify_manifest() {
    [ "$#" -eq 1 ] || fail 'usage: source-manifest.sh verify <release-source-root>'
    repo_root="$(cd "$1" && pwd -P)"
    manifest_file="$repo_root/deploy/source-manifest.sha256"
    metadata_file="$repo_root/deploy/release-manifest.json"
    weknora_production_require_file "$manifest_file"
    weknora_production_require_file "$metadata_file"
    require_regular_tree "$repo_root" 'release source'
    verify_tree_has_no_unmanifested_files "$repo_root"
    expected_bundle_sha256="$(jq -er '.source_bundle_sha256 | strings | select(test("^[0-9a-f]{64}$"))' "$metadata_file")"
    actual_bundle_sha256="$(sha256sum "$manifest_file" | awk '{print $1}')"
    [ "$expected_bundle_sha256" = "$actual_bundle_sha256" ] || fail 'source bundle checksum does not match its release manifest'
    expected_release_id="$(jq -er '.release_id | strings' "$metadata_file")"
    actual_release_id="$(basename "$(dirname "$repo_root")")"
    [ "$expected_release_id" = "$actual_release_id" ] || fail 'source bundle release identity does not match its directory'
    expected_revision="$(jq -er '.revision | strings' "$metadata_file")"
    selected_revision="$(weknora_production_revision)"
    [ "$expected_revision" = "$selected_revision" ] || fail 'source bundle revision does not match the selected release revision'
    expected_count="$(jq -er '.source_file_count | numbers' "$metadata_file")"
    actual_count="$(wc -l < "$manifest_file" | tr -d ' ')"
    [ "$expected_count" = "$actual_count" ] || fail 'source bundle file count does not match its release manifest'

    actual_bytes=0
    while IFS= read -r line; do
        [ -n "$line" ] || continue
        checksum="$(line_checksum "$line")"
        relative="$(line_path "$line")"
        [[ "$checksum" =~ ^[0-9a-fA-F]{64}$ ]] || fail 'source bundle checksum is malformed'
        manifest_path "$relative"
        source_path="$repo_root/$relative"
        require_regular_file "$source_path" 'source bundle input'
        actual_checksum="$(sha256sum "$source_path" | awk '{print $1}')"
        [ "$checksum" = "$actual_checksum" ] || fail "source bundle checksum mismatch: $relative"
        bytes="$(wc -c < "$source_path" | tr -d ' ')"
        actual_bytes=$((actual_bytes + bytes))
    done < "$manifest_file"
    expected_bytes="$(jq -er '.source_bytes | numbers' "$metadata_file")"
    [ "$expected_bytes" = "$actual_bytes" ] || fail 'source bundle byte count does not match its release manifest'
    printf '%s\n' "$expected_bundle_sha256"
}

case "${1:-}" in
    generate) shift; generate_manifest "$@" ;;
    materialize) shift; materialize_tree "$@" ;;
    verify) shift; verify_manifest "$@" ;;
    *) fail 'usage: source-manifest.sh generate|materialize|verify ...' ;;
esac
