#!/usr/bin/env bash
# Pack every public package for the release jobs (ENGINEERING_PLAN 9.3–9.5, ADR-007). The build
# job of release.yml runs it after the verify gate; the publish and release jobs only read its
# output, so no dependency code runs while a job holds the npm publishing right.
#
# Usage: scripts/release/pack-release.sh <out-dir>     (after `pnpm build`)
# Output, in <out-dir>:
#   manifest.tsv                 one line per package in dependency order: name, version, tarball
#   <name>-<version>.tgz         the tarball from `pnpm pack` (it replaces `workspace:` versions)
#   <name>@<version>.cdx.json    CycloneDX SBOM of the production dependencies
#   <name>@<version>.notes.md    the section of the package's CHANGELOG.md for this version
#   SHA256SUMS                   SHA-256 of every file above; the jobs that read the directory
#                                check it against the hash of this file that the build job outputs
set -euo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly OUT_ARGUMENT="${1:?usage: pack-release.sh <out-dir>}"
# Absolute, because pnpm runs each command in the package directory.
OUT_DIR="${OUT_ARGUMENT}"
[[ "${OUT_DIR}" == /* ]] || OUT_DIR="${PWD}/${OUT_DIR}"
readonly OUT_DIR

# `name<TAB>version<TAB>directory` of each public package. `pnpm -r` with one worker visits the
# packages in dependency order, so a package comes before the packages that need it.
list_public_packages() {
  pnpm --dir "${ROOT_DIR}" -r --workspace-concurrency=1 --filter "./packages/*" exec node -e '
    const manifest = require("./package.json");
    if (manifest.private !== true) {
      console.log([manifest.name, manifest.version, process.cwd()].join("\t"));
    }
  '
}

# Print the section of a changelog from "## <version>" up to the next "## " heading.
changelog_section() {
  local changelog="$1"
  local version="$2"
  awk -v heading="## ${version}" '
    $0 == heading { inside = 1; next }
    inside && /^## / { exit }
    inside { print }
  ' "${changelog}"
}

pack_package() {
  local name="$1"
  local version="$2"
  local directory="$3"
  local tarball="${name}-${version}.tgz"
  pnpm --dir "${directory}" pack --pack-destination "${OUT_DIR}" > /dev/null
  [[ -f "${OUT_DIR}/${tarball}" ]] || { echo "pack-release: ${tarball} missing" >&2; exit 1; }
  pnpm --dir "${ROOT_DIR}" --filter "${name}" sbom --sbom-format cyclonedx --prod \
    > "${OUT_DIR}/${name}@${version}.cdx.json"
  changelog_section "${directory}/CHANGELOG.md" "${version}" \
    > "${OUT_DIR}/${name}@${version}.notes.md"
  printf '%s\t%s\t%s\n' "${name}" "${version}" "${tarball}" >> "${OUT_DIR}/manifest.tsv"
  echo "pack-release: packed ${name}@${version}"
}

main() {
  rm -rf "${OUT_DIR}"
  mkdir -p "${OUT_DIR}"
  : > "${OUT_DIR}/manifest.tsv"
  local packages
  packages="$(list_public_packages)"
  while IFS=$'\t' read -r name version directory; do
    pack_package "${name}" "${version}" "${directory}"
  done <<< "${packages}"
  (cd "${OUT_DIR}" && shasum -a 256 -- * > SHA256SUMS)
}

main
