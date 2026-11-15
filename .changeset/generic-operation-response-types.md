---
"openapi-typesafe-fetch": patch
"openapi-typesafe-helpers": patch
---

The response types of an operation that is a type parameter are checked again. In code generic
in the paths (a function that takes any `Client<Paths>`), `data` and `error` of a call could be
assigned to any type, such as a `number`, and an annotated result became `undefined` for every
caller. `SuccessResponse`, `ErrorResponse`, `SuccessResponseJSON` and `ErrorResponseJSON` of a
generic operation could be assigned to any type too. Callers still get the bodies of their
paths. `ResponseObjectMap` of a type without `responses` is now `never` instead of `unknown`.
