---
"openapi-typesafe": patch
---

Fix `$ref`s to keys with `~`, `/` or `%` in another file (`./parts.yaml#/a~0b`, `#/50%25`).
The bundled ref named a different key, so the types did not compile, or crashed the generator.
A local `$ref` with a malformed `%` escape now fails with `SCHEMA_REF_INVALID` and names the ref,
instead of an unexpected error.
