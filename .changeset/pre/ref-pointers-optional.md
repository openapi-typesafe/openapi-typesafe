---
"openapi-typesafe": patch
---

With `--fix ref-pointers`, a schema `$ref` to an optional property no longer adds `undefined` to the property's type: it is written as `Exclude<Owner["key"], undefined>`. Without the fix the type stays as before.
