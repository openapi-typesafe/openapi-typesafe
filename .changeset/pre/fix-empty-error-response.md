---
"openapi-typesafe-fetch": patch
---

An error response with an empty body gives `error: undefined`, also without `Content-Length`; it
gave `""` (upstream PR [#2605](https://github.com/openapi-ts/openapi-typescript/pull/2605)).
