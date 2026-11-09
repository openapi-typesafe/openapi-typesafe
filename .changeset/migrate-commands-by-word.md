---
"openapi-typesafe-migrate": patch
---

Commands and `transform` callbacks are migrated more precisely:

- Commands are read word by word, the way the shell splits them. Only the generator's own flags
  are renamed (`docker run -it` keeps its flag), flags on lines continued with `\` are renamed
  too, and a script name such as `npm run openapi-typescript` is never changed.
- `node_modules/.bin/openapi-typescript`, `npm:openapi-typescript` (Deno) and every old package
  of an install command (`npm i openapi-typescript openapi-fetch`, `npx -p …`) are renamed.
  Pinned versions, commands that run a file of the old package, and strings in sources that run
  `openapi-typescript` (`execSync("…")`) are reported.
- Husky hooks, `Justfile`, Nx `project.json` targets, `deno.json` tasks and pnpm `package.yaml`
  scripts are read.
- In YAML files only command keys (`run`, `script`, `command`, …) change, so an OpenAPI
  `description` stays as written. YAML and JSONC are read with real parsers, so flow style
  (`run: [a, b]`), comments and multi-document files are handled, and a config that does not
  parse is reported. `.github/dependabot.yml` gets the new name of every package.
- The `transform` rewrite follows names by scope, so a local constant is no longer taken for the
  module constant of the same name. It removes the constants and imports that only the old
  returns used, so `noUnusedLocals` passes, and keeps numeric literals such as `"1_000"` and
  `"1e999"` as written.
- Legacy callbacks are reported also when the options are a `const` or the generator comes from a
  namespace import, and calls whose options it cannot see are reported.
