---
"openapi-typesafe-fetch": patch
---

A `Date` parameter is sent as ISO 8601 (`toISOString()`) in every query and path style, and so is
a `Date` field of an `application/x-www-form-urlencoded` or `multipart/form-data` body. A `Date`
on its own or in a path was left out, and one in an array, a `form` object or a form body was sent
as `String(date)`, a local time text (audit finding F7, ADR-041).
