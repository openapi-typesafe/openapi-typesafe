#!/usr/bin/env bash
# Download the SLSA provenance of a published version from the npm registry and write its Sigstore
# bundle to a file. check-provenance.sh reads it; the release job attaches it to the GitHub release.
#
# Usage: scripts/release/fetch-provenance.sh <name> <version> <out-file>
#
# The registry serves a new version's attestations only after a delay: usually seconds, but on
# 2026-11-08 more than 127 s. curl retries every 30 s for up to 10 minutes, which fits the publish
# job's 20-minute limit because release.yml checks all packages after publishing them all
# (ADR-007, amendment of 2026-11-08). A rerun of the job checks again.
set -euo pipefail

readonly NAME="${1:?usage: fetch-provenance.sh <name> <version> <out-file>}"
readonly VERSION="${2:?usage: fetch-provenance.sh <name> <version> <out-file>}"
readonly OUT_FILE="${3:?usage: fetch-provenance.sh <name> <version> <out-file>}"
readonly REGISTRY_URL="https://registry.npmjs.org/-/npm/v1/attestations"
readonly RETRY_COUNT=20
readonly RETRY_DELAY_SECONDS=30
readonly REQUEST_TIMEOUT_SECONDS=30
readonly PROVENANCE_TYPE="https://slsa.dev/provenance/v1"

attestations="$(
  curl --fail --silent --show-error --retry "${RETRY_COUNT}" --retry-delay "${RETRY_DELAY_SECONDS}" \
    --retry-all-errors \
    --max-time "${REQUEST_TIMEOUT_SECONDS}" "${REGISTRY_URL}/${NAME}@${VERSION}"
)"
export PROVENANCE_TYPE
ATTESTATIONS="${attestations}" node -e '
  const { attestations } = JSON.parse(process.env.ATTESTATIONS);
  const type = process.env.PROVENANCE_TYPE;
  const provenance = attestations.find((attestation) => attestation.predicateType === type);
  if (provenance === undefined) {
    console.error("fetch-provenance: the registry has no SLSA provenance for this version");
    process.exit(1);
  }
  process.stdout.write(`${JSON.stringify(provenance.bundle)}\n`);
' > "${OUT_FILE}"
