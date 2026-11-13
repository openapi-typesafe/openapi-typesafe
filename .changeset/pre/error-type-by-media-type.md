---
"openapi-typesafe-fetch": patch
---

The `error` type now follows the media type of each error response, as the client reads it. An
error with a non-JSON media type, such as `text/plain`, is a `string` whatever its schema: a
`text/plain` error with an `integer` or `boolean` schema was typed as a number or a boolean, but
the client returns its text. An error with a media range such as `*/*`, `application/*` or
`text/*`, which may be JSON or not, is its schema or a `string`. `SuccessResponseJSON` and
`JSONLike` now count `text/*` as JSON too, like `application/*`. JSON errors keep their schemas, and success `data` is unchanged.
