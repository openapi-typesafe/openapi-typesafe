---
"openapi-typesafe": patch
---

A `$ref` to a `false` schema (`additionalProperties: false`, `unevaluatedProperties: false`,
`items: false`) no longer prints a "Could not resolve $ref" warning (`REF_NOT_FOUND`) with the
`read-write-refs` fix or `--fix=all`. The `$ref` resolved all along; only the warning was wrong.
