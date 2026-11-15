---
"openapi-typesafe-react-query": patch
---

A parameter or header value whose `toJSON`, `toString`, `toISOString` or getter throws, or that
refers back to itself, no longer crashes the component while it renders: the key leaves that
part out, and the request reports the error as a query error.
