#!/usr/bin/env bash
# Check that the release directory written by pack-release.sh is unchanged: SHA256SUMS must have the
# hash that the build job put in its outputs, and every file it lists must match it.
#
# Usage: scripts/release/verify-tarballs.sh <release-dir> <sha256 of SHA256SUMS>
#        In the publish, release and dry-run jobs of release.yml, right after the download.
#
# The expected hash travels as a job output, not inside the artifact, so a changed artifact cannot
# carry a matching SHA256SUMS. Needs only bash and shasum, so it runs before anything else.
set -euo pipefail

readonly RELEASE_DIR="${1:?usage: verify-tarballs.sh <release-dir> <sha256 of SHA256SUMS>}"
readonly EXPECTED_SHA256="${2:?usage: verify-tarballs.sh <release-dir> <sha256 of SHA256SUMS>}"

cd "${RELEASE_DIR}"
read -r actual_sha256 _ < <(shasum -a 256 SHA256SUMS)
if [[ "${actual_sha256}" != "${EXPECTED_SHA256}" ]]; then
  echo "verify-tarballs: SHA256SUMS is ${actual_sha256}, the build job wrote ${EXPECTED_SHA256}" >&2
  exit 1
fi

# Fail unless SHA256SUMS lists the file; `--check` alone only checks the files that are listed.
require_listed() {
  if ! awk -v file="$1" '$2 == file { found = 1 } END { exit !found }' SHA256SUMS; then
    echo "verify-tarballs: $1 is not in SHA256SUMS" >&2
    exit 1
  fi
}

shasum -a 256 --check --strict SHA256SUMS
require_listed manifest.tsv
while IFS=$'\t' read -r name version tarball; do
  for file in "${tarball}" "${name}@${version}.cdx.json" "${name}@${version}.notes.md"; do
    require_listed "${file}"
  done
done < manifest.tsv
echo "verify-tarballs: every file matches the build job"
