---
"openapi-typesafe": patch
---

Every warning now ends with a code, as docs/cli.md promises. New codes: `LINT_PROBLEM` for a
Redocly lint rule with severity `warn` (the line also names the rule, for example
`rule operation-operationId-unique`, so `redocly.yaml` can turn it off),
`DISCRIMINATOR_MAPPING_INVALID`, `REF_NOT_FOUND`, `REF_CIRCULAR`, `FIX_NEEDS_OPTION`,
`LEGACY_CALLBACK_DEPRECATED` and `CLI_INPUT_IGNORED`. The text before the code is unchanged.
The migration guide now says that regenerating can print warnings that openapi-typescript did
not print, while the output stays the same.
