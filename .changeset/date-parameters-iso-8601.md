---
"openapi-typesafe-fetch": patch
---

A `Date` parameter is sent as ISO 8601 (`toISOString()`) in every query and path style. A `Date`
on its own or in a path was left out, and one in an array or a `form` object was sent as
`String(date)`, a local time text (audit finding F7, ADR-041).
