---
"openapi-typesafe-migrate": patch
---

The migration now lists the old flags after a variable that runs a command when it cannot see
where the variable is set: in another GitLab `script` item, through `$GITHUB_ENV` in an earlier
step, as `$$GEN` in a Makefile recipe, as a bash array run with `"${GEN[@]}"`, or outside the
file. Before, flags like `-it` after such a variable were kept without a word, and the new
generator then stopped with an unknown flag. The items of a bash array are now renamed too.
