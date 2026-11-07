---
"openapi-typesafe": patch
---

A remote document can no longer read local files through `$ref`. Redocly resolves its `$ref`s
with `new URL()`, so `C:/Users/me/x.json` (an absolute path on Windows) and `file:///…` were read
from disk. A `$ref` in a remote document that is not an `http(s)` URL now fails with
`SCHEMA_REF_FORBIDDEN`, reason `local-ref-from-remote`, without any option. See ADR-033.
