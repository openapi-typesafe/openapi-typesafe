---
"openapi-typesafe-fetch": patch
"openapi-typesafe-helpers": patch
"openapi-typesafe-react-query": patch
---

Code that is generic in the path compiles again. `SuccessResponse`, `ErrorResponse`,
`ErrorResponseJSON` and the `data` and `error` of `FetchResponse` for `Paths[Path]` gave the whole
`responses` map next to the response bodies, so assigning them to the bodies failed with TS2322.
They give the bodies now. This also fixes the error type of hook wrappers generic in the path.
