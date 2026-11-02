#!/usr/bin/env bash
# Prepare the two golden generators of ENGINEERING_PLAN task 2.2 in the harness cache:
#   fork-base       - the code at the `fork-base` tag (what our output must match), built from a worktree
#   upstream-7.13.0 - the published openapi-typescript@7.13.0 (what users run today), from npm
# Both run with TypeScript 5.9, the supported peer.
#
# Usage: scripts/prepare-generators.sh            (from tools/compat-harness)
# Logs:  <repo>/.logs/harness/prepare-generators-<UTC>/<step>.log
set -euo pipefail

readonly HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly REPO_DIR="$(cd "${HARNESS_DIR}/../.." && pwd)"
readonly GENERATORS_DIR="${HARNESS_DIR}/.cache/compat/generators"
readonly LOG_DIR="${REPO_DIR}/.logs/harness/prepare-generators-$(date -u +%Y%m%dT%H%M%SZ)"
readonly FORK_BASE_TAG="fork-base"
readonly UPSTREAM_PACKAGE="openapi-typescript@7.13.0"
readonly TYPESCRIPT_PACKAGE="typescript@5.9.3"

mkdir -p "${LOG_DIR}" "${GENERATORS_DIR}"

# Run one step with its output in its own log file; on failure print the log tail and stop.
run_step() {
  local name="$1"
  shift
  echo "step ${name}: log ${LOG_DIR}/${name}.log"
  if ! "$@" >"${LOG_DIR}/${name}.log" 2>&1; then
    echo "step ${name} failed:" >&2
    tail -n 30 "${LOG_DIR}/${name}.log" >&2
    exit 1
  fi
}

prepare_fork_base() {
  local worktree="${GENERATORS_DIR}/fork-base"
  if [[ ! -d "${worktree}" ]]; then
    run_step fork-base-worktree git -C "${REPO_DIR}" worktree add --detach "${worktree}" "${FORK_BASE_TAG}"
  fi
  # --ignore-workspace is not used: the worktree is its own workspace with its own lockfile.
  run_step fork-base-install bash -c "cd '${worktree}' && pnpm install --frozen-lockfile"
  run_step fork-base-build bash -c "cd '${worktree}/packages/openapi-typescript' && pnpm run build"
  run_step fork-base-typescript bash -c "cd '${worktree}/packages/openapi-typescript' && node -e \
    \"const v=require('typescript').version; if(!v.startsWith('5.9.')) {throw new Error('TypeScript '+v)}; console.log(v)\""
}

prepare_upstream() {
  local directory="${GENERATORS_DIR}/upstream-7.13.0"
  mkdir -p "${directory}"
  [[ -f "${directory}/package.json" ]] || echo '{ "private": true }' >"${directory}/package.json"
  # --ignore-workspace: the cache sits inside this repository, but the published package must not
  # resolve anything from our workspace.
  run_step upstream-install bash -c "cd '${directory}' && pnpm add --ignore-workspace \
    --save-exact '${UPSTREAM_PACKAGE}' '${TYPESCRIPT_PACKAGE}'"
}

prepare_fork_base
prepare_upstream

echo "fork-base cli:       ${GENERATORS_DIR}/fork-base/packages/openapi-typescript/bin/cli.js"
echo "upstream-7.13.0 cli: ${GENERATORS_DIR}/upstream-7.13.0/node_modules/openapi-typescript/bin/cli.js"
