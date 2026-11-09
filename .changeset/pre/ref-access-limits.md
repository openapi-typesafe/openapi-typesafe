---
"openapi-typesafe": minor
---

New `--local-ref-root <dir>` and `--remote-ref-hosts <hosts>` options limit where `$ref`s load from;
a refused `$ref` fails with `SCHEMA_REF_FORBIDDEN`. The input document and its redirects are never
limited, so a spec URL that redirects to another host loads with `--remote-ref-hosts`.
