---
"openapi-typesafe-fetch": patch
---

Middleware request ids come from a counter, not `Math.random()`, for Next.js prerendering
(upstream [#2486](https://github.com/openapi-ts/openapi-typescript/issues/2486)).
