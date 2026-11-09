---
"openapi-typesafe": patch
---

A key that contains `#/`, such as a path `/items/#/%zz`, a property `a#/b` or a parameter name,
no longer makes the generator throw `URIError: URI malformed`. openapi-typescript read such a key
as a `$ref`; now it is one segment of the pointers the generator builds, so an `--enum-values`
array of such a key points at its own node. The exported `createRef` keeps the old behaviour. The
new enum names of such keys are listed under Major Changes.

These pointers, and the ones in the generator's errors, escape `#` as `%23` and `%` as `%25`
(RFC 6901), so a key like `a#` no longer cuts a pointer short. A discriminator `mapping` to a
schema whose name has a `%`, such as `50%`, no longer throws `URIError` either.
