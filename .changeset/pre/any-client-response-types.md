---
"openapi-typesafe-fetch": patch
"openapi-typesafe-helpers": patch
---

`createClient<any>()` types `data` and `error` as `any` again; they were `never`, so
`if (error)` made the whole result `never`. `SuccessResponse<any>` and `ErrorResponse<any>` are
`any` too.
