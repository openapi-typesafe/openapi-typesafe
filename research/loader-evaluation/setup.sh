#!/usr/bin/env bash
# Install the loader candidates of research/loader-evaluation.md, each in its own directory next to
# this script, so their dependency trees can be measured separately.
# Usage: research/loader-evaluation/setup.sh, then
#        node research/loader-evaluation/evaluate.mjs <r1|r2|jsrp> <documents dir> > <loader>.jsonl
set -euo pipefail

readonly HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly CANDIDATES=(
  "r1:@redocly/openapi-core@1.34.22"
  "r2:@redocly/openapi-core@2.72.1"
  "jsrp:@apidevtools/json-schema-ref-parser@16.0.5"
  "scalar:@scalar/openapi-parser@0.29.19"
)

for candidate in "${CANDIDATES[@]}"; do
  directory="${HERE}/${candidate%%:*}"
  mkdir -p "${directory}"
  [[ -f "${directory}/package.json" ]] || echo '{ "private": true }' >"${directory}/package.json"
  (cd "${directory}" && pnpm add --ignore-workspace --save-exact "${candidate#*:}")
  echo "${candidate}: $(ls "${directory}/node_modules/.pnpm" | wc -l | tr -d ' ') packages," \
    "$(du -sk "${directory}/node_modules" | cut -f1) KB"
done
