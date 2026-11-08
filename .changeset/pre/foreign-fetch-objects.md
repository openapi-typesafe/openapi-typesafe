---
"openapi-typesafe-fetch": patch
---

`fetch`, `Request`, `Response` and `Headers` from `undici` or another realm (iframe, `node:vm`,
Jest) are accepted, in options and from middleware, and `defaultBodySerializer` reads their
headers (upstream [#1847](https://github.com/openapi-ts/openapi-typescript/issues/1847), [#2562](https://github.com/openapi-ts/openapi-typescript/issues/2562), [#2637](https://github.com/openapi-ts/openapi-typescript/issues/2637)).
