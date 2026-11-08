---
"openapi-typesafe": patch
---

The types generated for the OpenAPI 3.2 additions (`query` operations, `additionalOperations`,
`itemSchema`, `in: querystring`, `components.mediaTypes`) are experimental in 1.x: a minor release
may change their shape, for example to match openapi-typescript once it supports 3.2, and its
changelog says so. The output of documents without these keys, `client.QUERY()` and the `"query"`
member of `HttpMethod` keep the full semver promise.
