---
"openapi-typesafe": patch
---

Fix kebab-case boolean flags before the schema path (for example `openapi-typesafe --root-types schema.yaml`): the flag took the path as its value, so the CLI waited on stdin. Fixes upstream #2523, #1651, #2764, #2694.
