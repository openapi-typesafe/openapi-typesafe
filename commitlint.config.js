/**
 * Conventional Commits rules (CODING_PRINCIPLES §13): header <= 72 characters, body lines <= 100.
 * Checked locally by the lefthook commit-msg hook and in CI for every pull request.
 */
const DEPENDABOT_SUBJECT = /^(build|ci)\(deps(-dev)?\): Bump /;

export default {
  extends: ["@commitlint/config-conventional"],
  // Dependabot always writes "Bump ..." with a capital letter, which subject-case refuses, and
  // that cannot be configured. Its commits never reach main: pull requests are squash-merged
  // with a title written to these rules.
  ignores: [(message) => DEPENDABOT_SUBJECT.test(message)],
  rules: {
    "header-max-length": [2, "always", 72],
    "body-max-line-length": [2, "always", 100],
    "footer-max-line-length": [2, "always", 100],
  },
};
