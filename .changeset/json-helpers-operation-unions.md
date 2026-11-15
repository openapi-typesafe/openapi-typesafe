---
"openapi-typesafe-fetch": patch
"openapi-typesafe-helpers": patch
---

`SuccessResponseJSON` and `ErrorResponseJSON` of a union of operations are the union of each
operation's JSON bodies again. Before, only the status codes the operations share counted, so
`ErrorResponseJSON<OpA | OpB>` could gain a `string` that neither operation has alone.
