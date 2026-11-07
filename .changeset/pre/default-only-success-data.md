---
"openapi-typesafe-helpers": patch
"openapi-typesafe-fetch": patch
---

With no 2XX response, `data` is typed with the `default` response, not `never` (upstream
[#1862](https://github.com/openapi-ts/openapi-typescript/issues/1862)).
