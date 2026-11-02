# openapi-typesafe-migrate

Move a project from `openapi-typescript`, `openapi-fetch`, `openapi-react-query` and
`openapi-typescript-helpers` to the openapi-typesafe packages.

```sh
npx openapi-typesafe-migrate          # report what would change
npx openapi-typesafe-migrate --write  # change the files
```

Run it in the project root, with a clean git tree, so you can review the diff.

## What it changes

| Where                                                                                  | Change                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every `package.json`                                                                   | `dependencies`, `devDependencies`, `peerDependencies` and `optionalDependencies` get the new names, with the version of this tool; `^`, `~` and exact ranges keep their style. `catalog:` and `workspace:` stay.  |
| `pnpm-workspace.yaml`                                                                  | Entries of `catalog:` and `catalogs:`. Comments and formatting stay.                                                                                                                                              |
| `package.json` scripts, shell scripts, YAML (CI), `Makefile`, `justfile`, `Dockerfile` | The `openapi-typescript` command, and the flags it renamed: `--immutable-types` / `-it` → `--immutable`, `--support-array-length` → `--array-length`, `--redoc` → `--redocly`, `-ap` → `--additional-properties`. |
| Sources (`.ts`, `.tsx`, `.js`, `.mjs`, `.cjs`, `.vue`, `.svelte`, `.astro`, …)         | Quoted module specifiers: imports, `require()`, `import()`, `vi.mock()`, `declare module`, tool configs.                                                                                                          |
| `openapiTS(source, { transform })` calls                                               | When `transform` is the only callback and returns plain `ts.factory` types (or the helper constants), the returns become type text and `irCallbacks: true` is added.                                              |

`node_modules`, `.git` and `dist` are skipped; links are not followed.

## What it leaves to you

The report lists each of these with the file and line:

- a version spec it cannot replace (`latest`, a URL, a file, an npm alias), and `overrides` /
  `resolutions` that name an old package;
- a renamed peer dependency: users of your package must switch too;
- `npx openapi-typescript@<version>`: the old package is pinned, change it by hand;
- deep imports such as `openapi-fetch/dist/...`: check that the file exists in the new package;
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
