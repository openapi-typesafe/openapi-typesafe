---
"openapi-typesafe-fetch": patch
---

A call whose method is typed `HttpMethod` (`client.request(method, path)`, or
`Parameters<typeof client.request>`) takes the arguments of every operation; its path was `never`
(upstream [#2178](https://github.com/openapi-ts/openapi-typescript/issues/2178)).
