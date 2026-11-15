---
"openapi-typesafe-migrate": patch
---

A Compose `entrypoint` or `command` that a merge key gives (`<<: *gen`) is paired with the
service's own keys, so the old flags of `command: ["api.yaml", "-it"]` after a merged generator
entrypoint are renamed. The service's own keys win over merged ones, and the first map of a
merge list wins over later ones. Before, the entrypoint was renamed and `-it` was kept.
