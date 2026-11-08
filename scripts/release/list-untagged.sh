#!/usr/bin/env bash
# Print `name@version` of every public package whose prerelease is on npm but is not `latest`
# while the package has no stable release, one per line: the versions tag-latest.sh still has to
# tag (ADR-007).
#
# Usage: scripts/release/list-untagged.sh
#        In release.yml, next to list-unpublished.sh: a push to main with such a version runs the
#        publish job, which publishes nothing and tags it. Before, a tag that a release missed (rc.3
#        on 2026-11-08) stayed wrong until the next release.
set -euo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

for manifest in "${ROOT_DIR}"/packages/*/package.json; do
  read -r name version is_private < <(
    node -p 'const m = require(process.argv[1]); `${m.name} ${m.version} ${m.private === true}`' \
      "${manifest}"
  )
  [[ "${is_private}" == "true" || "${version}" != *-* ]] && continue
  [[ "$("${ROOT_DIR}/scripts/release/is-on-npm.sh" "${name}" "${version}")" == "true" ]] || continue
  [[ "$("${ROOT_DIR}/scripts/release/has-stable-release.sh" "${name}")" == "false" ]] || continue
  latest="$(npm view "${name}" dist-tags.latest)"
  [[ "${latest}" != "${version}" ]] && echo "${name}@${version}"
done
exit 0
