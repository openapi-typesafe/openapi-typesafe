---
"openapi-typesafe": patch
---

A remote `$ref` to a document served as `text/plain` loads when its URL has a query after the
extension (`pet.yaml?token=…`), no extension at all (`/schemas/pet`) or a dot that names no text
format (`/schemas/v1.0`, `/schemas/pet.v2`); before, it was kept as text and failed with
`Expected SchemaObject, received string`. A URL whose extension or type names a text format
(`.md`, `.markdown`, `.txt`, `.html`, `.htm`, `text/markdown`, `text/html`) stays text, as a
Markdown `description` does.
