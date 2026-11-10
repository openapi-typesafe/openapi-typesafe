---
"openapi-typesafe": patch
---

With several APIs in `redocly.yaml`, an error while an API is loaded or generated starts with
`API <name>:`, as its config errors do, so it tells which API failed. The code and the exit code
stay the same.
