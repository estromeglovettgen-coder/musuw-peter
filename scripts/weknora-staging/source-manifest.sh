#!/usr/bin/env bash
# Generate and verify the small source bundle required by staging Compose.
# Application and browser code stay in the immutable GHCR images; this bundle
# contains only reviewed runtime wiring, the reused native service entrypoints, and the
# two public environment files.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
. "$script_dir/lib.sh"

fail() { weknora_staging_die "$1"; }

line_path() {
    local line="$1" checksum
    checksum="${line%%  *}"
    [ "$checksum" != "$line" ] || fail 'staging manifest line is malformed'
    printf '%s' "${line#"$checksum  "}"
}

line_checksum() { printf '%s' "${1%%  *}"; }

manifest_path() {
    case "$1" in
        weknora/docker-compose.yml|weknora/config/config.yaml|\
        weknora/docker/searxng/settings.yml|\
        integration/weknora-production/paddle-runtime-contract.sh|\
        integration/weknora-production/redis-entrypoint.sh|\
        integration/weknora-production/neo4j-entrypoint.sh|\
        integration/weknora-production/searxng-entrypoint.sh|\
        integration/weknora-staging/*|scripts/weknora-staging/*|\
        scripts/weknora/paddle-ip-allowlist.sh|\
        deploy/staging.public.env|deploy/auth-public.env) ;;
        *) fail "staging manifest contains an unallowlisted path: $1" ;;
    esac
}

require_regular_file() {
    [ -f "$1" ] && [ ! -L "$1" ] || fail "staging manifest input is unavailable or unsafe: $1"
}

require_regular_tree() {
    local directory="$1" path
    [ -d "$directory" ] && [ ! -L "$directory" ] || fail 'staging release tree is unavailable or unsafe'
    while IFS= read -r -d '' path; do
        [ ! -L "$path" ] || fail 'staging release tree contains a symbolic link'
        [ -f "$path" ] || [ -d "$path" ] || fail 'staging release tree contains a special file'
    done < <(find "$directory" -mindepth 1 -print0)
}

source_path_for() {
    case "$1" in
        deploy/staging.public.env) printf '%s/staging.public.env' "$runner_runtime" ;;
        deploy/auth-public.env) printf '%s/auth-public.env' "$runner_runtime" ;;
        *) printf '%s/%s' "$repo_root" "$1" ;;
    esac
}

append_tracked_paths() {
    local prefix="$1" output="$2" relative source_path
    while IFS= read -r -d '' relative; do
        case "$relative" in
            */node_modules|*/node_modules/*|*/dist|*/dist/*|*/.vite|*/.vite/*|*/.env|*/.env.*|*.dump|*.dump.*) continue ;;
        esac
        source_path="$repo_root/$relative"
        require_regular_file "$source_path"
        printf '%s\n' "$relative" >> "$output"
    done < <(git -C "$repo_root" ls-files -z -- "$prefix")
}

generate_manifest() {
    [ "$#" -eq 6 ] || fail 'usage: source-manifest.sh generate <repo-root> <runner-runtime> <release-id> <revision> <mode> <output-dir>'
    repo_root="$(cd "$1" && pwd -P)"
    runner_runtime="$(cd "$2" && pwd -P)"
    release_id="$3"
    revision="$4"
    mode="$5"
    output_dir="$6"
    weknora_staging_safe_id "$release_id" || fail 'staging release id is unsafe'
    [[ "$revision" =~ ^[0-9a-fA-F]{40}$ ]] || fail 'staging manifest revision is unsafe'
    [ "$mode" = update ] || fail 'staging manifest mode is unsupported'
    [ -d "$repo_root" ] || fail 'staging repository root is unavailable'
    [ -d "$runner_runtime" ] || fail 'staging runner runtime is unavailable'
    mkdir -p "$output_dir"
    chmod 700 "$output_dir"
    path_list="$output_dir/.source-paths.$$"
    manifest_file="$output_dir/source-manifest.sha256"
    : > "$path_list"
    : > "$manifest_file"
    chmod 600 "$manifest_file"

    append_tracked_paths weknora/docker-compose.yml "$path_list"
    append_tracked_paths weknora/config/config.yaml "$path_list"
    append_tracked_paths weknora/docker/searxng/settings.yml "$path_list"
    append_tracked_paths integration/weknora-production/paddle-runtime-contract.sh "$path_list"
    append_tracked_paths integration/weknora-production/redis-entrypoint.sh "$path_list"
    append_tracked_paths integration/weknora-production/neo4j-entrypoint.sh "$path_list"
    append_tracked_paths integration/weknora-production/searxng-entrypoint.sh "$path_list"
    append_tracked_paths integration/weknora-staging "$path_list"
    append_tracked_paths scripts/weknora-staging "$path_list"
    printf '%s\n' scripts/weknora/paddle-ip-allowlist.sh >> "$path_list"
    printf '%s\n' deploy/staging.public.env deploy/auth-public.env >> "$path_list"

    while IFS= read -r relative; do
        [ -n "$relative" ] || continue
        manifest_path "$relative"
        source_path="$(source_path_for "$relative")"
        require_regular_file "$source_path"
        checksum="$(sha256sum "$source_path" | awk '{print $1}')"
        printf '%s  %s\n' "$checksum" "$relative" >> "$manifest_file"
    done < <(LC_ALL=C sort -u "$path_list")
    rm -f "$path_list"
    LC_ALL=C sort -k2,2 "$manifest_file" -o "$manifest_file"
    source_bundle_sha256="$(sha256sum "$manifest_file" | awk '{print $1}')"
    source_file_count="$(wc -l < "$manifest_file" | tr -d ' ')"
    source_bytes=0
    while IFS= read -r line; do
        [ -n "$line" ] || continue
        relative="$(line_path "$line")"
        source_bytes=$((source_bytes + $(wc -c < "$(source_path_for "$relative")" | tr -d ' ')))
    done < "$manifest_file"
    jq -n \
        --arg schema 'musuw.staging-source-bundle.v1' \
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
    [ "$#" -eq 7 ] || fail 'usage: source-manifest.sh materialize <repo-root> <runner-runtime> <release-id> <revision> <mode> <output-dir> <tree-dir>'
    repo_root="$(cd "$1" && pwd -P)"
    runner_runtime="$(cd "$2" && pwd -P)"
    release_id="$3"
    revision="$4"
    mode="$5"
    output_dir="$6"
    tree_dir="$7"
    [ ! -e "$tree_dir" ] || fail 'staging materialized tree already exists'
    weknora_staging_require_clean_checkout "$repo_root" "$revision"
    mkdir -p "$tree_dir"
    chmod 700 "$tree_dir"
    generate_manifest "$repo_root" "$runner_runtime" "$release_id" "$revision" "$mode" "$output_dir" >/dev/null
    while IFS= read -r line; do
        [ -n "$line" ] || continue
        relative="$(line_path "$line")"
        source_path="$(source_path_for "$relative")"
        destination="$tree_dir/$relative"
        require_regular_file "$source_path"
        mkdir -p "$(dirname "$destination")"
        cp -p "$source_path" "$destination"
        [ -f "$destination" ] && [ ! -L "$destination" ] || fail 'staging materialized input is unsafe'
    done < "$output_dir/source-manifest.sha256"
    mkdir -p "$tree_dir/deploy"
    cp -p "$output_dir/source-manifest.sha256" "$tree_dir/deploy/source-manifest.sha256"
    cp -p "$output_dir/release-manifest.json" "$tree_dir/deploy/release-manifest.json"
    cp -p "$output_dir/release-manifest.json.sha256" "$tree_dir/deploy/release-manifest.json.sha256"
    require_regular_tree "$tree_dir"
    sha256sum "$tree_dir/deploy/source-manifest.sha256" | awk '{print $1}'
}

verify_tree_has_no_unmanifested_files() {
    local source_root="$1" manifest_file="$1/deploy/source-manifest.sha256" path relative listed manifest_line
    while IFS= read -r -d '' path; do
        relative="${path#"$source_root/"}"
        case "$relative" in deploy/source-manifest.sha256|deploy/release-manifest.json|deploy/release-manifest.json.sha256) continue ;; esac
        listed=false
        while IFS= read -r manifest_line; do
            [ "$(line_path "$manifest_line")" = "$relative" ] && listed=true && break
        done < "$manifest_file"
        [ "$listed" = true ] || fail "staging source bundle contains an unmanifested file: $relative"
    done < <(find "$source_root" -type f -print0)
}

verify_manifest() {
    [ "$#" -eq 1 ] || fail 'usage: source-manifest.sh verify <release-source-root>'
    source_root="$(cd "$1" && pwd -P)"
    manifest_file="$source_root/deploy/source-manifest.sha256"
    metadata_file="$source_root/deploy/release-manifest.json"
    weknora_staging_require_file "$manifest_file"
    weknora_staging_require_file "$metadata_file"
    require_regular_tree "$source_root"
    verify_tree_has_no_unmanifested_files "$source_root"
    expected_bundle="$(jq -er '.source_bundle_sha256 | strings | select(test("^[0-9a-f]{64}$"))' "$metadata_file")"
    [ "$expected_bundle" = "$(sha256sum "$manifest_file" | awk '{print $1}')" ] || fail 'staging source bundle checksum mismatch'
    expected_release_id="$(jq -er '.release_id | strings' "$metadata_file")"
    [ "$expected_release_id" = "$(basename "$(dirname "$source_root")")" ] || fail 'staging release identity mismatch'
    expected_revision="$(jq -er '.revision | strings' "$metadata_file")"
    selected_revision="$(weknora_staging_revision)"
    [ "$expected_revision" = "$selected_revision" ] || fail 'staging release revision mismatch'
    expected_count="$(jq -er '.source_file_count | numbers' "$metadata_file")"
    [ "$expected_count" = "$(wc -l < "$manifest_file" | tr -d ' ')" ] || fail 'staging source file count mismatch'
    actual_bytes=0
    while IFS= read -r line; do
        [ -n "$line" ] || continue
        checksum="$(line_checksum "$line")"
        relative="$(line_path "$line")"
        [[ "$checksum" =~ ^[0-9a-fA-F]{64}$ ]] || fail 'staging source checksum is malformed'
        manifest_path "$relative"
        source_path="$source_root/$relative"
        require_regular_file "$source_path"
        [ "$checksum" = "$(sha256sum "$source_path" | awk '{print $1}')" ] || fail "staging source checksum mismatch: $relative"
        actual_bytes=$((actual_bytes + $(wc -c < "$source_path" | tr -d ' ')))
    done < "$manifest_file"
    expected_bytes="$(jq -er '.source_bytes | numbers' "$metadata_file")"
    [ "$expected_bytes" = "$actual_bytes" ] || fail 'staging source byte count mismatch'
    printf '%s\n' "$expected_bundle"
}

case "${1:-}" in
    generate) shift; generate_manifest "$@" ;;
    materialize) shift; materialize_tree "$@" ;;
    verify) shift; verify_manifest "$@" ;;
    *) fail 'usage: source-manifest.sh generate|materialize|verify ...' ;;
esac
