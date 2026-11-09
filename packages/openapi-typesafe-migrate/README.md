# openapi-typesafe-migrate

Move a project from `openapi-typescript`, `openapi-fetch`, `openapi-react-query` and
`openapi-typescript-helpers` to the openapi-typesafe packages.

```sh
npx openapi-typesafe-migrate          # report what would change
npx openapi-typesafe-migrate --write  # change the files
```

Run it in the project root, with a clean git tree, so you can review the diff.

> **Release candidate.** The current version is a 1.0.0 release candidate (`1.0.0-rc.N`);
> names and output can still change before 1.0.0.

Run it with `npx` (or `pnpm dlx`, `yarn dlx`, `bunx`), not as a dependency: it uses TypeScript 6
(`@typescript/typescript6`), and an npm install of it links the project's `tsc` to TypeScript 6.

## What it changes

| Where                                                                          | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every `package.json` and pnpm's `package.yaml`                                 | `dependencies`, `devDependencies`, `peerDependencies` and `optionalDependencies` get the new names, with the version of this tool, in the style of the old range (see below). `catalog:` and `workspace:` stay. An `npm:` alias of an original package (`"my-fetch": "npm:openapi-fetch@^0.13"`) points at the new package. The keys of `peerDependenciesMeta` and `dependenciesMeta` and the names in `bundleDependencies` get the new names too, and so do bun's `catalog` and `catalogs`. |
| `pnpm-workspace.yaml`, `.yarnrc.yml`                                           | Entries of `catalog:` and `catalogs:` (pnpm, Yarn 4.10 and newer), ranges with spaces included.                                                                                                                                                                                                                                                                                                                                                                                              |
| `deno.json`, `deno.jsonc`, `import_map.json`                                   | Keys of `imports` and `scopes` that name an original package (`openapi-fetch`, `openapi-fetch/`), and their `npm:` values.                                                                                                                                                                                                                                                                                                                                                                   |
| Commands (the files are listed below the table)                                | The `openapi-typescript` command (also as `npx`, `pnpm exec`, `node_modules/.bin/…` or `npm:openapi-typescript`), and the flags it renamed, in that command only: `--immutable-types` / `-it` → `--immutable`, `--support-array-length` → `--array-length`, `--redoc` → `--redocly`, `-ap` → `--additional-properties`. The old package names in install commands (`npm i`, `pnpm add`, `npx -p`, …).                                                                                        |
| `.github/dependabot.yml`                                                       | Every old package name in `dependency-name` and `patterns`.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Sources (`.ts`, `.tsx`, `.js`, `.mjs`, `.cjs`, `.vue`, `.svelte`, `.astro`, …) | Module specifiers only: `import` / `export … from`, `import()`, `require()`, `require.resolve()`, `import("…")` types and `@import` tags in JSDoc (every block), `declare module`, `/// <reference types>`, and module mocks: `vi.mock()` and the other `vi` / `jest` module methods (`jest.setMock()`, `jest.requireActual()`, …), bun's `mock.module()`. Components: their `<script>` blocks and Astro's frontmatter.                                                                      |
| `openapiTS(source, { transform })` calls                                       | When `transform` is the only callback and returns plain `ts.factory` types (or the helper constants), the returns become type text and `irCallbacks: true` is added. The options may also be a `const` of the same file that only this call uses. Module constants and imports that only the old returns used are removed. Names are resolved by scope, so a local constant is never taken for a module one.                                                                                 |

Commands are read in `package.json` scripts, shell scripts (`.sh`, `.bash`, `.zsh`), husky hooks,
`Makefile`, `justfile`, `Dockerfile`, CI and other YAML files, Nx `project.json` targets,
`deno.json` tasks and pnpm `package.yaml` scripts. They are read word by word, the way the shell
splits them (quotes, `\` line continuations, comments, `&&`, `|`, `sh -c "…"`, and the commands
inside `if`, `while`, `for` and `{ … }`), so only the generator's own flags are renamed, and a
script name (`npm run openapi-typescript`) is never changed. A Dockerfile's exec form
(`RUN ["npx", "openapi-typescript", …]`) is read word by word. A Makefile variable that holds the
generator (`OAT := openapi-typescript`) is renamed where it is set, and the flags after `$(OAT)`
where it runs. YAML files are changed only in command keys (`run`, `script`, `command`,
`entrypoint`, …) and in the values of `env`, in block and flow style, never in other values such
as an OpenAPI `description`; a YAML file that names no old package is not even parsed. A config
that cannot be parsed and names an old package is reported with the line and column, not changed. `Makefile`, `justfile` and
`Dockerfile` are read only under the names make, just and docker look for (also `makefile`,
`GNUmakefile`, `Justfile`, `.justfile`, `Containerfile` and `*.mk`), so `Dockerfile.dev` is not
changed.

A range keeps its style: `^` and `>=` give `^1.0.0`, `~` gives `~1.0.0`, an exact version stays
exact, and a partial version keeps what it fixes (`7`, `7.x` and `0.x` give `^1.0.0`; `0.13` and
`0.13.x` give `~1.0.0`). A range of several comparators (`>=0.13 <0.18`, `^0.13 || ^0.17`) takes
the style of its first one. Anything else (`*`, `latest`, an upper bound only, a URL or a file) is
kept and reported.

Manifests, catalogs and import maps are edited in place: only the renamed keys and the new values
change, and comments, formatting, key order and line endings stay. A byte order mark is kept. An
entry whose new name is already in the same map is left and reported, and so is an entry the tool
does not edit (a YAML alias, anchor or block value). Sources also get `npm:` specifiers renamed
(`import x from "npm:openapi-fetch@^0.13"`).

In a git repository the tool reads the files git lists: tracked files, and untracked files that
`.gitignore` does not ignore, so ignored build output (`cjs/`, `esm/`, `types/`, …) stays out. A
submodule or a nested repository is read the same way, with its own git and its own `.gitignore`.
Outside a git repository, without `git` (or with git older than 2.31), and in a folder that the
repository around it ignores, it reads the whole tree of that folder. Either way `node_modules`,
`.git`, `dist` and the output folders `.next`, `.nuxt`, `.output`, `.svelte-kit`, `.turbo` and
`coverage` are skipped, and links are not followed. The log names the folders and how each one
was read.

The tool does not trust the folder it migrates. Git is the `git` of an absolute folder on
`PATH`, never one in the project, and it runs with `core.fsmonitor` turned off and every
transport refused (`GIT_ALLOW_PROTOCOL` set to an empty list, which no `protocol.*` key of a
repository's config can undo), so a nested repository's `.git/config` cannot make it run a
command, not even through a partial clone that fetches a missing object. It does not open a bare
repository that is not named explicitly, and the folder that holds `.git` is the work tree, so a
`core.worktree` in the config cannot point the listing at another folder; `GIT_DIR` and the other
variables that name a repository are not passed on. A path that git lists but that leads outside
the folder (`../`, an absolute path, a linked parent folder or a link to a file elsewhere) is not
read or written; the report lists it under "Skipped". A file is written as a new file that
replaces the old one (same mode), so a hard link to a file elsewhere keeps its old text; the log
notes it.
A file whose bytes are not UTF-8 (a Latin-1 source, for example) is not changed, because its
text cannot be written back without changing other characters; neither is a file that cannot be
read. The report lists both under "Skipped". Every file is read and migrated before the first one
is written. If a write fails, the writing stops, the command exits with `1`, and the report names
the files written before it and the ones that were not.
The report and the log show a spec with credentials (`git+https://<token>@…`) as
`git+https://***@…`; the file keeps it as written.

## What it leaves to you

The report lists each of these with the file and line:

- a version spec it cannot replace (`latest`, a URL, a file, an npm alias), and `overrides` /
  `resolutions` / `pnpm` settings (in `package.json` or `pnpm-workspace.yaml`, patches included)
  that name an old package;
- a renamed peer dependency: users of your package must switch too;
- `npx openapi-typescript@<version>`, and pinned old packages in install commands
  (`npm i openapi-fetch@0.13`): change them by hand;
- a command that runs a file inside the old package
  (`node node_modules/openapi-typescript/bin/cli.js`): run `openapi-typesafe` instead;
- strings in sources that run `openapi-typescript` (`execSync("npx openapi-typescript …")`, also
  a template such as `` `npx openapi-typescript ${spec}` ``),
  with the command they should become;
- deep imports such as `openapi-fetch/dist/...`: check that the file exists in the new package;
- strings that equal an old package name outside a module specifier (an object key, a label, a
  bundler option such as `external: ["openapi-fetch"]`): they are kept, because only you know
  whether they mean the package. Comments are not changed or reported;
- `swr-openapi` in your dependencies: it takes its client type from `openapi-fetch` (a peer
  dependency), so alias `openapi-fetch` to `openapi-typesafe-fetch` with `overrides` or
  `resolutions` (see
  [Libraries built on openapi-fetch](https://github.com/openapi-typesafe/openapi-typesafe/blob/main/docs/fetch/index.md#libraries-built-on-openapi-fetch));
- `transform` callbacks it cannot rewrite, and `postTransform` / `transformProperty`, also in
  options that other code shares, and `openapiTS()` calls whose options it cannot see (a
  parameter, a function call): they keep working with a deprecation warning; see
  [IR callbacks](https://github.com/openapi-typesafe/openapi-typesafe/blob/main/docs/node.md#ir-callbacks).

Then install, regenerate your types and commit them once (the file header names openapi-typesafe
now, so `--check` fails until you do), and run your type check and tests.

## Options

| Option            | Default                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `--write`         | Dry run: nothing is written                                                                   |
| `--root <dir>`    | The current directory                                                                         |
| `--log <file>`    | A new JSON Lines file in a new private folder in the temporary directory; its path is printed |
| `--help`, `-h`    | Show the help                                                                                 |
| `--version`, `-v` | Show the version                                                                              |

The default log folder is new for each run and only you can open it (mode 0700). A `--log` file
that exists gets the new lines appended, and missing parent folders are created.

Exit codes: `0` done, `1` the migration failed (the message and the log say why), a file could not
be written (the report names what was written), the project folder does not exist or is a file,
or the log could not be created (nothing is changed then), `2` unknown option or argument.

## Versioning

Semantic versioning from 1.0.0, with one version for all openapi-typesafe packages. What the
version promises, and what may grow in a minor release, is listed under
[Versioning](https://github.com/openapi-typesafe/openapi-typesafe/blob/main/docs/compatibility.md#versioning).

## License

[MIT](./LICENSE)
