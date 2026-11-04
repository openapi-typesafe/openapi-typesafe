---
"openapi-typesafe": patch
---

`--enum` no longer writes the same discriminator enum twice. A schema that its parent's
`discriminator.mapping` names and that a discriminated `oneOf` lists got its `…Kind` enum twice,
and the file failed with "Duplicate identifier". Inherited from openapi-typescript.
