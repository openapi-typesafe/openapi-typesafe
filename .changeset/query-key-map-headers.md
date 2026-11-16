---
"openapi-typesafe-react-query": patch
---

Query keys read `headers` exactly as the fetch client sends them. Headers given as a `Map` with a
`null` value (which removes the header) and with the text `"null"` shared one key, and so did
`undefined` (which sends nothing) and `"undefined"`; each now has its own key. `Headers` that
repeat a name keep its last value, as the client sets it, and headers that are not an object,
which the client skips, are left out of the key.
