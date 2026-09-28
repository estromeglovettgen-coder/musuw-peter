#!/usr/bin/env bash
# Fail-closed host guard for the small Tokyo machine. This reads only host
# memory metadata and Docker container state; it never opens production env or
# secret files. Test-only command/path overrides are accepted behind the
# explicit test-mode flag so the contract can run without Docker.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
. "$script_dir/lib.sh"

die() { weknora_staging_die "$1"; }
is_uint() { [[ "$1" =~ ^[0-9]+$ ]]; }

test_mode=false
if [ "${WEKNORA_STAGING_CAPACITY_TEST_MODE:-0}" = 1 ]; then
    test_mode=true
fi

if [ "$test_mode" = true ]; then
    docker_bin="${WEKNORA_STAGING_CAPACITY_DOCKER_BIN:-}"
    meminfo_path="${WEKNORA_STAGING_CAPACITY_MEMINFO:-}"
else
    docker_bin=''
    meminfo_path='/proc/meminfo'
fi
[ -n "$docker_bin" ] || docker_bin="$(command -v docker || true)"
[ -n "$docker_bin" ] && [ -x "$docker_bin" ] || die 'staging capacity preflight requires Docker'
[ -f "$meminfo_path" ] && [ ! -L "$meminfo_path" ] || die 'staging capacity preflight cannot read host memory metadata'

minimum_available_kib="${WEKNORA_STAGING_MIN_MEM_AVAILABLE_KIB:-1048576}"
minimum_swap_kib="${WEKNORA_STAGING_MIN_SWAP_FREE_KIB:-524288}"
maximum_restarts="${WEKNORA_STAGING_MAX_PRODUCTION_RESTARTS:-3}"
for threshold in "$minimum_available_kib" "$minimum_swap_kib" "$maximum_restarts"; do
    is_uint "$threshold" || die 'staging capacity threshold is invalid'
done

mem_available_kib="$(awk '$1 == "MemAvailable:" { print $2; exit }' "$meminfo_path")"
swap_free_kib="$(awk '$1 == "SwapFree:" { print $2; exit }' "$meminfo_path")"
is_uint "$mem_available_kib" || die 'host MemAvailable metadata is unavailable'
is_uint "$swap_free_kib" || die 'host SwapFree metadata is unavailable'
[ "$mem_available_kib" -ge "$minimum_available_kib" ] ||
    die 'host available memory is below the staging safety floor'
[ "$swap_free_kib" -ge "$minimum_swap_kib" ] ||
    die 'host free swap is below the staging safety floor'

production_containers=()
while IFS= read -r container; do
    [ -n "$container" ] && production_containers+=("$container")
done < <(
    "$docker_bin" ps -a --filter label=com.docker.compose.project=weknora-v072-production --format '{{.Names}}'
)
[ "${#production_containers[@]}" -gt 0 ] || die 'production Compose project has no containers'

required_healthy=(
    weknora-v072-production-app
    weknora-v072-production-frontend
    weknora-v072-production-postgres
)
is_required_healthy() {
    local candidate="$1" required
    for required in "${required_healthy[@]}"; do
        [ "$candidate" = "$required" ] && return 0
    done
    return 1
}

seen_app=false
seen_frontend=false
seen_postgres=false
for container in "${production_containers[@]}"; do
    case "$container" in
        ''|*[!A-Za-z0-9_.-]*) die 'production container metadata contains an unsafe name' ;;
    esac
    inspection="$("$docker_bin" inspect "$container" --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.State.OOMKilled}}|{{.RestartCount}}|{{.State.ExitCode}}' 2>/dev/null || true)"
    [ -n "$inspection" ] || die "production container metadata is unavailable: $container"
    IFS='|' read -r state health oom_killed restart_count exit_code <<< "$inspection"
    if [ "$state" = exited ] && [ "$container" = weknora-v072-production-searxng-init ]; then
        [ "$exit_code" = 0 ] || die "production one-shot init did not succeed: $container"
    elif [ "$state" != running ]; then
        die "production container is not running: $container"
    fi
    if is_required_healthy "$container"; then
        [ "$health" = healthy ] || die "required production container is not healthy: $container"
    elif [ "$health" != none ] && [ "$health" != healthy ]; then
        die "production container health is not healthy: $container"
    fi
    [ "$oom_killed" = false ] || die "production container was OOM-killed: $container"
    is_uint "$restart_count" || die "production restart metadata is invalid: $container"
    [ "$restart_count" -le "$maximum_restarts" ] || die "production restart count exceeds staging threshold: $container"
    case "$container" in
        weknora-v072-production-app) seen_app=true ;;
        weknora-v072-production-frontend) seen_frontend=true ;;
        weknora-v072-production-postgres) seen_postgres=true ;;
    esac
done
[ "$seen_app" = true ] || die 'production app container is missing'
[ "$seen_frontend" = true ] || die 'production frontend container is missing'
[ "$seen_postgres" = true ] || die 'production postgres container is missing'

printf '%s\n' "staging capacity preflight green: production=${#production_containers[@]} mem_available_kib=$mem_available_kib swap_free_kib=$swap_free_kib"
