---
"openapi-typesafe": patch
---

With several APIs in `redocly.yaml`, each API is linted with its own `rules` (and other lint
settings) from `apis.<name>`, as `redocly lint <name>` lints it. Every API was linted with the
root rules only.
