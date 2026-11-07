#!/usr/bin/env bash
# Download the SLSA provenance of a published version from the npm registry and write its Sigstore
# bundle to a file. check-provenance.sh reads it; the release job attaches it to the GitHub release.
#
# Usage: scripts/release/fetch-provenance.sh <name> <version> <out-file>
#
# The registry answers from a CDN cache, so a version published seconds ago can be missing for a
# short while. curl retries 7 times and doubles its wait each time (1, 2, 4 ... 64 s: 127 s in
# total). That covers the propagation delay, which is usually a few seconds, and still fails well
# inside the job time limit (ADR-007, amendment of 2026-11-07). A rerun of the job checks again.
set -euo pipefail

readonly NAME="${1:?usage: fetch-provenance.sh <name> <version> <out-file>}"
readonly VERSION="${2:?usage: fetch-provenance.sh <name> <version> <out-file>}"
readonly OUT_FILE="${3:?usage: fetch-provenance.sh <name> <version> <out-file>}"
readonly REGISTRY_URL="https://registry.npmjs.org/-/npm/v1/attestations"
readonly RETRY_COUNT=7
readonly REQUEST_TIMEOUT_SECONDS=30
readonly PROVENANCE_TYPE="https://slsa.dev/provenance/v1"

attestations="$(
  curl --fail --silent --show-error --retry "${RETRY_COUNT}" --retry-all-errors \
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
