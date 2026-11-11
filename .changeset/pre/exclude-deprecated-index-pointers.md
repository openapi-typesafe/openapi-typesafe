---
"openapi-typesafe": patch
---

With `--exclude-deprecated`, a `$ref` to a property it leaves out is typed as that property's
schema also when the object has `additionalProperties`. It was read through the index signature,
so a `type: string` property was typed as the `additionalProperties` type (`number`), without an
error.
