#!/usr/bin/env bash
# Tag one published package version and create its GitHub release, with the package's changelog
# section as notes and a CycloneDX SBOM of its production dependencies attached (ENGINEERING_PLAN
# 9.5).
#
# Usage: scripts/release/create-github-release.sh <name>@<version>   (from publish.sh, in CI)
# Logs:  .logs/release/<name>@<version>.cdx.json is the attached SBOM.
set -euo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly LOG_DIR="${ROOT_DIR}/.logs/release"
readonly TAG="$1"
readonly NAME="${TAG%@*}"
readonly VERSION="${TAG##*@}"
readonly PACKAGE_DIR="$(pnpm --filter "${NAME}" exec pwd)"
readonly SBOM_FILE="${LOG_DIR}/${TAG}.cdx.json"
readonly NOTES_FILE="${LOG_DIR}/${TAG}.notes.md"

pnpm --filter "${NAME}" sbom --sbom-format cyclonedx --prod > "${SBOM_FILE}"
# The section of CHANGELOG.md from "## <version>" up to the next "## " heading.
awk -v heading="## ${VERSION}" '
  $0 == heading { inside = 1; next }
  inside && /^## / { exit }
  inside { print }
' "${PACKAGE_DIR}/CHANGELOG.md" > "${NOTES_FILE}"

prerelease_flag=()
[[ "${VERSION}" == *-* ]] && prerelease_flag=(--prerelease)
git tag "${TAG}"
git push origin "refs/tags/${TAG}"
gh release create "${TAG}" "${SBOM_FILE}#${TAG} SBOM (CycloneDX)" \
  --title "${TAG}" --notes-file "${NOTES_FILE}" --verify-tag "${prerelease_flag[@]}"
echo "create-github-release: ${TAG} released"
