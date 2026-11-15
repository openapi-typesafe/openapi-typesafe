---
"openapi-typesafe-react-query": patch
---

Query keys leave out functions in the init (`fetch`, serializers, the hooks of a `middleware`).
With an inline function, `invalidateQueries`, `setQueriesData` and `getQueriesData` with the key
of a later render, or after `hydrate`, missed the query.
