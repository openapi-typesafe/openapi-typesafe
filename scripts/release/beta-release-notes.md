# Closed beta {{VERSION}}

Thank you for testing openapi-typesafe before it is on npm. These tarballs are the five packages at
version `{{VERSION}}`. Please do not share them outside the beta.

## Check the download

```sh
shasum -a 256 -c SHA256SUMS
```

## Install

Put the tarballs in your project, for example in `vendor/openapi-typesafe/`. Install the packages
you need, and pin every openapi-typesafe package to its tarball, so the package manager never looks
for them on npm (they are not there yet).

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

Yarn: `resolutions` in `package.json` instead of `overrides`.

Add `openapi-typesafe-react-query` and `openapi-typesafe-migrate` the same way if you use them.

## Try it

- Migrating from openapi-typescript / openapi-fetch / openapi-react-query: install
  `openapi-typesafe-migrate` from its tarball, run `npx openapi-typesafe-migrate` to see the report,
  then `npx openapi-typesafe-migrate --write`. It sets the new packages to `^{{VERSION}}`, which is
  not on npm yet: change those versions to the `file:` paths above before you install. Then
  regenerate your schema and run your type check and tests.
- New project: see the README of each package in the tarball.

## What to report

Open an issue in this repository (it is private to beta testers) with:

1. What you did: the command or code, and your Node.js, TypeScript and package manager versions.
2. What happened, with the full error output.
3. For a generator difference: whether the output differs from openapi-typescript 7.13, and the
   smallest part of your schema that shows it, if you can share it.

Reports that everything worked are useful too: say which packages you used and on what project size.
