#!/usr/bin/env bash
# Point `latest` at a published prerelease while the package has no stable release, so the npm
# page and `npm install <name>` show working code instead of the deprecated `0.0.0` placeholder
# (ADR-007). A stable version, or a package that already has a stable release, is left alone.
#
# Usage: scripts/release/tag-latest.sh <name>@<version>   (from publish.sh, in CI, last)
#        Needs npm 12.2.0 or later and "Allow npm dist-tag" on the package's trusted publisher
#        (RELEASING.md). It runs after the GitHub releases, so a failure leaves only this tag to
#        add by hand.
set -euo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly RELEASE="${1:?usage: tag-latest.sh <name>@<version>}"
readonly NAME="${RELEASE%@*}"
readonly VERSION="${RELEASE##*@}"

if [[ "${VERSION}" != *-* ]]; then
  exit 0
fi
if [[ "$("${ROOT_DIR}/scripts/release/has-stable-release.sh" "${NAME}")" == "true" ]]; then
  echo "tag-latest: ${RELEASE}: a stable release exists, latest unchanged"
  exit 0
fi
npm dist-tag add "${RELEASE}" latest
echo "tag-latest: ${RELEASE}: tagged latest (no stable release yet)"
