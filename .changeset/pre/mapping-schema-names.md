---
"openapi-typesafe": patch
---

A discriminator `mapping` value that names a schema (`cat: Cat`), as OpenAPI allows, is read as
`#/components/schemas/Cat`, also in a document a `$ref` loads, where it names that document's
schemas. It failed with "Can't resolve $ref"; any other value is still a URI reference. A `mapping`
inside `example`, `examples`, `default`, `const`, `enum` or an `x-` value is data and stays as
written. A problem in a document other than the root now names that document: its path, or its URL
without the query.
