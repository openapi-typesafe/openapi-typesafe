#!/usr/bin/env bash
# Fail unless a version on npm has SLSA provenance from this repository's release.yml. With a
# tarball, also fail unless the provenance names that tarball's SHA-512, so the version on npm is
# the file the build job packed. A release without provenance is not official (SECURITY.md).
#
# Usage: scripts/release/check-provenance.sh <name> <version> [<tarball>]
#        In the publish job of release.yml, for every package: with the tarball right after it is
#        published, without it for a version that an earlier run published (a rebuild need not be
#        byte for byte the same file).
# Environment: GITHUB_REPOSITORY (owner/name), set by GitHub Actions.
#
# This checks what the provenance claims. `npm publish` already checked the signatures, and users
# check them again with `npm audit signatures`.
set -euo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly NAME="${1:?usage: check-provenance.sh <name> <version> [<tarball>]}"
readonly VERSION="${2:?usage: check-provenance.sh <name> <version> [<tarball>]}"
readonly TARBALL="${3:-}"
readonly EXPECTED_REPOSITORY="https://github.com/${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is unset}"
readonly EXPECTED_WORKFLOW=".github/workflows/release.yml"
BUNDLE_FILE="$(mktemp)"
readonly BUNDLE_FILE
trap 'rm -f "${BUNDLE_FILE}"' EXIT

expected_digest=""
if [[ -n "${TARBALL}" ]]; then
  read -r expected_digest _ < <(shasum -a 512 "${TARBALL}")
fi
"${ROOT_DIR}/scripts/release/fetch-provenance.sh" "${NAME}" "${VERSION}" "${BUNDLE_FILE}"
export BUNDLE_FILE EXPECTED_REPOSITORY EXPECTED_WORKFLOW
EXPECTED_DIGEST="${expected_digest}" node -e '
  const fs = require("node:fs");
  const env = process.env;
  const bundle = JSON.parse(fs.readFileSync(env.BUNDLE_FILE, "utf8"));
  const statement = JSON.parse(Buffer.from(bundle.dsseEnvelope.payload, "base64").toString());
  const workflow = statement.predicate.buildDefinition.externalParameters.workflow;
  const digests = statement.subject.map((subject) => subject.digest.sha512);
  const problems = [];
  if (workflow.repository !== env.EXPECTED_REPOSITORY) {
    problems.push(`repository ${workflow.repository}`);
  }
  if (workflow.path !== env.EXPECTED_WORKFLOW) problems.push(`workflow ${workflow.path}`);
  if (env.EXPECTED_DIGEST !== "" && !digests.includes(env.EXPECTED_DIGEST)) {
    problems.push(`sha512 ${digests.join(", ")}, the build job packed ${env.EXPECTED_DIGEST}`);
  }
  if (problems.length > 0) {
    console.error(`check-provenance: unexpected provenance: ${problems.join("; ")}`);
    process.exit(1);
  }
'
echo "check-provenance: ${NAME}@${VERSION}: provenance from ${EXPECTED_WORKFLOW}"
