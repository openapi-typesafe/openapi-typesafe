---
"openapi-typesafe-fetch": patch
---

A `Date` in an exploded query array or object (the default styles) is sent as ISO 8601
(`toISOString()`); openapi-fetch threw "Deeply-nested arrays/objects aren't supported". A `Date`
field of a `multipart/form-data` body is sent as ISO 8601 too. The places where openapi-fetch left
a `Date` out or sent it as a local time text are listed under Major Changes.
