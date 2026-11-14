---
"openapi-typesafe-react-query": patch
---

Query keys hold the values of plain `headers` as the text that is sent: `new Number(5)` and
`new Number(6)` no longer share a cache entry, and a `Date` or `URL` header is keyed by the text
`Headers` sends for it.
