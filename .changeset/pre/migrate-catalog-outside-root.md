---
"openapi-typesafe-migrate": patch
---

A `catalog:` dependency whose catalog entry is not in the project (`--root packages/api` of a pnpm
workspace) keeps its name and is reported as a manual step: the entry above the root cannot be
renamed, and renaming only the dependency failed the install with
`ERR_PNPM_CATALOG_ENTRY_NOT_FOUND_FOR_SPEC`.
