---
"openapi-typesafe-migrate": patch
---

`tsconfig.json`, `tsconfig.*.json` and `jsconfig.json` are migrated: the `compilerOptions.paths`
keys of an old package (`"openapi-fetch"`, `"openapi-fetch/*"`) and its name in
`compilerOptions.types` get the new names, so the paths still match the renamed imports. A path into
`node_modules` of an old package is reported as a manual step.
