---
"openapi-typesafe-migrate": patch
---

Every package manager setting that names an old package is reported as a manual step, not only
`overrides` and `patchedDependencies`: `packageExtensions`, `allowedDeprecatedVersions`,
`onlyBuiltDependencies` and the rest, in `pnpm-workspace.yaml`, in the `pnpm` field of
`package.json` and in `.yarnrc.yml`. Values count too (`"x": "npm:openapi-fetch@0.13.0"` in
`overrides`). A setting under the `pnpm` field is reported by its own key (`pnpm.overrides`).
