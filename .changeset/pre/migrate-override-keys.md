---
"openapi-typesafe-migrate": patch
---

The report now names only the package an override key targets: `openapi-typescript-helpers` no
longer also reports `openapi-typescript`, and `app>openapi-fetch`, `**/openapi-fetch` and
`openapi-fetch@0.13` keys are read as `openapi-fetch`. `overrides:` and `patchedDependencies:` in
`pnpm-workspace.yaml` that name an old package are reported like those of `package.json`; before,
they were neither rewritten nor reported. The output folders `.next`, `.nuxt`, `.output`,
`.svelte-kit`, `.turbo` and `coverage` are skipped like `dist`.
