---
"openapi-typesafe": patch
---

More `$ref`s into a schema compile and get the type they point at:

- A `$ref` into the `content` of a header or parameter follows the generated type: the media type
  member of a header (`components["headers"]["H"]["text/plain"]`), or with the
  `parameter-header-content` fix the media type's type itself. A parameter typed `string` and
  `content` next to a `schema` are typed in place. Before, `["content"]["text/plain"]["schema"]`
  did not compile (TS2339).
- With `--read-write-markers`, a `$ref` through an optional property gets `NonNullable` as
  without the flag; one through a `$Read` or `$Write` property is typed in place.
- A `$ref` through a property with a `default` that the output makes optional (in a request body,
  or under a property named `hyperparameters`) gets `NonNullable`: the property is read as
  optional or required by where it is, not where the `$ref` is.
