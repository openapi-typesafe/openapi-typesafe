---
"openapi-typesafe": minor
---

An `--output` or `x-openapi-ts.output` that cannot be a file fails with the new error code
`CLI_OUTPUT_INVALID` (exit code `2`) before anything is generated: a URL of another scheme
(`-o https://…`), a path that ends with a separator (`-o gen/`) or an existing directory.
openapi-typescript failed on them with `EISDIR` or a stack trace.
