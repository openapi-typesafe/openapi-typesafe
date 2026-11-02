# Closed beta {{VERSION}}

Thank you for testing openapi-typesafe before it is on npm. These tarballs are the five packages at
version `{{VERSION}}`. Please do not share them outside the beta.

## Check the download

```sh
shasum -a 256 -c SHA256SUMS
```

## Install

You need Node.js 22.12 or newer. pnpm 11 itself needs Node.js 22.13 or newer; on 22.12 use
pnpm 10.

Put the tarballs in your project, for example in `vendor/openapi-typesafe/`. Install the packages
you need, and pin every openapi-typesafe package to its tarball, so the package manager never looks
for them on npm. npm only has empty `0.0.0` placeholders of these names, so a package that is not
pinned fails with an error like `No matching version found for openapi-typesafe-helpers@{{VERSION}}`:
add it to the overrides below.

npm, in `package.json`:

```json
{
  "devDependencies": {
    "openapi-typesafe": "file:vendor/openapi-typesafe/openapi-typesafe-{{VERSION}}.tgz"
  },
  "dependencies": {
    "openapi-typesafe-fetch": "file:vendor/openapi-typesafe/openapi-typesafe-fetch-{{VERSION}}.tgz"
  },
  "overrides": {
    "openapi-typesafe-helpers": "file:vendor/openapi-typesafe/openapi-typesafe-helpers-{{VERSION}}.tgz",
    "openapi-typesafe-fetch": "$openapi-typesafe-fetch"
  }
}
```

pnpm: the same `dependencies` in `package.json`, and the overrides in `pnpm-workspace.yaml`:

```yaml
overrides:
  openapi-typesafe-helpers: file:vendor/openapi-typesafe/openapi-typesafe-helpers-{{VERSION}}.tgz
  openapi-typesafe-fetch: file:vendor/openapi-typesafe/openapi-typesafe-fetch-{{VERSION}}.tgz
```

Yarn (Berry) and Bun: the same `dependencies` in `package.json`, and every package pinned by its
path; Yarn reads `resolutions`, Bun reads `overrides`. The `$openapi-typesafe-fetch` reference of
the npm snippet works only in npm.

```json
{
  "resolutions": {
    "openapi-typesafe-helpers": "file:vendor/openapi-typesafe/openapi-typesafe-helpers-{{VERSION}}.tgz",
    "openapi-typesafe-fetch": "file:vendor/openapi-typesafe/openapi-typesafe-fetch-{{VERSION}}.tgz"
  }
}
```

For Bun, name the field `overrides` instead of `resolutions`.

Add `openapi-typesafe-react-query` the same way if you use it. Do not install
`openapi-typesafe-migrate`: run it from its tarball (see "Try it").

A `file:` path is relative to the `package.json` that has it. In a monorepo, a package in
`packages/api` writes `file:../../vendor/openapi-typesafe/…`, while the overrides (in the root
`package.json` or `pnpm-workspace.yaml`) are relative to the root.

## Try it

- Migrating from openapi-typescript / openapi-fetch / openapi-react-query: from the project
  root, run the tool from its tarball, first for the report, then with `--write`:

  ```sh
  npx --package ./vendor/openapi-typesafe/openapi-typesafe-migrate-{{VERSION}}.tgz openapi-typesafe-migrate
  npx --package ./vendor/openapi-typesafe/openapi-typesafe-migrate-{{VERSION}}.tgz openapi-typesafe-migrate --write
  ```

  `npx` comes with Node.js, so this works whatever package manager the project uses; a plain
  `npx openapi-typesafe-migrate` finds only the empty npm placeholder. (`pnpm dlx` needs an
  absolute path: `pnpm dlx "$PWD/vendor/…"`.) The tool sets the new packages to version
  `{{VERSION}}` (with the `^` or `~` your old versions had), which is not on npm: change those
  versions to the `file:` paths above and add the overrides before you install. Then regenerate
  your schema and run your type check and tests.
- New project: see the README of each package in the tarball.

## What to report

Open an issue in this repository (it is private to beta testers) with:

1. What you did: the command or code, and your Node.js, TypeScript and package manager versions.
2. What happened, with the full error output.
3. For a generator difference: whether the output differs from openapi-typescript 7.13, and the
   smallest part of your schema that shows it, if you can share it.

Reports that everything worked are useful too: say which packages you used and on what project size.
