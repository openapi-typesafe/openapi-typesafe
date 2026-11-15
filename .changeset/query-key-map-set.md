---
"openapi-typesafe-react-query": patch
---

A `Map` or `Set` in a body or in `params` is part of the query key by its contents, so requests
with different `Map`s or `Set`s, which a custom `querySerializer` or `bodySerializer` sends
differently, no longer share one cache entry.
