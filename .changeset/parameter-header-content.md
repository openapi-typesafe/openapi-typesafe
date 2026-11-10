---
"openapi-typesafe": patch
---

The `parameter-content` fix is now `parameter-header-content` and types a response header with
`content` by the schema of its media type too (`"X-Rate": { limit: number }`), not as a map of
media types. Configs that name `parameter-content` fail with `OPTION_FIX_UNKNOWN` until renamed.
