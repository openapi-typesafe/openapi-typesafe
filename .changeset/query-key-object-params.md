---
"openapi-typesafe-react-query": patch
---

Query keys tell apart object parameter values that keep their state outside their own members,
such as a `URL`, a Temporal value or a value object with private fields: the key also holds what
their `toJSON` returns and their text, which a `querySerializer` or `pathSerializer` set on the
fetch client may send. Two such values no longer share a cache entry, and `invalidateQueries` or
`setQueriesData` with the key of one no longer matches the other. An invalid `Date` parameter no
longer shares the key of a `null` one.
