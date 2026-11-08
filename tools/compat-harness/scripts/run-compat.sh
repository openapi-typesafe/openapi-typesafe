#!/usr/bin/env bash
# Full compatibility run (ENGINEERING_PLAN 2.2-2.5): generate with the two golden generators and the
# current workspace build, compare, and render the reports. With option sets "all", the opt-in
# flags are checked too (roadmap plan §4): their output must not compile worse than without them.
#
# Usage: scripts/run-compat.sh [corpus] [option-sets] [shard]
#        defaults: 200 all, no shard  (corpus: a number or "all"; shard: <index>/<count>)
# Needs: scripts/prepare-generators.sh, `pnpm harness fetch --corpus <corpus>`, and a built
#        packages/openapi-typesafe. Every harness command writes its own log to .logs/harness.
#
# With a shard (the CI full run, ADR-038), only that shard of the corpus is generated and compared,
# and the reports are left out: scripts/merge-compat.sh renders them from the results of every
# shard. The exit code still says whether this shard passed the gate.
set -euo pipefail

HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly HARNESS_DIR
readonly GENERATORS_DIR="${HARNESS_DIR}/.cache/compat/generators"
readonly CURRENT_CLI="../../packages/openapi-typesafe/bin/cli.js"
readonly CORPUS="${1:-200}"
readonly OPTION_SETS="${2:-all}"
readonly SHARD="${3:-}"
# shellcheck source=compat-labels.sh
source "${HARNESS_DIR}/scripts/compat-labels.sh"

cd "${HARNESS_DIR}"

harness() {
  node src/cli/main.ts "$@"
}

# generate <label> <cli> <option-sets>
generate() {
  if [[ -n "${SHARD}" ]]; then
    harness generate --label "$1" --cli "$2" --corpus "${CORPUS}" --option-sets "$3" \
      --shard "${SHARD}"
  else
    harness generate --label "$1" --cli "$2" --corpus "${CORPUS}" --option-sets "$3"
  fi
}

# The reports need every case, so a shard leaves them to merge-compat.sh.
report() {
  if [[ -z "${SHARD}" ]]; then
    harness report --golden "$1" --candidate "$2"
  fi
}

generate "${FORK_BASE_LABEL}" "${GENERATORS_DIR}/fork-base/packages/openapi-typescript/bin/cli.js" \
  "${OPTION_SETS}"
generate "${UPSTREAM_LABEL}" \
  "${GENERATORS_DIR}/upstream-7.13.0/node_modules/openapi-typescript/bin/cli.js" "${OPTION_SETS}"
generate "${CURRENT_LABEL}" "${CURRENT_CLI}" "${OPTION_SETS}"

status=0
# Release gate: the current code must match the fork base. A failure is reported, not fatal, so the
# report is still rendered.
harness compare --golden "${FORK_BASE_LABEL}" --candidate "${CURRENT_LABEL}" --types || status=1
report "${FORK_BASE_LABEL}" "${CURRENT_LABEL}"
# Documentation only: changes between the fork base and the last published upstream release.
harness compare --golden "${UPSTREAM_LABEL}" --candidate "${FORK_BASE_LABEL}" --types || true
report "${UPSTREAM_LABEL}" "${FORK_BASE_LABEL}"
# Opt-in flags: the golden generators do not have them, so the current build is checked against its
# own output without the flag. Only with the whole matrix, to keep the per-PR run short.
if [[ "${OPTION_SETS}" == "all" ]]; then
  generate "${OPT_IN_LABEL}" "${CURRENT_CLI}" opt-in
  harness check-opt-in --label "${OPT_IN_LABEL}" || status=1
fi
exit "${status}"
