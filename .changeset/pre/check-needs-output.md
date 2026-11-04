---
"openapi-typesafe": patch
---

`--check` without `--output` (and without `apis` in `redocly.yaml`) now fails with exit code 2 and
`CLI_CHECK_OUTPUT_MISSING`. Before, it printed the types and exited with 0 without checking
anything, so a CI check could pass by mistake.
