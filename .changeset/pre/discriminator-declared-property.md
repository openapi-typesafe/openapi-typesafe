---
"openapi-typesafe": patch
---

A schema that inherits a discriminator through `allOf` and declares the discriminator property in
its own `properties` got the property twice in one object type (`class: "Child"; class?:
"Child";`), and the output did not compile (TS2300). The schema's own declaration is now kept,
required as a discriminator property must be. Output that compiled stays the same.
