---
"openapi-typesafe": minor
---

OpenAPI 3.2 documents are accepted and typed: the `query` operation, `additionalOperations`,
`itemSchema`, `in: querystring` and `components.mediaTypes`. Documents without them keep their
output. The `Method` type includes `"query"`. Needs `@redocly/openapi-core` `^1.34.22` (upstream
[#2577](https://github.com/openapi-ts/openapi-typescript/issues/2577)).

The types generated for these 3.2 keys are experimental in 1.x: a minor release may change their
shape, for example to match openapi-typescript once it supports 3.2, and its changelog will say so.
The output of documents without these keys, `client.QUERY()` and the `"query"` member of
`HttpMethod` follow semver as usual.
