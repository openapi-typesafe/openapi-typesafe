---
"openapi-typesafe-migrate": patch
---

The targets of Node subpath imports in `package.json` (`"imports": { "#client": "openapi-fetch" }`,
also under conditions and fallback lists) get the new package names, so they still resolve once the
dependencies are renamed. A target that reaches into a file of the package is reported as a manual
step.
