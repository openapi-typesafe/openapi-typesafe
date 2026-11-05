# openapi-typesafe-migrate

## 1.0.0-rc.1

No changes in this release.

## 1.0.0-rc.0

### Minor Changes

- [`730de95`](https://github.com/openapi-typesafe/openapi-typesafe/commit/730de95d814cf9b1ec70d2b8fac6b84b17106a29) Thanks [@fedorello](https://github.com/fedorello)! - New package `openapi-typesafe-migrate`: run `npx openapi-typesafe-migrate` in a project to move it from openapi-typescript, openapi-fetch, openapi-react-query and openapi-typescript-helpers. It renames the packages in `package.json` files and pnpm catalogs, module specifiers in sources, and the generator command and its renamed flags in scripts, CI files and Makefiles. A legacy `transform` callback that returns plain `ts.factory` types is rewritten to return type text with `irCallbacks: true`. Everything it cannot change safely is listed as a manual step. It only reports until you add `--write`, and logs every finding to a JSON Lines file.

### Patch Changes

- [`e57d12b`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e57d12b11b023258100cbabc5cac1d276ba5ae1f) Thanks [@fedorello](https://github.com/fedorello)! - `--help` lists the exit codes: `0` done, `1` the migration failed, `2` unknown option or argument.

- [`f0a93e4`](https://github.com/openapi-typesafe/openapi-typesafe/commit/f0a93e4094b3c69dfa8aeb229339f7d622f5cb06) Thanks [@fedorello](https://github.com/fedorello)! - The report now names only the package an override key targets: `openapi-typescript-helpers` no
  longer also reports `openapi-typescript`, and `app>openapi-fetch`, `**/openapi-fetch` and
  `openapi-fetch@0.13` keys are read as `openapi-fetch`. `overrides:` and `patchedDependencies:` in
  `pnpm-workspace.yaml` that name an old package are reported like those of `package.json`; before,
  they were neither rewritten nor reported. The output folders `.next`, `.nuxt`, `.output`,
  `.svelte-kit`, `.turbo` and `coverage` are skipped like `dist`.
