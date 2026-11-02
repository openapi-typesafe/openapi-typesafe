#!/usr/bin/env bash
# Publish the package in the current directory to npm, unless it is private or its version is
# already on the registry (ENGINEERING_PLAN 9.3).
#
# Usage: run by scripts/release/publish.sh through `pnpm -r exec`, so packages go in dependency
#        order. Environment: RELEASE_DRY_RUN=1 for `npm publish --dry-run`; RELEASE_RECORD is the
#        file that lists every published `name@version`.
# Logs:  .logs/release/<package directory>.log
#
# The tarball comes from `pnpm pack`, which replaces `workspace:` versions. It is published with
# `npm publish`, because npm does the trusted-publishing (OIDC) exchange itself and fails when it
# does not work. No npm token exists in CI, so there is no token to fall back on.
set -euo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly LOG_DIR="${ROOT_DIR}/.logs/release"
readonly NAME="$(node -p 'require("./package.json").name')"
readonly VERSION="$(node -p 'require("./package.json").version')"
readonly IS_PRIVATE="$(node -p 'require("./package.json").private === true')"
readonly LOG_FILE="${LOG_DIR}/$(basename "$(pwd)").log"
PACK_DIR="$(mktemp -d)"
readonly PACK_DIR
trap 'rm -rf "${PACK_DIR}"' EXIT

mkdir -p "${LOG_DIR}"
log() {
  echo "publish-package: ${NAME}@${VERSION}: $*" | tee -a "${LOG_FILE}"
}

if [[ "${IS_PRIVATE}" == "true" ]]; then
  log "private, skipped"
  exit 0
fi

# `npm view` prints nothing for a missing version of an existing package and fails with E404 for a
# package that does not exist yet; any other failure (network, registry) stops the release.
if ! published="$(npm view "${NAME}@${VERSION}" version 2>"${PACK_DIR}/view.err")"; then
  grep -q "E404" "${PACK_DIR}/view.err" || { cat "${PACK_DIR}/view.err" >&2; exit 1; }
  published=""
fi
if [[ -n "${published}" ]]; then
  log "already on npm, skipped"
  exit 0
fi

# A prerelease (1.0.0-rc.0) goes to `next`, so `latest` keeps pointing at a stable version.
dist_tag="latest"
[[ "${VERSION}" == *-* ]] && dist_tag="next"
publish_args=(--access public --tag "${dist_tag}")
[[ "${RELEASE_DRY_RUN:-0}" == "1" ]] && publish_args+=(--dry-run)

pnpm pack --pack-destination "${PACK_DIR}" >/dev/null
log "publishing with tag ${dist_tag}${RELEASE_DRY_RUN:+ (dry run)}"
npm publish "${PACK_DIR}"/*.tgz "${publish_args[@]}" 2>&1 | tee -a "${LOG_FILE}"

if [[ "${RELEASE_DRY_RUN:-0}" != "1" ]]; then
  # Trusted publishing adds provenance on its own; a release without it is not official (SECURITY.md).
  attestations="$(npm view "${NAME}@${VERSION}" dist.attestations.provenance --json || true)"
  if [[ -z "${attestations}" ]]; then
    log "published without provenance"
    exit 1
  fi
  log "provenance present"
fi
echo "${NAME}@${VERSION}" >> "${RELEASE_RECORD:?RELEASE_RECORD must name the record file}"
