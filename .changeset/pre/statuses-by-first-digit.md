---
"openapi-typesafe-fetch": patch
---

A response is typed as data or an error by the first digit of its status, as `response.ok` reads
it: a declared 205, 208 or 226 types `data` with its body, and a 419 types `error` with its body.
The types classified by two closed lists of statuses, `OkStatus` and `ErrorStatus`, which stay
exported. New helper types `SuccessStatusKey` and `ErrorStatusKey` name the statuses of each kind.
