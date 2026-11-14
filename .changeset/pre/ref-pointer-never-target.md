---
"openapi-typesafe": patch
---

A `$ref` through `allOf/0` of a schema with `oneOf` variants of only `type: object`
(`Contact/allOf/0/properties/owner/properties/name`) now gets the type it points at; before, it
was `Contact["allOf"]["0"]["owner"]["name"]`, which compiles but is `never`, so no value fits.
