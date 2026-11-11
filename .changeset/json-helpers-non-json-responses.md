---
"openapi-typesafe-fetch": patch
"openapi-typesafe-helpers": patch
---

`SuccessResponseJSON`, `ErrorResponseJSON` and the `data` and `error` of a client made with
`` createClient<paths, `${string}/json`>() `` leave out a response that has no JSON media type. It
added its whole `content` map, so a `text/html` 500 typed the error as `{ "text/html": string }`,
a value the client never returns.
