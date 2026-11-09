---
"openapi-typesafe": patch
---

`silent: true` in the Node API also hides the problem lines of a document that fails to load,
such as `Can't resolve $ref`; the rejected `SCHEMA_INVALID` error lists them in
`details.problems`. openapi-typescript printed them to stderr even with `silent`.
