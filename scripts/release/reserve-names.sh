#!/usr/bin/env bash
# Build the placeholder packages that reserve the npm names (ADR-007, decision 2). It publishes
# nothing: it prints the commands for the maintainer to run by hand, logged in with 2FA, because a
# trusted publisher can only be added to a package that already exists.
#
# Usage: scripts/release/reserve-names.sh
# Output: .logs/release/placeholders/<name>/ with package.json and README.md.
set -euo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly OUT_DIR="${ROOT_DIR}/.logs/release/placeholders"
readonly PLACEHOLDER_VERSION="0.0.0"
readonly NAMES=(
  openapi-typesafe-helpers
  openapi-typesafe-fetch
  openapi-typesafe-react-query
  openapi-typesafe
  openapi-typesafe-migrate
)
readonly DEPRECATION="Reserved name. Install openapi-typesafe@next until 1.0.0 is released."

rm -rf "${OUT_DIR}"
for name in "${NAMES[@]}"; do
  mkdir -p "${OUT_DIR}/${name}"
  NAME="${name}" VERSION="${PLACEHOLDER_VERSION}" node -e '
    const manifest = {
      name: process.env.NAME,
      version: process.env.VERSION,
      description: "Reserved for openapi-typesafe. Contains no code.",
      license: "MIT",
    };
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  ' > "${OUT_DIR}/${name}/package.json"
  printf '# %s\n\nThis name is reserved for openapi-typesafe. This version contains no code.\n' \
    "${name}" > "${OUT_DIR}/${name}/README.md"
done

echo "reserve-names: placeholders in ${OUT_DIR}. Run, logged in to npm with 2FA:"
for name in "${NAMES[@]}"; do
  echo "  (cd '${OUT_DIR}/${name}' && npm publish --access public)"
  echo "  npm deprecate '${name}@${PLACEHOLDER_VERSION}' '${DEPRECATION}'"
done
