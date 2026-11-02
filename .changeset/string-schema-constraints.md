---
"openapi-typesafe": patch
---

The public `StringSubtype` type has `minLength`, `maxLength` and `pattern`, so callbacks can read
them after narrowing a Schema Object to `type: "string"`.
