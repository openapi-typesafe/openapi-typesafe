---
"openapi-typesafe": patch
---

The `--no-` form of a flag that takes a value (`--no-output`, `--no-redocly`, `--no-fix`,
`--no-local-ref-root`, `--no-remote-ref-hosts`) fails with `CLI_FLAG_INVALID`. It used the text
`false` as the value: `--no-output` wrote the types to a file named `false`.
