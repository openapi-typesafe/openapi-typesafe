---
"openapi-typesafe": minor
---

Two new opt-in output fixes (ADR-021):

- `ref-siblings`: in OpenAPI 3.1 and 3.2 documents, keywords next to a `$ref` (`required`,
  `properties`, `enum`) apply, as JSON Schema 2020-12 says, so
  `{ $ref: Base, required: [extra], properties: { extra } }` is `{ extra: string } & Base`
  instead of `Base`. OpenAPI 3.0 documents keep ignoring them, as their spec says.
- `parameter-content`: a parameter with `content` instead of `schema`, such as a JSON object in
  a query parameter, is typed by the schema of its media type instead of `string`.
