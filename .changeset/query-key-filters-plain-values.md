---
"openapi-typesafe-react-query": patch
---

`invalidateQueries`, `setQueriesData` and `removeQueries` with the `queryKey` of one query now
match only that query when its request holds a `Date`, a `Number`, `Boolean` or `String` object, or
another object with a `toJSON`. Such a value was kept in the key as an object without members, and
TanStack Query's filters compare objects by their members, so `setQueriesData` for one date also
wrote into the queries of every other date. In a body the key now holds the value's JSON form; in
query, path and header parameters and in headers, the text the fetch client sends (a `Date` as its
ISO text).
