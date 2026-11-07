# openapi-typesafe-migrate

Move a project from `openapi-typescript`, `openapi-fetch`, `openapi-react-query` and
`openapi-typescript-helpers` to the openapi-typesafe packages.

```sh
npx openapi-typesafe-migrate          # report what would change
npx openapi-typesafe-migrate --write  # change the files
```

Run it in the project root, with a clean git tree, so you can review the diff.

Run it with `npx` (or `pnpm dlx`, `yarn dlx`, `bunx`), not as a dependency: it uses TypeScript 6
(`@typescript/typescript6`), and an npm install of it links the project's `tsc` to TypeScript 6.

## What it changes

| Where                                                                                  | Change                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every `package.json`                                                                   | `dependencies`, `devDependencies`, `peerDependencies` and `optionalDependencies` get the new names, with the version of this tool; `^`, `~` and exact ranges keep their style. `catalog:` and `workspace:` stay.                                                                                                                                                                                                        |
| `pnpm-workspace.yaml`                                                                  | Entries of `catalog:` and `catalogs:`. Comments and formatting stay.                                                                                                                                                                                                                                                                                                                                                    |
| `package.json` scripts, shell scripts, YAML (CI), `Makefile`, `justfile`, `Dockerfile` | The `openapi-typescript` command, and the flags it renamed: `--immutable-types` / `-it` → `--immutable`, `--support-array-length` → `--array-length`, `--redoc` → `--redocly`, `-ap` → `--additional-properties`.                                                                                                                                                                                                       |
| Sources (`.ts`, `.tsx`, `.js`, `.mjs`, `.cjs`, `.vue`, `.svelte`, `.astro`, …)         | Module specifiers only: `import` / `export … from`, `import()`, `require()`, `require.resolve()`, `import("…")` types and `@import` tags in JSDoc (every block), `declare module`, `/// <reference types>`, and module mocks: `vi.mock()` and the other `vi` / `jest` module methods (`jest.setMock()`, `jest.requireActual()`, …), bun's `mock.module()`. Components: their `<script>` blocks and Astro's frontmatter. |
| `openapiTS(source, { transform })` calls                                               | When `transform` is the only callback and returns plain `ts.factory` types (or the helper constants), the returns become type text and `irCallbacks: true` is added.                                                                                                                                                                                                                                                    |

In a git repository the tool reads the files git lists: tracked files, and untracked files that
`.gitignore` does not ignore, so ignored build output (`cjs/`, `esm/`, `types/`, …) stays out. A
submodule or a nested repository is read the same way, with its own git and its own `.gitignore`.
Outside a git repository, without `git` (or with git older than 2.31), and in a folder that the
repository around it ignores, it reads the whole tree of that folder. Either way `node_modules`,
`.git`, `dist` and the output folders `.next`, `.nuxt`, `.output`, `.svelte-kit`, `.turbo` and
`coverage` are skipped, and links are not followed. The log names the folders and how each one
was read.

The tool does not trust the folder it migrates. Git runs with `core.fsmonitor` turned off, so a
nested repository's `.git/config` cannot make it run a command, and it does not open a bare
repository that is not named explicitly. A path that git lists but that leads outside the folder
(`../`, an absolute path, or a linked parent folder) is not read or written; the report lists it
under "Skipped". A file is written as a new file that replaces the old one (same mode), so a hard
link to a file elsewhere keeps its old text; the log notes it.
The report and the log show a spec with credentials (`git+https://<token>@…`) as
`git+https://***@…`; the file keeps it as written.

## What it leaves to you

The report lists each of these with the file and line:

- a version spec it cannot replace (`latest`, a URL, a file, an npm alias), and `overrides` /
  `resolutions` / `pnpm` settings (in `package.json` or `pnpm-workspace.yaml`, patches included)
  that name an old package;
- a renamed peer dependency: users of your package must switch too;
- `npx openapi-typescript@<version>`: the old package is pinned, change it by hand;
- deep imports such as `openapi-fetch/dist/...`: check that the file exists in the new package;
- strings that equal an old package name outside a module specifier (an object key, a label, a
  bundler option such as `external: ["openapi-fetch"]`): they are kept, because only you know
  whether they mean the package. Comments are not changed or reported;
- `swr-openapi` in your dependencies: it takes its client type from `openapi-fetch` (a peer
  dependency), so alias `openapi-fetch` to `openapi-typesafe-fetch` with `overrides` or
  `resolutions` (see
  [Libraries built on openapi-fetch](https://github.com/openapi-typesafe/openapi-typesafe/blob/main/docs/fetch/index.md#libraries-built-on-openapi-fetch));
- `transform` callbacks it cannot rewrite, and `postTransform` / `transformProperty`: they keep
  working with a deprecation warning; see
  [IR callbacks](https://github.com/openapi-typesafe/openapi-typesafe/blob/main/docs/node.md#ir-callbacks).

Then install, regenerate your types and commit them once (the file header names openapi-typesafe
now, so `--check` fails until you do), and run your type check and tests.

## Options

| Option         | Default                                                                      |
| -------------- | ---------------------------------------------------------------------------- |
| `--write`      | Dry run: nothing is written                                                  |
| `--root <dir>` | The current directory                                                        |
| `--log <file>` | A new JSON Lines file in the system temporary directory; its path is printed |

Exit codes: `0` done, `1` the migration failed (the message and the log say why), `2` unknown
option.

## License

[MIT](./LICENSE)
