---
"openapi-typesafe-fetch": patch
---

An empty success body read with `parseAs: "text"`, `"blob"`, `"arrayBuffer"` or `"stream"` gives
`""`, an empty `Blob` or `ArrayBuffer`, or `response.body`, as its type says. A 204, an answer to
HEAD or a `Content-Length: 0` gave `undefined`, while the same empty body without a length gave
`""`. With the default `parseAs: "json"` an empty body is still `undefined`.
