---
"openapi-typesafe-helpers": patch
"openapi-typesafe-fetch": patch
---

A call with a union of paths (`client.GET(path)` with `path: "/a" | "/b"`) types `data` and
`error` as the union of each operation's types. In openapi-fetch a path without a response body
typed `data` as its content map, and a path with only a `default` response typed it `undefined`.
`SuccessResponse` and `ErrorResponse` of a union of response maps are the union of each map's
responses.
