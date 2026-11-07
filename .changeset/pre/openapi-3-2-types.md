---
"openapi-typesafe": minor
---

OpenAPI 3.2 documents are accepted and typed: the `query` operation, `additionalOperations`,
`itemSchema`, `in: querystring` and `components.mediaTypes`. Documents without them keep their
output. The `Method` type includes `"query"`. Needs `@redocly/openapi-core` `^1.34.22` (upstream
[#2577](https://github.com/openapi-ts/openapi-typescript/issues/2577)).
