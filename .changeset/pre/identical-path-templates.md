---
"openapi-typesafe": patch
---

Paths that differ only in their parameter names, such as `/users/{id}` and `/users/{name}`, now
get a warning, `PATH_TEMPLATES_IDENTICAL`: the OpenAPI Paths Object forbids them. With
`--path-params-as-types` they share one key type, and when their path items had the same type the
output repeated the index signature and did not compile (TS2374); each of them is now in an object
of its own in the `paths` intersection, as paths with different types already were. Warnings about
the document now end with a code, as errors do: the `in: querystring` warning ends with
`(QUERYSTRING_NEXT_TO_QUERY)`.
