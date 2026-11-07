#!/usr/bin/env bash
# Point `latest` at each published prerelease while its package has no stable release, so the npm
# page and `npm install <name>` show working code instead of the deprecated `0.0.0` placeholder
# (ADR-007). A stable version, or a package that already has a stable release, is left alone.
#
# Usage: scripts/release/tag-latest.sh <release-dir>     (the directory from pack-release.sh)
#        The last step of the publish job in release.yml, after every package is published and its
#        provenance checked. Needs npm 12.2.0 or later and "Allow npm dist-tag" on each package's
#        trusted publisher (RELEASING.md). A rerun adds the tag again, which npm accepts.
set -euo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly RELEASE_DIR="${1:?usage: tag-latest.sh <release-dir>}"

tag_latest() {
  local name="$1"
  local version="$2"
  if [[ "${version}" != *-* ]]; then
    return 0
  fi
  if [[ "$("${ROOT_DIR}/scripts/release/has-stable-release.sh" "${name}")" == "true" ]]; then
    echo "tag-latest: ${name}@${version}: a stable release exists, latest unchanged"
    return 0
  fi
  npm dist-tag add "${name}@${version}" latest
  echo "tag-latest: ${name}@${version}: tagged latest (no stable release yet)"
}

# The manifest is read on descriptor 3, so npm cannot consume it from standard input.
while IFS=$'\t' read -r -u 3 name version _; do
  tag_latest "${name}" "${version}"
done 3< "${RELEASE_DIR}/manifest.tsv"
