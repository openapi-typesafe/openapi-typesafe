---
"openapi-typesafe-react-query": patch
---

`NaN` and the string `"NaN"` in `params` no longer share a cache entry, and neither do the
infinities and a bigint with their text: a JSON `querySerializer` sends them differently. Such a
number is now `{ "(number)": "NaN" }` in the query key.
