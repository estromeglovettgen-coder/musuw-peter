#!/usr/bin/env bash
# Data-only helpers for the isolated staging deployment. Runtime credentials
# are intentionally never parsed here; only file type, owner, size, and mode
# are inspected. The app entrypoint is the sole credential consumer.
set -euo pipefail

weknora_staging_repo_root() {
    cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P
}

weknora_staging_runtime_dir() {
    local repo_root
    repo_root="$(weknora_staging_repo_root)"
    printf '%s' "${WEKNORA_STAGING_RUNTIME_DIR:-$repo_root/.runtime/weknora-staging}"
}

weknora_staging_die() {
    printf '%s\n' "$1" >&2
    exit 1
}

weknora_staging_require_command() {
    command -v "$1" >/dev/null 2>&1 || weknora_staging_die "required staging command is unavailable: $1"
}

weknora_staging_file_mode() {
    stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"
}

weknora_staging_require_file() {
    [ -f "$1" ] && [ ! -L "$1" ] || weknora_staging_die "required staging input is unavailable or unsafe: $1"
}

weknora_staging_require_runtime_dir() {
    local runtime_dir="$1"
    [ -d "$runtime_dir" ] && [ ! -L "$runtime_dir" ] || weknora_staging_die 'staging runtime directory is unavailable or unsafe'
    [ "$(weknora_staging_file_mode "$runtime_dir")" = 700 ] || weknora_staging_die 'staging runtime directory permissions are unsafe'
}

weknora_staging_require_secret_file() {
    local secret_path="$1"
    local mode
    weknora_staging_require_file "$secret_path"
    [ -O "$secret_path" ] || weknora_staging_die 'staging secret file ownership is unsafe'
    mode="$(weknora_staging_file_mode "$secret_path")"
    [ "$mode" = 600 ] || weknora_staging_die 'staging secret file permissions are unsafe'
    [ -s "$secret_path" ] || weknora_staging_die 'staging secret file is empty'
}

weknora_staging_env_value() {
    local env_file="$1"
    local requested_key="$2"
    awk -v requested_key="$requested_key" '
        /^[[:space:]]*($|#)/ { next }
        /^[A-Za-z_][A-Za-z0-9_]*=/ {
            key = $0
            sub(/=.*/, "", key)
            if (key == requested_key) {
                value = $0
                sub(/^[^=]*=/, "", value)
                print value
                exit
            }
        }
    ' "$env_file"
}

weknora_staging_require_env_value() {
    local env_file="$1"
    local key="$2"
    local value
    value="$(weknora_staging_env_value "$env_file" "$key")"
    [ -n "$value" ] || weknora_staging_die "required staging setting is unavailable: $key"
    printf '%s' "$value"
}

weknora_staging_require_unique_env_keys() {
    local env_file="$1"
    local duplicate
    weknora_staging_require_file "$env_file"
    duplicate="$(awk '
        /^[[:space:]]*($|#)/ { next }
        /^[A-Za-z_][A-Za-z0-9_]*=/ {
            key = $0
            sub(/=.*/, "", key)
            if (seen[key]++) { print key; exit }
        }
    ' "$env_file")"
    [ -z "$duplicate" ] || weknora_staging_die "duplicate staging setting is not allowed: $duplicate"
}

weknora_staging_safe_id() {
    case "$1" in
        ''|*[!A-Za-z0-9._-]*|.*|*-|*.) return 1 ;;
        *..*) return 1 ;;
        *) [ "${#1}" -le 128 ] ;;
    esac
}

weknora_staging_revision() {
    local revision="${WEKNORA_STAGING_REVISION:-${WEKNORA_DEPLOY_REVISION:-${GITHUB_SHA:-}}}"
    local runtime_file repo_root git_revision
    if [ -z "$revision" ]; then
        runtime_file="$(weknora_staging_runtime_dir)/staging.env"
        if [ -r "$runtime_file" ]; then
            revision="$(weknora_staging_env_value "$runtime_file" WEKNORA_STAGING_REVISION || true)"
        fi
    fi
    if [ -z "$revision" ]; then
        repo_root="$(weknora_staging_repo_root)"
        git_revision="$(git -C "$repo_root" rev-parse --verify HEAD 2>/dev/null || true)"
        revision="$git_revision"
    fi
    [ -n "$revision" ] || weknora_staging_die 'staging release revision is unavailable'
    [[ "$revision" =~ ^[0-9a-fA-F]{40}$ ]] || weknora_staging_die 'staging release revision must be a full 40-character SHA'
    printf '%s' "$revision" | tr '[:upper:]' '[:lower:]'
}

weknora_staging_require_clean_checkout() {
    local repo_root="$1"
    local expected_revision="$2"
    local checkout_root head status_line status_code relative
    [ -d "$repo_root" ] || weknora_staging_die 'staging source checkout is unavailable'
    [ "$(git -C "$repo_root" rev-parse --is-inside-work-tree 2>/dev/null || true)" = true ] ||
        weknora_staging_die 'staging source must be a Git worktree'
    checkout_root="$(git -C "$repo_root" rev-parse --show-toplevel 2>/dev/null || true)"
    checkout_root="$(cd "$checkout_root" && pwd -P)"
    repo_root="$(cd "$repo_root" && pwd -P)"
    [ "$checkout_root" = "$repo_root" ] || weknora_staging_die 'staging source path is not the Git checkout root'
    [[ "$expected_revision" =~ ^[0-9a-fA-F]{40}$ ]] || weknora_staging_die 'staging source revision is unsafe'
    head="$(git -C "$repo_root" rev-parse --verify HEAD 2>/dev/null || true)"
    [ "$head" = "$expected_revision" ] || weknora_staging_die 'staging Git HEAD does not match requested SHA'
    if ! git -C "$repo_root" diff --quiet --ignore-submodules HEAD -- \
        . ':(exclude)**/dist/**' ':(exclude)**/node_modules/**' ':(exclude)**/.vite/**'; then
        weknora_staging_die 'staging Git checkout has modified tracked source'
    fi
    if ! git -C "$repo_root" diff --cached --quiet --ignore-submodules -- \
        . ':(exclude)**/dist/**' ':(exclude)**/node_modules/**' ':(exclude)**/.vite/**'; then
        weknora_staging_die 'staging Git index has staged source changes'
    fi
    while IFS= read -r status_line; do
        [ -n "$status_line" ] || continue
        status_code="${status_line:0:2}"
        relative="${status_line:3}"
        if [ "$status_code" = '??' ]; then
            case "$relative" in
                weknora/frontend/dist|weknora/frontend/dist/*|auth/dist|auth/dist/*|*/node_modules|*/node_modules/*|*/.vite|*/.vite/*) continue ;;
            esac
        fi
        weknora_staging_die "staging Git checkout has untracked or changed content: $relative"
    done < <(git -C "$repo_root" status --porcelain=v1 --untracked-files=all)
}

weknora_staging_require_immutable_image() {
    local image="$1"
    [[ "$image" =~ ^ghcr\.io/estromeglovettgen-coder/musuw-(app|frontend)@sha256:[0-9a-fA-F]{64}$ ]] ||
        weknora_staging_die 'staging image must be an approved immutable GHCR digest'
}

weknora_staging_assert_volume() {
    local value="$1"
    case "$value" in
        weknora-v072-staging-*) ;;
        *) weknora_staging_die 'staging volume target is not isolated from production' ;;
    esac
}
