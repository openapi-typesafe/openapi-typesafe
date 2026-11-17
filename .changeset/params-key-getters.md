---
"openapi-typesafe-react-query": patch
---

Query keys read `params` the way the fetch client reads them to send them. A `query`, `path` or
`header` record behind a getter of a class, a path value behind a getter (a DTO whose `id` reads a
private field), and inherited members of a query record are now in the key, so two requests that
send different URLs no longer share a cache entry.
