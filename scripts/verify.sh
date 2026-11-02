#!/usr/bin/env bash
# Run the local quality gate (build, lint, test, size) and write one log file per step.
#
# Usage: scripts/verify.sh [step ...]   (default: build lint test size)
#        Steps: build, lint, test, size, coverage, types, e2e.
# Logs:  .logs/verify/<UTC timestamp>/<step>.log, plus summary.log with exit codes and durations.
#
# Each step runs even if an earlier one failed, so one run shows every problem; the script exits
# non-zero if any step failed. The summary reports how many warning lines each log contains.
# With VERIFY_FAIL_ON_WARNINGS=1 (used in CI) a step with warnings also fails, because a yellow
# build is a red build (CODING_PRINCIPLES §7.6).
set -uo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly RUN_DIR="${ROOT_DIR}/.logs/verify/$(date -u +%Y%m%dT%H%M%SZ)"
readonly SUMMARY_FILE="${RUN_DIR}/summary.log"
# Matches warning lines from pnpm, biome, rollup/unbuild, node and vitest output.
readonly WARNING_PATTERN='WARN|warning|Warning|DeprecationWarning|ExperimentalWarning'

# A case statement instead of an associative array keeps the script working on bash 3.2 (macOS default).
command_for_step() {
  case "$1" in
    build) echo "pnpm build" ;;
    lint) echo "pnpm lint" ;;
    test) echo "pnpm test" ;;
    size) echo "pnpm exec size-limit" ;;
    coverage) echo "pnpm -r run --if-present test:coverage" ;;
    # Every supported TypeScript on the built packages (ENGINEERING_PLAN 8.1); needs `build` first.
    types) echo "pnpm --filter @openapi-typesafe/type-matrix matrix" ;;
    e2e) echo "pnpm test-e2e" ;;
    *) echo "" ;;
  esac
}

run_step() {
  local step="$1"
  local command
  command="$(command_for_step "${step}")"
  if [[ -z "${command}" ]]; then
    echo "unknown step: ${step}" | tee -a "${SUMMARY_FILE}"
    return 2
  fi

  local log_file="${RUN_DIR}/${step}.log"
  local started_at=${SECONDS}
  (cd "${ROOT_DIR}" && ${command}) >"${log_file}" 2>&1
  local exit_code=$?
  local warning_count
  warning_count=$(sed 's/\x1b\[[0-9;]*m//g' "${log_file}" | grep -cE "${WARNING_PATTERN}")

  if [[ "${exit_code}" -eq 0 && "${VERIFY_FAIL_ON_WARNINGS:-0}" == "1" && "${warning_count}" -gt 0 ]]; then
    exit_code=1
  fi

  printf '%-8s exit=%-3s warnings=%-4s duration=%ss log=%s\n' \
    "${step}" "${exit_code}" "${warning_count}" "$((SECONDS - started_at))" "${log_file}" |
    tee -a "${SUMMARY_FILE}"
  return "${exit_code}"
}

main() {
  mkdir -p "${RUN_DIR}"
  local steps=("$@")
  if [[ ${#steps[@]} -eq 0 ]]; then
    steps=(build lint test size)
  fi

  local failed=0
  for step in "${steps[@]}"; do
    run_step "${step}" || failed=1
  done
  exit "${failed}"
}

main "$@"
