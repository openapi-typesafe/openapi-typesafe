---
"openapi-typesafe": patch
---

Require `@redocly/openapi-core` `^1.34.22`. The old range allowed 1.34.6 to 1.34.14, which reject
OpenAPI 3.2 documents, so an install that resolved one of them failed on 3.2 input.
