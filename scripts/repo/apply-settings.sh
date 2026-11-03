#!/usr/bin/env bash
# Apply the repository settings of ENGINEERING_PLAN 9.8 when the repository goes public (11.2):
# rulesets for main and release tags, secret scanning with push protection, private vulnerability
# reporting, the `npm-publish` environment with the maintainer as required reviewer, pull requests
# opened by workflows, and GitHub Pages built by .github/workflows/docs.yml.
#
# Usage: scripts/repo/apply-settings.sh [--apply]
#        Without --apply it only prints what it would change. Needs `gh` logged in as an admin.
# Logs:  .logs/repo-settings/
#
# Required approving reviews stay at 0 while there is one maintainer: more would block every
# merge. Raise `required_approving_review_count` in ruleset-main.json with the first co-maintainer.
set -euo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly SETTINGS_DIR="${ROOT_DIR}/.github/settings"
readonly LOG_DIR="${ROOT_DIR}/.logs/repo-settings"
readonly REPOSITORY="openapi-typesafe/openapi-typesafe"
readonly MAINTAINER="fedorello"
readonly ENVIRONMENT="npm-publish"
IS_APPLY=0
[[ "${1:-}" == "--apply" ]] && IS_APPLY=1

mkdir -p "${LOG_DIR}"
log() {
  echo "apply-settings: $*" | tee -a "${LOG_DIR}/apply-settings.log"
}

# Run a `gh api` call, or only print it without --apply.
api() {
  if [[ "${IS_APPLY}" == "1" ]]; then
    gh api "$@" >> "${LOG_DIR}/api-responses.log"
  fi
  log "gh api $*"
}

# Rulesets, secret scanning and provenance all need a public repository; stop before changing
# anything on a private one. A dry run still prints the plan, so it can be reviewed beforehand.
visibility="$(gh api "repos/${REPOSITORY}" --jq .visibility)"
if [[ "${visibility}" != "public" ]]; then
  if [[ "${IS_APPLY}" == "1" ]]; then
    log "${REPOSITORY} is ${visibility}; make it public first (ENGINEERING_PLAN 11.2)"
    exit 1
  fi
  log "${REPOSITORY} is ${visibility}; printing the plan only, --apply needs a public repository"
fi

for ruleset in ruleset-main.json ruleset-release-tags.json; do
  name="$(node -p "require('${SETTINGS_DIR}/${ruleset}').name")"
  existing=""
  # A private repository on the free plan cannot have rulesets, and reading them fails with 403.
  if [[ "${visibility}" == "public" ]]; then
    existing="$(gh api "repos/${REPOSITORY}/rulesets" --jq ".[] | select(.name == \"${name}\") | .id")"
  fi
  if [[ -n "${existing}" ]]; then
    api --method PUT "repos/${REPOSITORY}/rulesets/${existing}" --input "${SETTINGS_DIR}/${ruleset}"
  else
    api --method POST "repos/${REPOSITORY}/rulesets" --input "${SETTINGS_DIR}/${ruleset}"
  fi
done

api --method PATCH "repos/${REPOSITORY}" \
  -f "security_and_analysis[secret_scanning][status]=enabled" \
  -f "security_and_analysis[secret_scanning_push_protection][status]=enabled"
api --method PUT "repos/${REPOSITORY}/private-vulnerability-reporting"

reviewer_id="$(gh api "users/${MAINTAINER}" --jq .id)"
api --method PUT "repos/${REPOSITORY}/environments/${ENVIRONMENT}" --input - <<JSON
{
  "reviewers": [{ "type": "User", "id": ${reviewer_id} }],
  "deployment_branch_policy": { "protected_branches": true, "custom_branch_policies": false }
}
JSON

# Changesets opens the "Version Packages" pull request with the workflow token
# (.github/workflows/release.yml); the token stays read-only by default.
api --method PUT "repos/${REPOSITORY}/actions/permissions/workflow" \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true

# The docs site is deployed by a workflow, not from a branch; a 404 means Pages is not set up yet.
if gh api "repos/${REPOSITORY}/pages" > /dev/null 2>&1; then
  api --method PUT "repos/${REPOSITORY}/pages" -f build_type=workflow
else
  api --method POST "repos/${REPOSITORY}/pages" -f build_type=workflow
fi

[[ "${IS_APPLY}" == "1" ]] && log "applied" || log "dry run; rerun with --apply"
