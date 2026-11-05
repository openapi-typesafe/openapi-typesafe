---
"openapi-typesafe-helpers": patch
"openapi-typesafe-fetch": patch
---

An operation that declares no 2XX response types `data` with its `default` response, which covers
every undeclared status, successes too. `data` was `never` (upstream #1862). `SuccessResponse`
follows the same rule. With a 2XX response declared, `default` still types only `error`.
