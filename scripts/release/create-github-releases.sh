#!/usr/bin/env bash
# Create the tag `<name>@<version>` and the GitHub release of every package in the release
# directory (ENGINEERING_PLAN 9.5): the changelog section as notes, with the CycloneDX SBOM and the
# npm provenance bundle attached.
#
# Usage: scripts/release/create-github-releases.sh <release-dir> <commit>
#        The release job of release.yml, after the publish job. <commit> is the commit the
#        packages were built from; the release creates the tag on it.
# Environment: GH_TOKEN with contents: write, GITHUB_REPOSITORY (owner/name).
#
# Safe to rerun: a published release is skipped, a draft left by a failed run is replaced, and a
# tag that already exists is used only when it points at <commit>. `gh release create` with files
# creates a draft, uploads the files and then publishes it, so an immutable release gets every
# file before it is locked (ADR-007, amendment of 2026-11-07).
set -euo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly RELEASE_DIR="${1:?usage: create-github-releases.sh <release-dir> <commit>}"
readonly COMMIT="${2:?usage: create-github-releases.sh <release-dir> <commit>}"
readonly REPOSITORY="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is unset}"

# Print `published`, `draft` or `missing` for the release of a tag.
release_state() {
  local tag="$1"
  local is_draft
  if is_draft="$(gh release view "${tag}" --repo "${REPOSITORY}" --json isDraft --jq .isDraft 2>&1)"
  then
    [[ "${is_draft}" == "true" ]] && echo draft || echo published
    return 0
  fi
  [[ "${is_draft}" == *"release not found"* ]] || { echo "${is_draft}" >&2; return 1; }
  echo missing
}

# Fail when the tag exists on another commit: the release would describe code it was not built
# from. A missing tag is fine; the release creates it.
check_existing_tag() {
  local tag="$1"
  local lookup
  if ! lookup="$(gh api "repos/${REPOSITORY}/git/ref/tags/${tag}" 2>&1)"; then
    [[ "${lookup}" == *"(HTTP 404)"* ]] || { echo "${lookup}" >&2; return 1; }
    return 0
  fi
  local tagged_commit
  tagged_commit="$(gh api "repos/${REPOSITORY}/commits/${tag}" --jq .sha)"
  if [[ "${tagged_commit}" != "${COMMIT}" ]]; then
    echo "create-github-releases: tag ${tag} is on ${tagged_commit}, expected ${COMMIT}" >&2
    return 1
  fi
}

create_release() {
  local tag="$1"
  local version="$2"
  local provenance_file="${RELEASE_DIR}/${tag}.provenance.sigstore.json"
  "${ROOT_DIR}/scripts/release/fetch-provenance.sh" "${tag%@*}" "${version}" "${provenance_file}"
  local options=(--repo "${REPOSITORY}" --target "${COMMIT}" --title "${tag}"
    --notes-file "${RELEASE_DIR}/${tag}.notes.md")
  [[ "${version}" == *-* ]] && options+=(--prerelease)
  gh release create "${tag}" "${options[@]}" \
    "${RELEASE_DIR}/${tag}.cdx.json#${tag} SBOM (CycloneDX)" \
    "${provenance_file}#${tag} npm provenance (Sigstore bundle)"
  echo "create-github-releases: ${tag} released"
}

release_package() {
  local tag="$1@$2"
  local state
  state="$(release_state "${tag}")"
  if [[ "${state}" == "published" ]]; then
    echo "create-github-releases: ${tag} already released, skipped"
    return 0
  fi
  if [[ "${state}" == "draft" ]]; then
    gh release delete "${tag}" --repo "${REPOSITORY}" --yes
    echo "create-github-releases: ${tag}: removed the draft of an earlier run"
  fi
  check_existing_tag "${tag}"
  create_release "${tag}" "$2"
}

# The manifest is read on descriptor 3, so gh cannot consume it from standard input.
while IFS=$'\t' read -r -u 3 name version _; do
  release_package "${name}" "${version}"
done 3< "${RELEASE_DIR}/manifest.tsv"
