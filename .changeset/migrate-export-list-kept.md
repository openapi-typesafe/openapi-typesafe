---
"openapi-typesafe-migrate": patch
---

A constant or an import that an `export { … }` list names is no longer removed with the old
`transform` returns, so the file still compiles.
