---
"openapi-typesafe-fetch": patch
---

Query parameter names and object keys are now percent-encoded, like values. A key from your data,
such as the keys of an `additionalProperties` query object, could add a parameter (`a&admin`) or a
path segment (`a/b`). `[`, `]`, `$`, `:`, `@` and `,` stay as written, so `filter[status]` and
`$filter` are unchanged. See ADR-013, decision 9.
