#!/usr/bin/env bash
# Second half of a sharded full run (ADR-038): merge the results of every shard of
# scripts/run-compat.sh, check the release gate on the whole corpus, and render the reports.
#
# Usage: scripts/merge-compat.sh <shards-dir> [option-sets]    default option sets: all
#        <shards-dir> holds one directory per shard, each a copy of that shard's
#        .cache/compat/results directory. Use the option sets of the shard runs.
# The merged results replace the result files in .cache/compat/results; results/dependents.json,
# when present, goes into the reports.
set -euo pipefail

HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly HARNESS_DIR
readonly SHARDS_DIR="${1:?usage: scripts/merge-compat.sh <shards-dir> [option-sets]}"
readonly OPTION_SETS="${2:-all}"
# shellcheck source=compat-labels.sh
source "${HARNESS_DIR}/scripts/compat-labels.sh"

cd "${HARNESS_DIR}"

harness() {
  node src/cli/main.ts "$@"
}

harness merge --shards "${SHARDS_DIR}"

status=0
# The release gate of run-compat.sh, on the merged results. The opt-in check runs only with the
# whole matrix, as there.
if [[ "${OPTION_SETS}" == "all" ]]; then
  harness gate --golden "${FORK_BASE_LABEL}" --candidate "${CURRENT_LABEL}" \
    --label "${OPT_IN_LABEL}" || status=1
else
  harness gate --golden "${FORK_BASE_LABEL}" --candidate "${CURRENT_LABEL}" || status=1
fi
harness report --golden "${FORK_BASE_LABEL}" --candidate "${CURRENT_LABEL}"
harness report --golden "${UPSTREAM_LABEL}" --candidate "${FORK_BASE_LABEL}"
exit "${status}"
