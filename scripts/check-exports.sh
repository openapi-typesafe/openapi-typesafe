#!/usr/bin/env bash
# Check the published types of the package in the current directory with are-the-types-wrong,
# the manifest with publint, and that the tarball holds only the paths in `files` plus the files npm always adds.
#
# Usage: run from a package directory after `pnpm run build` (each package's `test:exports`).
#        `--cli-only` skips the types check, for a package that ships only a command.
# Logs:  .logs/attw/<package directory>.log
#
# The tarball comes from `pnpm pack`, not from `attw --pack` (which runs `npm pack`): only pnpm
# replaces `workspace:` and `catalog:` versions, so this checks exactly what `pnpm publish` uploads.
set -euo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly LOG_DIR="${ROOT_DIR}/.logs/attw"
readonly PACKAGE_DIR="$(pwd)"
readonly MODE="${1:-}"
PACK_DIR="$(mktemp -d)"
readonly PACK_DIR
trap 'rm -rf "${PACK_DIR}"' EXIT

mkdir -p "${LOG_DIR}"
pnpm pack --pack-destination "${PACK_DIR}" >/dev/null
readonly LOG_FILE="${LOG_DIR}/$(basename "${PACKAGE_DIR}").log"
if [[ "${MODE}" != "--cli-only" ]]; then
  # --no-color keeps the log readable; attw exits non-zero on any resolution problem.
  attw --no-color "${PACK_DIR}"/*.tgz 2>&1 | tee "${LOG_FILE}"
  # attw exits 0 for a package without any types, but every library package must ship them.
  if grep -q "does not contain types" "${LOG_FILE}"; then
    echo "check-exports: ${PACKAGE_DIR} publishes no types" >&2
    exit 1
  fi
fi

# publint checks the manifest against the files. It fails on errors only: the one warning it
# gives, about the `./*` export, is accepted in ADR-018.
publint --level error "${PACK_DIR}"/*.tgz 2>&1 | tee -a "${LOG_FILE}"

# Only `files` and the files npm always includes; anything else (local logs, coverage, configs)
# must not reach the registry.
node "${ROOT_DIR}/scripts/check-tarball-files.mjs" "${PACK_DIR}"/*.tgz
