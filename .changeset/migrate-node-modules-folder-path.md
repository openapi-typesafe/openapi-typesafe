---
"openapi-typesafe-migrate": patch
---

A path that names the `node_modules` folder of an old package itself (`"paths": { "a":
["./node_modules/openapi-fetch"] }` in a tsconfig, or an import of `../node_modules/openapi-fetch`)
is now reported, like a path to a file inside it.
