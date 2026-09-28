#!/usr/bin/env bash
# Clone the completed v0.7.2 migration rehearsal into fresh candidate volumes.
# The rehearsal volumes are mounted read-only and are never attached to a
# service in this project. A failed copy leaves an incomplete, clearly labelled
# target rather than overwriting it on retry.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
candidate_env="$repo_root/.runtime/weknora/candidate.env"
rehearsal_postgres="${WEKNORA_REHEARSAL_POSTGRES_VOLUME:-musnow-weknora-v072-rehearsal-20260814-postgres-data}"
rehearsal_files="${WEKNORA_REHEARSAL_FILES_VOLUME:-musnow-weknora-v072-rehearsal-20260814-data-files}"

if [ ! -r "$candidate_env" ]; then
    printf '%s\n' 'run scripts/weknora-candidate/prepare-runtime.sh first' >&2
    exit 1
fi

candidate_postgres="$(awk -F= '/^WEKNORA_CANDIDATE_POSTGRES_VOLUME=/{print $2; exit}' "$candidate_env")"
candidate_files="$(awk -F= '/^WEKNORA_CANDIDATE_FILES_VOLUME=/{print $2; exit}' "$candidate_env")"

for target in "$candidate_postgres" "$candidate_files"; do
    case "$target" in
        weknora-v072-candidate-*) ;;
        *)
            printf '%s\n' 'candidate clone target is not an isolated candidate volume' >&2
            exit 1
            ;;
    esac
done

for source in "$rehearsal_postgres" "$rehearsal_files"; do
    case "$source" in
        musnow-weknora-v072-rehearsal-20260814-*) ;;
        *)
            printf '%s\n' 'candidate clone source is not the approved migration rehearsal volume' >&2
            exit 1
            ;;
    esac
    if ! docker volume inspect "$source" >/dev/null; then
        printf '%s\n' 'candidate migration rehearsal volume is unavailable' >&2
        exit 1
    fi
    if [ "$(docker volume inspect "$source" --format '{{ index .Labels "com.musnow.purpose" }}')" != 'weknora-v072-migration-rehearsal' ]; then
        printf '%s\n' 'candidate clone source is missing the migration rehearsal label' >&2
        exit 1
    fi
    if [ -n "$(docker ps -q --filter "volume=$source")" ]; then
        printf '%s\n' 'candidate migration rehearsal volume is currently attached to a running container' >&2
        exit 1
    fi
done

clone_volume() {
    local source="$1"
    local target="$2"
    local source_files source_bytes source_manifest
    local target_files target_bytes target_manifest

    if docker volume inspect "$target" >/dev/null 2>&1; then
        if [ "$(docker volume inspect "$target" --format '{{ index .Labels "com.musnow.purpose" }}')" != 'weknora-v072-candidate-clone' ] ||
           [ "$(docker volume inspect "$target" --format '{{ index .Labels "com.musnow.clone-source" }}')" != "$source" ]; then
            printf '%s\n' 'candidate clone target exists with an unexpected identity' >&2
            exit 1
        fi
    else
        docker volume create \
            --label com.musnow.purpose=weknora-v072-candidate-clone \
            --label "com.musnow.clone-source=$source" \
            "$target" >/dev/null

        # Source is explicitly read-only; target was just created and is the
        # only write destination. tar preserves numeric ownership required by
        # Postgres.
        docker run --rm \
            --mount "type=volume,src=$source,dst=/source,readonly" \
            --mount "type=volume,src=$target,dst=/target" \
            alpine:3.20 sh -ec '
                cd /source
                tar -cpf - . | tar -xpf - -C /target
            '
    fi

    source_files="$(docker run --rm --mount "type=volume,src=$source,dst=/volume,readonly" alpine:3.20 sh -ec 'find /volume -xdev -type f | wc -l')"
    source_bytes="$(docker run --rm --mount "type=volume,src=$source,dst=/volume,readonly" alpine:3.20 sh -ec "find /volume -xdev -type f -exec stat -c %s {} + | awk '{total += \$1} END {print total + 0}'")"
    source_manifest="$(docker run --rm --mount "type=volume,src=$source,dst=/volume,readonly" alpine:3.20 sh -ec 'cd /volume && find . -xdev -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d" " -f1')"
    target_files="$(docker run --rm --mount "type=volume,src=$target,dst=/volume,readonly" alpine:3.20 sh -ec 'find /volume -xdev -type f | wc -l')"
    target_bytes="$(docker run --rm --mount "type=volume,src=$target,dst=/volume,readonly" alpine:3.20 sh -ec "find /volume -xdev -type f -exec stat -c %s {} + | awk '{total += \$1} END {print total + 0}'")"
    target_manifest="$(docker run --rm --mount "type=volume,src=$target,dst=/volume,readonly" alpine:3.20 sh -ec 'cd /volume && find . -xdev -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d" " -f1')"

    if [ "$source_files" != "$target_files" ] ||
       [ "$source_bytes" != "$target_bytes" ] ||
       [ "$source_manifest" != "$target_manifest" ]; then
        printf '%s\n' 'candidate clone verification did not match the rehearsal source' >&2
        exit 1
    fi
    printf '%s\n' "candidate clone verified: $source_files files, $source_bytes logical bytes, manifest $source_manifest"
}

clone_volume "$rehearsal_postgres" "$candidate_postgres"
clone_volume "$rehearsal_files" "$candidate_files"

printf '%s\n' 'candidate rehearsal clone is green; sources remained read-only'
