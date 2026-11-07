---
"openapi-typesafe-fetch": patch
---

Headers given as a list of pairs (`headers: [["x-t", "1"]]`, a `HeadersInit` form) are sent as
they are, in `createClient()`, per request and in `mergeHeaders()`; they were sent as a header
named `0` with the value `x-t,1`. `defaultBodySerializer` reads the `Content-Type` from a list of
pairs too, and from a record in any letter case (`"CONTENT-TYPE"`).
