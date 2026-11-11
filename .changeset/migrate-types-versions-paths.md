---
"openapi-typesafe-migrate": patch
---

A path in the `typesVersions` of `package.json` into the installed files of an old package
(`node_modules/openapi-fetch/dist/index.d.ts`) is reported, as such paths in a tsconfig are: the
new package has its own files there.
