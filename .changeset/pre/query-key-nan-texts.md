---
"openapi-typesafe-react-query": patch
---

`NaN`, `Infinity` and `-Infinity` in query, path and header parameters, in headers and in form or
multipart fields no longer share the query key of `null` and of each other. The fetch client sends
them as the text `NaN` or `Infinity` (and nothing for `null`), so these different requests showed
one another's data. A query with `NaN` in its key now also matches itself in
`invalidateQueries({ queryKey })`.
