#!/usr/bin/env bash
# Tell whether a package version is already on npm: prints `true` or `false`.
#
# Usage: scripts/release/is-on-npm.sh <name> <version>
#        Used by publish-package.sh (skip a published version) and list-unpublished.sh (skip the
#        approval when nothing is left to publish).
#
# `npm view` prints nothing for a missing version of an existing package and fails with E404 for a
# package that does not exist yet; any other failure (network, registry) exits non-zero, so the
# caller stops instead of guessing.
set -euo pipefail

readonly NAME="${1:?usage: is-on-npm.sh <name> <version>}"
readonly VERSION="${2:?usage: is-on-npm.sh <name> <version>}"
ERROR_FILE="$(mktemp)"
readonly ERROR_FILE
trap 'rm -f "${ERROR_FILE}"' EXIT

if ! published="$(npm view "${NAME}@${VERSION}" version 2>"${ERROR_FILE}")"; then
  grep -q "E404" "${ERROR_FILE}" || { cat "${ERROR_FILE}" >&2; exit 1; }
  published=""
fi
if [[ -n "${published}" ]]; then
  echo true
else
  echo false
fi
