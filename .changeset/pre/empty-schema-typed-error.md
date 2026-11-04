---
"openapi-typesafe": patch
---

An empty schema file, or a document that is only `null`, now fails with
`SCHEMA_VERSION_UNSUPPORTED` ("Unsupported schema format, expected `openapi: 3.x`") instead of a
`TypeError` and exit code 70. Inherited from openapi-typescript.
