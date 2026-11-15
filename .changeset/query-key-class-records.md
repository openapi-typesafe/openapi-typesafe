---
"openapi-typesafe-react-query": patch
---

Query keys read `params` and its `query`, `path` and `header` records by their members also when
they are class instances, as the fetch client sends them. Such a record with `NaN` no longer
shares a cache entry with `null`, a bigint in it no longer crashes the component, and
`setQueriesData` with the key of one date no longer writes into the queries of other dates.
