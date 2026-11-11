---
"openapi-typesafe-react-query": patch
---

An init whose `params` or `headers` send nothing now has the query key of no init:
`{ params: {} }`, `{ params: { query: { cursor: undefined } } }`, `{ params: { query: filters } }`
with `filters` undefined, and `{ headers: { "X-Tenant": undefined } }`. Each had its own key, so
`setQueryData`, `getQueryData` and server prefetches of one were not seen by the others, and each
fetched again. `null`, `[]` and `{}` parameter values still count, and so does an empty JSON body.
