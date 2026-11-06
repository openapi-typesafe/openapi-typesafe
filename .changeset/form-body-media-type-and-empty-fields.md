---
"openapi-typesafe-fetch": patch
---

An object body with `Content-Type: application/x-www-form-urlencoded; charset=UTF-8` (or any other
parameter, in any letter case) is sent as a form; it was sent as JSON. A `null` or `undefined`
field of a form body is left out, as in a multipart body; it was sent as the text `null` or
`undefined`.
