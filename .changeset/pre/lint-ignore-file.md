---
"openapi-typesafe": patch
---

Lint problems listed in `.redocly.lint-ignore.yaml` no longer fail the run: they are skipped, as
`redocly lint` skips them (openapi-typescript
[#2189](https://github.com/openapi-ts/openapi-typescript/issues/2189)). Before, an ignored error
still stopped the generation with `SCHEMA_INVALID`.
