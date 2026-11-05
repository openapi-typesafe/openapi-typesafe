---
"openapi-typesafe": patch
---

`--enum-values`: the type of a values array for an enum under a `oneOf`/`anyOf` variant narrows
the union with `Extract<T, { name: unknown }>`. A property name that is not an identifier, such as
`content-type`, was written without quotes there, and the output had a syntax error. It is now
quoted. Output that compiled stays the same.
