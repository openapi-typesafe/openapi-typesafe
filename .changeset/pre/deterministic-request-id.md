---
"openapi-typesafe-fetch": patch
---

Middleware request ids come from a process-wide counter instead of `Math.random()`. Next.js prerendering rejected the random value as a side effect before uncached data. Ids stay unique, also across clients that share a middleware. Fixes upstream #2486 (as #2763 proposed).
