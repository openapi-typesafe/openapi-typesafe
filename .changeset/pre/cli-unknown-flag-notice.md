---
"openapi-typesafe": patch
---

The CLI now prints `Unknown flag --x is ignored (see --help)` for each flag it does not know. The
run still goes on, as before, but a typo such as `--alphabetise` no longer changes the output
without a word.
