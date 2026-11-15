---
"openapi-typesafe-react-query": patch
---

A function inside a request body, such as an arrow function field of a class, is no longer part of
the query key. `invalidateQueries`, `getQueriesData` and `setQueriesData` with the key of a later
render, or after `hydrate`, now find the query.
