---
"openapi-typesafe": patch
---

A `$ref` through an index signature that holds more than its target's type is typed as the target
by default in more places: to the `additionalProperties` of an object under `$defs`
(`D/$defs/Inner/additionalProperties`) or of an object with a `discriminator`, to the
`additionalProperties` of an object that also has `patternProperties`, to one of several
patterns (which did not compile), and with `--exclude-deprecated` to a left-out property of an
object with a `discriminator`. These read the whole index signature (`boolean | string` for a
`boolean` target), so a wrong value was accepted.
