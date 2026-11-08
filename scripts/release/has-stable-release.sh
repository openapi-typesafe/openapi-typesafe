#!/usr/bin/env bash
# Tell whether a package has a stable release on npm that is not deprecated: prints `true` or
# `false`. The reserved-name placeholder (`0.0.0`, deprecated, ADR-007) does not count.
#
# Usage: scripts/release/has-stable-release.sh <name>
#        Used by tag-latest.sh: until a stable release exists, a prerelease also takes the
#        `latest` tag, so `npm install <name>` gets working code instead of the placeholder.
#
# The versions are read from the registry document, not with `npm view <name>@*`: once `latest`
# points at a prerelease, npm resolves `*` to that tag, and the prerelease looked stable (rc.3 kept
# `latest` on rc.2 on 2026-11-08). A package that does not exist yet (404) has no stable release;
# any other failure exits non-zero.
set -euo pipefail

readonly NAME="${1:?usage: has-stable-release.sh <name>}"
readonly REGISTRY_URL="https://registry.npmjs.org"
# A few seconds per read; three retries cover a short registry hiccup (CODING_PRINCIPLES 8.6).
readonly RETRY_COUNT=3
readonly REQUEST_TIMEOUT_SECONDS=30
DOCUMENT_FILE="$(mktemp)"
readonly DOCUMENT_FILE
trap 'rm -f "${DOCUMENT_FILE}"' EXIT

status="$(
  curl --silent --show-error --retry "${RETRY_COUNT}" --max-time "${REQUEST_TIMEOUT_SECONDS}" \
    --output "${DOCUMENT_FILE}" --write-out "%{http_code}" "${REGISTRY_URL}/${NAME}"
)"
if [[ "${status}" == "404" ]]; then
  echo false
  exit 0
fi
if [[ "${status}" != "200" ]]; then
  echo "has-stable-release: ${NAME}: the registry answered HTTP ${status}" >&2
  exit 1
fi
# A stable version has no prerelease part (`1.0.0`, not `1.0.0-rc.3`).
export DOCUMENT_FILE
node -p '
  const document = JSON.parse(require("node:fs").readFileSync(process.env.DOCUMENT_FILE, "utf8"));
  const versions = Object.entries(document.versions ?? {});
  String(versions.some(([version, manifest]) => !version.includes("-") && !manifest.deprecated));
'
