#!/usr/bin/env bash
# Pack every public package as a closed-beta tarball (ENGINEERING_PLAN 11.1).
#
# Usage: scripts/release/pack-beta.sh <version>        for example 1.0.0-beta.0
# Output: .release/beta/<version>/ holds one <name>-<version>.tgz per package, SHA256SUMS and
#         RELEASE_NOTES.md for the private GitHub release. The script prints the `gh` command that
#         creates that release; it does not run it.
# Logs:  .logs/release/pack-beta-<version>.log
#
# The beta runs before anything is on npm, so the tarballs carry the beta version instead of the
# version in package.json, and every dependency on a sibling package is pinned to that exact
# version. The repository files are not changed. A smoke install of the client tarballs into an
# empty project checks the result before the script reports success.
set -euo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly VERSION="${1:?usage: pack-beta.sh <version>, for example 1.0.0-beta.0}"
readonly OUT_DIR="${ROOT_DIR}/.release/beta/${VERSION}"
readonly LOG_DIR="${ROOT_DIR}/.logs/release"
readonly LOG_FILE="${LOG_DIR}/pack-beta-${VERSION}.log"
readonly NOTES_TEMPLATE="${ROOT_DIR}/scripts/release/beta-release-notes.md"
# A beta version must be a prerelease, so it can never be mistaken for a release on npm.
readonly VERSION_PATTERN='^[0-9]+\.[0-9]+\.[0-9]+-beta\.[0-9]+$'
WORK_DIR="$(mktemp -d)"
readonly WORK_DIR
trap 'rm -rf "${WORK_DIR}"' EXIT

mkdir -p "${LOG_DIR}"
: > "${LOG_FILE}"
log() {
  echo "pack-beta: $*" | tee -a "${LOG_FILE}"
}

if [[ ! "${VERSION}" =~ ${VERSION_PATTERN} ]]; then
  log "version ${VERSION} does not match <major>.<minor>.<patch>-beta.<n>"
  exit 2
fi

# The names of the public packages, one per line.
public_packages() {
  for manifest in "${ROOT_DIR}"/packages/*/package.json; do
    node -e '
      const manifest = require(process.argv[1]);
      if (manifest.private !== true) console.log(manifest.name);
    ' "${manifest}"
  done
}

# Set the version and pin sibling dependencies in an unpacked manifest.
stamp_manifest() {
  local manifest="$1"
  local siblings="$2"
  node -e '
    const fs = require("node:fs");
    const [path, version, siblingList] = process.argv.slice(1);
    const siblings = new Set(siblingList.split(","));
    const manifest = JSON.parse(fs.readFileSync(path, "utf8"));
    manifest.version = version;
    for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
      for (const name of Object.keys(manifest[field] ?? {})) {
        if (siblings.has(name)) manifest[field][name] = version;
      }
    }
    fs.writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  ' "${manifest}" "${VERSION}" "${siblings}"
}

# Pack one package, stamp its manifest and write the beta tarball to OUT_DIR.
pack_package() {
  local name="$1"
  local siblings="$2"
  local package_work="${WORK_DIR}/${name}"
  mkdir -p "${package_work}/unpacked"
  pnpm --filter "${name}" pack --pack-destination "${package_work}" >> "${LOG_FILE}" 2>&1
  tar -xzf "${package_work}"/*.tgz -C "${package_work}/unpacked"
  stamp_manifest "${package_work}/unpacked/package/package.json" "${siblings}"
  tar -czf "${OUT_DIR}/${name}-${VERSION}.tgz" -C "${package_work}/unpacked" package
  log "packed ${name}@${VERSION}"
}

# Install the client tarballs into an empty project and import them, without the registry.
smoke_install() {
  local project="${WORK_DIR}/smoke"
  mkdir -p "${project}"
  (
    cd "${project}"
    npm init -y >> "${LOG_FILE}" 2>&1
    npm install --offline --no-audit --no-fund \
      "${OUT_DIR}/openapi-typesafe-helpers-${VERSION}.tgz" \
      "${OUT_DIR}/openapi-typesafe-fetch-${VERSION}.tgz" >> "${LOG_FILE}" 2>&1
    node --input-type=module -e '
      const { default: createClient } = await import("openapi-typesafe-fetch");
      if (typeof createClient !== "function") throw new Error("createClient is not a function");
    '
  )
  log "smoke install passed"
}

write_release_files() {
  (cd "${OUT_DIR}" && shasum -a 256 -- *.tgz > SHA256SUMS)
  sed "s/{{VERSION}}/${VERSION}/g" "${NOTES_TEMPLATE}" > "${OUT_DIR}/RELEASE_NOTES.md"
  log "wrote SHA256SUMS and RELEASE_NOTES.md"
}

main() {
  rm -rf "${OUT_DIR}"
  mkdir -p "${OUT_DIR}"
  log "building packages"
  pnpm --dir "${ROOT_DIR}" build >> "${LOG_FILE}" 2>&1
  local packages
  packages="$(public_packages)"
  local siblings
  siblings="$(paste -sd, - <<< "${packages}")"
  while IFS= read -r name; do
    pack_package "${name}" "${siblings}"
  done <<< "${packages}"
  smoke_install
  write_release_files
  log "done: ${OUT_DIR}"
  echo
  echo "To create the private release (run it yourself; the repository must still be private):"
  echo "  gh release create beta-${VERSION} ${OUT_DIR}/*.tgz ${OUT_DIR}/SHA256SUMS \\"
  echo "    --prerelease --title \"Closed beta ${VERSION}\" --notes-file ${OUT_DIR}/RELEASE_NOTES.md"
}

main
