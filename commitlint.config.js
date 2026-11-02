/**
 * Conventional Commits rules (CODING_PRINCIPLES §13): header <= 72 characters, body lines <= 100.
 * Checked locally by the lefthook commit-msg hook and in CI for every pull request.
 */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "header-max-length": [2, "always", 72],
    "body-max-line-length": [2, "always", 100],
    "footer-max-line-length": [2, "always", 100],
  },
};
