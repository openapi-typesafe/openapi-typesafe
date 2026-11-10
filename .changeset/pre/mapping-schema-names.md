---
"openapi-typesafe": patch
---

A discriminator `mapping` value that names a schema (`cat: Cat`), as OpenAPI allows, is read as
`#/components/schemas/Cat`. It failed with "Can't resolve $ref"; any other value is still a URI
reference.
