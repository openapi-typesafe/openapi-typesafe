#!/usr/bin/env bash
# Publish every public package whose version is not on npm yet, then tag each one and create its
# GitHub release with a CycloneDX SBOM (ENGINEERING_PLAN 9.3–9.5).
#
# Usage: scripts/release/publish.sh [--dry-run]
#        In CI only, after the "Version Packages" pull request is merged (release.yml). The dry run
#        packs and runs `npm publish --dry-run`, and creates no tags or releases.
# Logs:  .logs/release/
set -euo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly LOG_DIR="${ROOT_DIR}/.logs/release"
export RELEASE_RECORD="${LOG_DIR}/published.txt"
export RELEASE_DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && RELEASE_DRY_RUN=1

mkdir -p "${LOG_DIR}"
: > "${RELEASE_RECORD}"

# `pnpm -r` runs in dependency order, so a package is on npm before the packages that need it.
pnpm -r --workspace-concurrency=1 --filter "./packages/*" exec \
  "${ROOT_DIR}/scripts/release/publish-package.sh"

echo "publish: $(wc -l < "${RELEASE_RECORD}" | tr -d ' ') package(s) published"
if [[ "${RELEASE_DRY_RUN}" == "1" ]]; then
  exit 0
fi
while read -r release; do
  "${ROOT_DIR}/scripts/release/create-github-release.sh" "${release}"
done < "${RELEASE_RECORD}"
