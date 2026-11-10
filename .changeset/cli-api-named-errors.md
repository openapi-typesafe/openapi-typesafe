---
"openapi-typesafe": patch
---

With several APIs in `redocly.yaml`, an error while an API is loaded or generated starts with
`API <name>:`, as its config errors do, so it tells which API failed. The code and the exit code
stay the same. Every warning, problem and debug line of an API's generation (a `$ref` it cannot
resolve, a lint problem) starts with `API <name>:` too. A notice that a root-types flag has no
effect follows the CLI flags together with each API's settings and names the API, and an invalid
`--local-ref-root` fails the run once instead of once for each API.
