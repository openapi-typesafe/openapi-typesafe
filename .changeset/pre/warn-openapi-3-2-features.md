---
"openapi-typesafe": patch
---

Warn about OpenAPI 3.2 features that the generated types leave out: the `query` operation,
`additionalOperations`, `in: querystring` parameters and `itemSchema`. Each use prints its JSON
Pointer. Before, they were dropped without a word. See "OpenAPI 3.2 features" in the docs.
