---
"openapi-typesafe": patch
---

New output fix `discriminator-own-mapping` (`--fix discriminator-own-mapping`, ADR-021): a schema
that defines a discriminator with a `mapping` and also `allOf`s another discriminator owner keeps
its own discriminator. Before, the inherited one replaced it during the scan, so every schema
listed after the owner lost its mapped value and got its schema name, and the output depended on
the order of the schemas: `contentType: "JDocumentContentModel"` instead of
`contentType: "jDocument"` (openapi-typescript
[#2200](https://github.com/openapi-ts/openapi-typescript/issues/2200)). Without the fix the output
does not change; `--fix all` now includes it.
