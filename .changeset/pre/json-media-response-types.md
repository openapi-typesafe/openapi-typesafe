---
"openapi-typesafe-fetch": patch
"openapi-typesafe-helpers": patch
---

Response types follow what the client returns. `ErrorResponseJSON`, `SuccessResponseJSON` and the
`data` and `error` of a client made with `` createClient<paths, `${string}/json`>() `` keep a
JSON body of any JSON media type: an `application/problem+json` error, an
`application/vnd.api+json` success and `application/json; charset=utf-8` bodies were left out,
so the error could be `never` or miss a status. An error that is not JSON, such as the HTML page
of a proxy, is typed `string`, the text the client returns, instead of being left out.
