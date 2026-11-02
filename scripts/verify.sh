#!/usr/bin/env bash
# Run the local quality gate (build, lint, test, size) and write one log file per step.
#
# Usage: scripts/verify.sh [step ...]   (default: build lint test size)
# Logs:  .logs/verify/<UTC timestamp>/<step>.log, plus summary.log with exit codes and durations.
#
# Each step runs even if an earlier one failed, so one run shows every problem; the script exits
# non-zero if any step failed. Warnings count as failures (CODING_PRINCIPLES §7.6), so the summary
# also reports how many warning lines each log contains.
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
    size) echo "npx size-limit" ;;
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

  printf '%-6s exit=%-3s warnings=%-4s duration=%ss log=%s\n' \
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
