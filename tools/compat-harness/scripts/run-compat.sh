#!/usr/bin/env bash
# Full compatibility run (ENGINEERING_PLAN 2.2-2.5): generate with the two golden generators and the
# current workspace build, compare, and render the reports.
#
# Usage: scripts/run-compat.sh [corpus] [option-sets]    defaults: 200 all  (corpus: a number or "all")
# Needs: scripts/prepare-generators.sh, `pnpm harness fetch --corpus <corpus>`, and a built
#        packages/openapi-typesafe. Every harness command writes its own log to .logs/harness.
set -euo pipefail

readonly HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly GENERATORS_DIR="${HARNESS_DIR}/.cache/compat/generators"
readonly CORPUS="${1:-200}"
readonly OPTION_SETS="${2:-all}"

cd "${HARNESS_DIR}"

harness() {
  node src/cli/main.ts "$@"
}

generate() {
  harness generate --label "$1" --cli "$2" --corpus "${CORPUS}" --option-sets "${OPTION_SETS}"
}

generate fork-base "${GENERATORS_DIR}/fork-base/packages/openapi-typescript/bin/cli.js"
generate upstream-7.13.0 "${GENERATORS_DIR}/upstream-7.13.0/node_modules/openapi-typescript/bin/cli.js"
generate current ../../packages/openapi-typesafe/bin/cli.js

status=0
# Release gate: the current code must match the fork base. A failure is reported, not fatal, so the
# report is still rendered.
harness compare --golden fork-base --candidate current --types || status=1
harness report --golden fork-base --candidate current
# Documentation only: changes between the fork base and the last published upstream release.
harness compare --golden upstream-7.13.0 --candidate fork-base --types || true
harness report --golden upstream-7.13.0 --candidate fork-base
exit "${status}"
