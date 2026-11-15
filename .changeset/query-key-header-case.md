---
"openapi-typesafe-react-query": patch
---

Query keys write header names in lower case and in their order, as `Headers` sends them, so
`{ "X-A": "1", "x-a": "2" }` and the same headers in reverse order, which send different values,
no longer share a cache entry. Header names in keys are now always lower case.
