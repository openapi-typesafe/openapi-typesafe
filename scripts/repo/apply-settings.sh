#!/usr/bin/env bash
# Apply the repository settings of ENGINEERING_PLAN 9.8 when the repository goes public (11.2):
# rulesets for main and release tags, squash merges only, secret scanning with push protection,
# private vulnerability reporting, Dependabot alerts and security updates, CodeQL default setup,
# immutable releases, the `npm-publish` environment with the maintainer as required reviewer,
# Actions pinned by SHA with approval for every outside contributor, pull requests opened by
# workflows, and GitHub Pages built by .github/workflows/docs.yml. Audit B3 (2026-11-07) added
# the security updates, CodeQL, immutable releases, SHA pinning and fork approval.
#
# Usage: scripts/repo/apply-settings.sh [--apply]
#        Without --apply it only prints what it would change. Needs `gh` logged in as an admin.
# Logs:  .logs/repo-settings/
#
# Required approving reviews stay at 0 while there is one maintainer: more would block every
# merge. Raise `required_approving_review_count` in ruleset-main.json with the first co-maintainer,
# and set `prevent_self_review` on the environment then.
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

# The ruleset allows squash merges only; the merge button offers the same.
apply_merge_settings() {
  api --method PATCH "repos/${REPOSITORY}" -F allow_squash_merge=true \
    -F allow_merge_commit=false -F allow_rebase_merge=false
}

apply_security_settings() {
  api --method PATCH "repos/${REPOSITORY}" \
    -f "security_and_analysis[secret_scanning][status]=enabled" \
    -f "security_and_analysis[secret_scanning_push_protection][status]=enabled"
  api --method PUT "repos/${REPOSITORY}/private-vulnerability-reporting"
  # Dependabot alerts turn on the dependency graph, which the `dependency review` check of pull
  # requests needs; without it the check fails with "not supported on this repository".
  api --method PUT "repos/${REPOSITORY}/vulnerability-alerts"
  # Security updates open a pull request as soon as an advisory has a fix, without the weekly
  # schedule and the cooldown of .github/dependabot.yml.
  api --method PUT "repos/${REPOSITORY}/automated-security-fixes"
  # CodeQL for the TypeScript and JavaScript sources and for the workflows (Scorecard SAST).
  api --method PATCH "repos/${REPOSITORY}/code-scanning/default-setup" -f state=configured \
    -f query_suite=default -f "languages[]=actions" -f "languages[]=javascript-typescript"
  # A published release keeps its tag and files. The release job uploads the files to a draft
  # first, so this does not get in its way (ADR-007, amendment of 2026-11-07).
  api --method PUT "repos/${REPOSITORY}/immutable-releases"
}

# Every action is already pinned by SHA (Dependabot updates the pins); this makes it a rule. The
# organization setting is set too, so a new repository starts with it.
apply_actions_settings() {
  api --method PUT "orgs/${REPOSITORY%%/*}/actions/permissions" \
    -f enabled_repositories=all -f allowed_actions=all -F sha_pinning_required=true
  api --method PUT "repos/${REPOSITORY}/actions/permissions" \
    -F enabled=true -f allowed_actions=all -F sha_pinning_required=true
  # Workflows of a fork pull request wait for approval for every outside contributor, not only for
  # first-time ones: one merged typo fix would otherwise run every later pull request at once.
  api --method PUT "repos/${REPOSITORY}/actions/permissions/fork-pr-contributor-approval" \
    -f approval_policy=all_external_contributors
}

apply_merge_settings
apply_security_settings
apply_actions_settings

reviewer_id="$(gh api "users/${MAINTAINER}" --jq .id)"
api --method PUT "repos/${REPOSITORY}/environments/${ENVIRONMENT}" --input - <<JSON
{
  "reviewers": [{ "type": "User", "id": ${reviewer_id} }],
  "can_admins_bypass": false,
  "deployment_branch_policy": { "protected_branches": true, "custom_branch_policies": false }
}
JSON

# Changesets opens the "Version Packages" pull request with the workflow token
# (.github/workflows/release.yml); the token stays read-only by default. The organization setting
# comes first: while it forbids pull requests from workflows, the repository setting fails (409).
api --method PUT "orgs/${REPOSITORY%%/*}/actions/permissions/workflow" \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true
api --method PUT "repos/${REPOSITORY}/actions/permissions/workflow" \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true

# The docs site is deployed by a workflow, not from a branch; a 404 means Pages is not set up yet.
if gh api "repos/${REPOSITORY}/pages" > /dev/null 2>&1; then
  api --method PUT "repos/${REPOSITORY}/pages" -f build_type=workflow
else
  api --method POST "repos/${REPOSITORY}/pages" -f build_type=workflow
fi

[[ "${IS_APPLY}" == "1" ]] && log "applied" || log "dry run; rerun with --apply"
