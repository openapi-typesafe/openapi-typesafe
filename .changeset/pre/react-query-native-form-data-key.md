---
"openapi-typesafe-react-query": patch
---

A React Native `FormData` body is now part of the query key by its fields, the parts its
`getParts` gives (each field's name and text, or the `uri`, `name` and `type` of a file). React Native's FormData has no
`entries`, so before every such body of one path had the same key and showed the same result.
