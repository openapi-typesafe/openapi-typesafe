---
"openapi-typesafe-fetch": patch
---

A `.` or `..` path parameter is rejected also when the path template has a query string or a
fragment: `GET("/echo/{id}?v=2", { params: { path: { id: ".." } } })` was sent to the parent path.
A `/../` inside the template's own query string is no longer taken for a dot segment.
