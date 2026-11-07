---
"openapi-typesafe": minor
---

New `--local-ref-root <dir>` and `--remote-ref-hosts <hosts>` options limit where `$ref`s load
from; a refused `$ref` fails with `SCHEMA_REF_FORBIDDEN`.
