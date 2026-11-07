---
"openapi-typesafe": patch
---

The exported `Method` type includes the OpenAPI 3.2 `"query"` method, as `HttpMethod` of
openapi-typesafe-helpers does. Code that accepts a `Method` keeps compiling.
