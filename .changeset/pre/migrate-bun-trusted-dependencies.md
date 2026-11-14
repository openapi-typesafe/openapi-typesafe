---
"openapi-typesafe-migrate": patch
---

bun's `trustedDependencies` in package.json is reported when it names an old package, as pnpm's
`onlyBuiltDependencies` already was.
