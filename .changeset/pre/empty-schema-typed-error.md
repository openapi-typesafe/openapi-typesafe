---
"openapi-typesafe": patch
---

Clear errors instead of crashes, stack traces or hangs: an empty or `null` document, a file path
passed as a string source, a failing stream, a `file:` URL with no path, a callback result that is
no TypeScript node, a `$ref` failure reached twice, a non-string `summary` (upstream [#2349](https://github.com/openapi-ts/openapi-typescript/issues/2349)), a
path key full of `{`, a broken `redocly.yaml`, no input on a terminal (upstream [#1905](https://github.com/openapi-ts/openapi-typescript/issues/1905)), and an
unreachable remote schema (now with the network reason).
