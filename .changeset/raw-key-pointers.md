---
"openapi-typesafe": patch
---

A key that contains `#/`, such as a path `/items/#/%zz`, a property `a#/b` or a parameter name,
no longer makes the generator throw `URIError: URI malformed`. openapi-typescript read such a key
as a `$ref` and named the node by the text after the last `#/`; now it is one segment of the
pointers the generator builds, so with `--enum` and `--enum-values` its enum name holds the whole
key (`RateAB` for the property `a#/b` of `Rate`, not `RateB`) and its values array points at its
own node. The exported `createRef` keeps the old behaviour.

These pointers, and the ones in the generator's errors, escape `#` as `%23` and `%` as `%25`
(RFC 6901), so a key like `a#` no longer cuts a pointer short. A discriminator `mapping` to a
schema whose name has a `%`, such as `50%`, no longer throws `URIError` either.
