---
"openapi-typesafe": patch
---

A remote `$ref` to a document served as `text/plain` loads when its URL has a query after the
extension (`pet.yaml?token=…`) or no extension at all (`/schemas/pet`); before, it was kept as
text and failed with `Expected SchemaObject, received string`.
