---
"openapi-typesafe-fetch": patch
---

A custom `fetch` that returns an object without the members of a `Response` (`ok`, `status`,
`headers`, `text()`), such as a hand-written test double, throws
`fetch: must return new Response()`, as such a result of middleware already does. The client read
`ok` as `undefined` and put the body of a successful response into `error`.
