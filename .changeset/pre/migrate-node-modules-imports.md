---
"openapi-typesafe-migrate": patch
---

An import of a path into the installed files of an old package
(`"../node_modules/openapi-fetch/dist/index.js"`) is reported as a manual step: the old package is no
longer installed after the migration, so the path stops resolving.
