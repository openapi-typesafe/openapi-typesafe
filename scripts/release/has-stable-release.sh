#!/usr/bin/env bash
# Tell whether a package has a stable release on npm that is not deprecated: prints `true` or
# `false`. The reserved-name placeholder (`0.0.0`, deprecated, ADR-007) does not count.
#
# Usage: scripts/release/has-stable-release.sh <name>
#        Used by tag-latest.sh: until a stable release exists, a prerelease also takes the
#        `latest` tag, so `npm install <name>` gets working code instead of the placeholder.
#
# `npm view <name>@*` lists stable versions only (a `*` range excludes prereleases). A package that
# does not exist yet fails with E404, which means no stable release; any other failure exits
# non-zero.
set -euo pipefail

readonly NAME="${1:?usage: has-stable-release.sh <name>}"
ERROR_FILE="$(mktemp)"
readonly ERROR_FILE
trap 'rm -f "${ERROR_FILE}"' EXIT

if ! releases="$(npm view "${NAME}@*" version deprecated --json 2>"${ERROR_FILE}")"; then
  grep -q "E404" "${ERROR_FILE}" || { cat "${ERROR_FILE}" >&2; exit 1; }
  releases=""
fi
# One matching version prints an object, several print an array, none print nothing.
RELEASES="${releases}" node -p '
  const text = process.env.RELEASES.trim();
  const parsed = text === "" ? [] : JSON.parse(text);
  const releases = Array.isArray(parsed) ? parsed : [parsed];
  String(releases.some((release) => !release.deprecated));
'
