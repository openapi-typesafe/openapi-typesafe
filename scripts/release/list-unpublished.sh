#!/usr/bin/env bash
# Print `name@version` of every public package whose version is not on npm yet, one per line.
#
# Usage: scripts/release/list-unpublished.sh
#        In release.yml, before the publish job: with an empty list the job is skipped, so a push
#        to main that releases nothing does not wait for approval in the `npm-publish` environment.
set -euo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

for manifest in "${ROOT_DIR}"/packages/*/package.json; do
  read -r name version is_private < <(
    node -p 'const m = require(process.argv[1]); `${m.name} ${m.version} ${m.private === true}`' \
      "${manifest}"
  )
  [[ "${is_private}" == "true" ]] && continue
  is_published="$("${ROOT_DIR}/scripts/release/is-on-npm.sh" "${name}" "${version}")"
  [[ "${is_published}" == "false" ]] && echo "${name}@${version}"
done
exit 0
