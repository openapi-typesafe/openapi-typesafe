---
"openapi-typesafe": patch
---

`openapiTS()` with a `Readable` stream that fails now rejects with `SCHEMA_LOAD_FAILED`. Before,
the promise never settled.
