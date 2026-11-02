---
"openapi-typesafe-fetch": patch
---

`defaultBodySerializer` recognizes headers from another JavaScript realm (an iframe, `node:vm`, Jest VM modules), so an `application/x-www-form-urlencoded` body is no longer sent as JSON there. Its type now declares the optional `headers` parameter. Fixes upstream #2637.
