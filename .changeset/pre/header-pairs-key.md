---
"openapi-typesafe-react-query": patch
---

Query keys of headers given as pairs follow the fetch client's rule for pairs: `null` removes the
header, `undefined` sends nothing and an array value appends its items, so the key names the
headers the request sends.
