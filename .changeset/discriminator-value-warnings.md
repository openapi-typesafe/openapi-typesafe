---
"openapi-typesafe": patch
---

A discriminator member whose value (its mapping key, or its schema name without one) its own
property `enum` or `const` does not allow now gets a warning that names the Discriminator Object
rule and the mapping entry to add. No value of such a schema matches the discriminator.
