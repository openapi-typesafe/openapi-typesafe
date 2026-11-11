# openapi-typesafe-migrate

## 1.0.0-rc.6

### Patch Changes

- [#93](https://github.com/openapi-typesafe/openapi-typesafe/pull/93) [`25f631d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/25f631d8dabed24e18a859b08e8395496e145118) Thanks [@fedorello](https://github.com/fedorello)! - An OpenAPI, Swagger or AsyncAPI document in YAML is no longer changed: an example value under a
  `command` or `script` key that mentions the generator stays as written.

- [#93](https://github.com/openapi-typesafe/openapi-typesafe/pull/93) [`25f631d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/25f631d8dabed24e18a859b08e8395496e145118) Thanks [@fedorello](https://github.com/fedorello)! - `openapi-typesafe-migrate | head` (or any reader that closes the pipe early) no longer crashes with
  an `EPIPE` stack trace and exit code 1: the rest of the report is dropped and the run ends as it
  would have.

- [#93](https://github.com/openapi-typesafe/openapi-typesafe/pull/93) [`25f631d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/25f631d8dabed24e18a859b08e8395496e145118) Thanks [@fedorello](https://github.com/fedorello)! - A constant or an import that an `export { … }` list names is no longer removed with the old
  `transform` returns, so the file still compiles.

- [#93](https://github.com/openapi-typesafe/openapi-typesafe/pull/93) [`25f631d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/25f631d8dabed24e18a859b08e8395496e145118) Thanks [@fedorello](https://github.com/fedorello)! - An exported function that `transform` names is no longer rewritten: other modules may call it
  and expect TypeScript nodes. It is kept and reported as a manual step, like options that other
  code uses.

- [#93](https://github.com/openapi-typesafe/openapi-typesafe/pull/93) [`25f631d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/25f631d8dabed24e18a859b08e8395496e145118) Thanks [@fedorello](https://github.com/fedorello)! - A justfile variable that holds the generator (`gen := "npx openapi-typescript"`) now has its old
  flags renamed where it runs: `{{gen}} api.yaml -it` kept `-it`. A variable of old flags that the
  generator gets (`{{flags}}`) is reported.

- [#93](https://github.com/openapi-typesafe/openapi-typesafe/pull/93) [`25f631d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/25f631d8dabed24e18a859b08e8395496e145118) Thanks [@fedorello](https://github.com/fedorello)! - A dependency under an old name on a local package (`workspace:*`, `link:`, `file:`, `portal:`),
  such as a fork named `openapi-fetch` in the workspace, is no longer renamed: the new name pointed
  at a package the workspace does not have, and the install failed. The dependency and the imports
  of it keep their name, and the report lists it as a manual step.

- [#93](https://github.com/openapi-typesafe/openapi-typesafe/pull/93) [`25f631d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/25f631d8dabed24e18a859b08e8395496e145118) Thanks [@fedorello](https://github.com/fedorello)! - A CI step whose `shell` is another program (`shell: python` in GitHub Actions, or a CircleCI
  `shell` next to `command`) runs code of that language, not commands. Its script is now left as it
  is and reported when it names an old package; it was skipped without a word.

- [#93](https://github.com/openapi-typesafe/openapi-typesafe/pull/93) [`25f631d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/25f631d8dabed24e18a859b08e8395496e145118) Thanks [@fedorello](https://github.com/fedorello)! - A shell variable that holds the generator is migrated now. A script, a CI `run` block or a
  `package.json` script that sets `GEN="npx openapi-typescript"` (also after `export`, `local` or
  `readonly`) and then runs `$GEN api.yaml -it` was left as it was, and nothing was reported, so
  the build went on downloading the old generator. The value is renamed where it is set and the
  flags after `$GEN` where it runs, and a variable of old flags that the generator gets is reported.

- [#93](https://github.com/openapi-typesafe/openapi-typesafe/pull/93) [`25f631d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/25f631d8dabed24e18a859b08e8395496e145118) Thanks [@fedorello](https://github.com/fedorello)! - Once `openapi-fetch` is aliased to `openapi-typesafe-fetch` in the overrides (as the docs ask for
  swr-openapi), the report no longer says to update that override or to add the alias again, so a
  second run is clean. The alias counts in the `package.json` itself and in a workspace above it.

- [#93](https://github.com/openapi-typesafe/openapi-typesafe/pull/93) [`25f631d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/25f631d8dabed24e18a859b08e8395496e145118) Thanks [@fedorello](https://github.com/fedorello)! - A path in the `typesVersions` of `package.json` into the installed files of an old package
  (`node_modules/openapi-fetch/dist/index.d.ts`) is reported, as such paths in a tsconfig are: the
  new package has its own files there.

- [#93](https://github.com/openapi-typesafe/openapi-typesafe/pull/93) [`25f631d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/25f631d8dabed24e18a859b08e8395496e145118) Thanks [@fedorello](https://github.com/fedorello)! - The `command` of a wireit script in `package.json` is migrated like the other scripts. It was
  neither changed nor reported.

## 1.0.0-rc.5

### Patch Changes

- [#69](https://github.com/openapi-typesafe/openapi-typesafe/pull/69) [`1296bd7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1296bd79e83c39598a471b9bfabf34ffcd71a83e) Thanks [@fedorello](https://github.com/fedorello)! - A module specifier with a bundler query (`"openapi-fetch?url"`, `"openapi-fetch/x.js?raw"`) gets the
  new package name and keeps its query. Before, a query right after the package name hid the package,
  and the specifier was left as it was.

- [#69](https://github.com/openapi-typesafe/openapi-typesafe/pull/69) [`1296bd7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1296bd79e83c39598a471b9bfabf34ffcd71a83e) Thanks [@fedorello](https://github.com/fedorello)! - A `catalog:` dependency whose catalog entry is not in the project (`--root packages/api` of a pnpm
  workspace) keeps its name and is reported as a manual step: the entry above the root cannot be
  renamed, and renaming only the dependency failed the install with
  `ERR_PNPM_CATALOG_ENTRY_NOT_FOUND_FOR_SPEC`. At a workspace root, where no catalog is above, such a
  dependency is reported as one whose entry is missing. `catalog: ` with a space is the default
  catalog, as pnpm reads it.

- [#69](https://github.com/openapi-typesafe/openapi-typesafe/pull/69) [`1296bd7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1296bd79e83c39598a471b9bfabf34ffcd71a83e) Thanks [@fedorello](https://github.com/fedorello)! - The generator is renamed after more programs that run it: `nice`, `timeout`, `xargs`, `command`,
  `exec -a`, `dotenvx run --`, `doppler run --`, `nx exec --`, `yarn workspace <name>`, a bare `bun`,
  `corepack`, and `tsx` or `ts-node` before the path of its binary; `yarn global add` renames its
  packages. Any other word of a command that names an old package or a path to its binary (a
  script name after `npm run`, an argument of an unknown program, `$(npm bin)/openapi-typescript`)
  is reported as a manual step. Such commands were left without a word, and
  `dotenvx run -- npx openapi-typescript` kept downloading the old generator.

- [#69](https://github.com/openapi-typesafe/openapi-typesafe/pull/69) [`1296bd7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1296bd79e83c39598a471b9bfabf34ffcd71a83e) Thanks [@fedorello](https://github.com/fedorello)! - The body of a here-document (`<<NOTE`, `<<'NOTE'`, `<<-NOTE`) is read as data in scripts, `run: |`
  blocks and Dockerfiles: an apostrophe in it (`Don't edit`) opened a quote to the end of the file,
  and no command after it was migrated. A here-document that a shell runs (`bash <<EOF`,
  Dockerfile `RUN <<EOF` and `RUN <<EOT bash`, `cat <<EOF | sh`) is read as the script it is, so its
  commands are migrated. A shift in an arithmetic expansion (`$((1 << 2))`) is not a here-document.

- [#69](https://github.com/openapi-typesafe/openapi-typesafe/pull/69) [`1296bd7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1296bd79e83c39598a471b9bfabf34ffcd71a83e) Thanks [@fedorello](https://github.com/fedorello)! - When `transform` is rewritten to type text with `irCallbacks: true`, the options declared with
  `OpenAPITSOptions` (`const options: OpenAPITSOptions`, `satisfies` or `as OpenAPITSOptions`, a
  `transform` const typed `OpenAPITSOptions["transform"]`) name `OpenAPITSIrOptions` instead, with its
  import; the rewritten file did not compile. Options typed with a type built from `OpenAPITSOptions`
  (`Partial<OpenAPITSOptions>`) keep their `transform`, reported as a manual step. The type is found
  in the other forms it is written in too: `import("openapi-typescript").OpenAPITSOptions`, a local
  alias or an interface that extends it, and the JSDoc `@type` and `@satisfies` of a JavaScript file.
  Options that take keys from another object (`{ ...base, transform }`) keep their `transform`,
  reported as a manual step: the tool cannot see the callbacks and type of `base`. A `transform`
  written as a shorthand property (`{ transform }`) is rewritten too.

- [#69](https://github.com/openapi-typesafe/openapi-typesafe/pull/69) [`1296bd7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1296bd79e83c39598a471b9bfabf34ffcd71a83e) Thanks [@fedorello](https://github.com/fedorello)! - The Jest patterns that name an old package (`moduleNameMapper: { "^openapi-fetch$": … }`,
  `transformIgnorePatterns`) are reported as manual steps, in `jest.config.*` files and in the `jest`
  field of `package.json`. A pattern is not a module specifier, so the tool does not change it. A
  value of a JSON config that is just a package name (`"^@api$": "openapi-fetch"`) is reported too;
  a string of a config script that names a package (`"openapi-fetch/$1"`) is reported once.

- [#69](https://github.com/openapi-typesafe/openapi-typesafe/pull/69) [`1296bd7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1296bd79e83c39598a471b9bfabf34ffcd71a83e) Thanks [@fedorello](https://github.com/fedorello)! - The `import` and `export` blocks of `.mdx` files are migrated like those of a source file. Prose and
  code fences of the page stay as written.

- [#69](https://github.com/openapi-typesafe/openapi-typesafe/pull/69) [`1296bd7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1296bd79e83c39598a471b9bfabf34ffcd71a83e) Thanks [@fedorello](https://github.com/fedorello)! - More files that run the generator are migrated:
  - Task's `Taskfile.yml` (`cmds`, `cmd`, `sh`, `status`, `defer`, `preconditions`);
  - pre-commit's `.pre-commit-config.yaml`: the `entry` and `args` of a hook as one command, and the
    old packages in `additional_dependencies`;
  - the `simple-git-hooks`, `lint-staged` and `nx.targets` commands of `package.json` and
    `package.yaml`;
  - `.lintstagedrc` (JSON or YAML), `.lintstagedrc.json`, `.lintstagedrc.yaml`, `.simple-git-hooks.json`;
  - the `targetDefaults` commands of `nx.json`, and the commands of Nx `configurations`.

  A YAML command written with escapes (`"openapi-typescript \"$SPEC\""`) is migrated by its value,
  and the whole string is written again with its escapes.

- [#69](https://github.com/openapi-typesafe/openapi-typesafe/pull/69) [`1296bd7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1296bd79e83c39598a471b9bfabf34ffcd71a83e) Thanks [@fedorello](https://github.com/fedorello)! - The import map file that a Deno config names (`"importMap": "./deps.json"`) is migrated like
  `import_map.json`, and its imports count as declared for the files under that config. An import map
  named by a URL or by a path outside the project is reported as a manual step.

- [#69](https://github.com/openapi-typesafe/openapi-typesafe/pull/69) [`1296bd7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1296bd79e83c39598a471b9bfabf34ffcd71a83e) Thanks [@fedorello](https://github.com/fedorello)! - An import of a path into the installed files of an old package
  (`"../node_modules/openapi-fetch/dist/index.js"`) is reported as a manual step: the old package is no
  longer installed after the migration, so the path stops resolving.

- [#69](https://github.com/openapi-typesafe/openapi-typesafe/pull/69) [`1296bd7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1296bd79e83c39598a471b9bfabf34ffcd71a83e) Thanks [@fedorello](https://github.com/fedorello)! - A patch file of an old package (patch-package `patches/openapi-fetch+0.13.0.patch`, pnpm
  `openapi-fetch@0.13.0.patch`, Yarn `openapi-fetch-npm-0.13.0-<hash>.patch`) is reported as a manual
  step: the new package has other code, so the patch cannot be carried over.

- [#69](https://github.com/openapi-typesafe/openapi-typesafe/pull/69) [`1296bd7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1296bd79e83c39598a471b9bfabf34ffcd71a83e) Thanks [@fedorello](https://github.com/fedorello)! - Every package manager setting that names an old package is reported as a manual step, not only
  `overrides` and `patchedDependencies`: `packageExtensions`, `allowedDeprecatedVersions`,
  `onlyBuiltDependencies` and the rest, in `pnpm-workspace.yaml`, in the `pnpm` field of
  `package.json` and in `.yarnrc.yml`. Values count too (`"x": "npm:openapi-fetch@0.13.0"` in
  `overrides`). A setting under the `pnpm` field is reported by its own key (`pnpm.overrides`).

- [#66](https://github.com/openapi-typesafe/openapi-typesafe/pull/66) [`15344bf`](https://github.com/openapi-typesafe/openapi-typesafe/commit/15344bfb803ff9872a6d3f79b8279fbbbbfd14ea) Thanks [@fedorello](https://github.com/fedorello)! - The report shows control characters of file names and project text as escapes (`\n`, `\u001b`),
  so a file name cannot forge CI commands or erase the lines before it.

- [#69](https://github.com/openapi-typesafe/openapi-typesafe/pull/69) [`1296bd7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1296bd79e83c39598a471b9bfabf34ffcd71a83e) Thanks [@fedorello](https://github.com/fedorello)! - The targets of Node subpath imports in `package.json` (`"imports": { "#client": "openapi-fetch" }`,
  also under conditions and fallback lists) get the new package names, so they still resolve once the
  dependencies are renamed. So do the keys and values of the `browser` field
  (`"browser": { "openapi-fetch": false }`). A target or `browser` key that reaches into a file of
  the package is reported as a manual step.

- [#77](https://github.com/openapi-typesafe/openapi-typesafe/pull/77) [`decc2e2`](https://github.com/openapi-typesafe/openapi-typesafe/commit/decc2e2ae056f8a9b191d7f838056487760df530) Thanks [@fedorello](https://github.com/fedorello)! - `tsconfig.json`, `tsconfig.*.json` and `jsconfig.json` are migrated: the `compilerOptions.paths`
  keys of an old package (`"openapi-fetch"`, `"openapi-fetch/*"`) and its name in
  `compilerOptions.types` get the new names, so the paths still match the renamed imports. A path into
  `node_modules` of an old package is reported as a manual step.

## 1.0.0-rc.4

No changes in this release.

## 1.0.0-rc.3

No changes in this release.

## 1.0.0-rc.2

No changes in this release.

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
