---
"openapi-typesafe": patch
---

A schema `$ref` to the discriminator property of a mapped schema, such as
`$ref: "#/components/schemas/Dog/properties/kind"` with `kind: { type: string }`, is typed by that
property's schema (`string`), not by the value the discriminator gives `Dog` (`"dog"`). A property
whose own `enum` lists exactly that value keeps its pointer type.
