---
"openapi-typesafe-migrate": major
---

First release of openapi-typesafe-migrate: `npx openapi-typesafe-migrate` moves a project from
openapi-typescript, openapi-fetch, openapi-react-query and openapi-typescript-helpers. It reads only
the files git lists, never writes outside the project, and lists what it cannot change safely as
manual steps. Git runs by its absolute path from a `PATH` folder outside the project and outside
every `node_modules` (npx puts those of the folders above it on `PATH` too) and never fetches, whatever the repository's config allows, so a planted repository cannot run a command. It
only reports until you add `--write`, and logs every finding to a private JSON Lines file.

- Packages: renamed in `package.json` (also `peerDependenciesMeta`, `dependenciesMeta`,
  `bundleDependencies`, bun catalogs and `npm:` aliases), pnpm `package.yaml` and
  `pnpm-workspace.yaml` catalogs, Yarn `.yarnrc.yml` catalogs, `deno.json`, `deno.jsonc` and import
  maps. These files are edited in place: comments, formatting, key order and a byte order mark stay,
  and a new version keeps the style of the old range (`~0.13.0` gives `~1.0.0`). A package listed
  under both its old and its new name is reported, not changed, and a catalog entry that a kept
  dependency or an override still uses stays, so the install never misses an entry.
- Sources: module specifiers (also mocks, JSDoc `@import`, `npm:` specifiers and the scripts of
  `.vue`, `.svelte` and `.astro` files). A `transform` callback that returns plain `ts.factory`
  types becomes type text with `irCallbacks: true`; callbacks it cannot rewrite are reported. An
  import of `openapi-typesafe-helpers` that no `package.json` or Deno import map at or above the
  file lists is reported, also on a later run: openapi-fetch installed the old package, the client
  does not.
- Commands: the generator command and its renamed flags in package scripts, CI files (also `env`
  variables that hold the generator), Makefiles (also variables that hold the generator),
  Dockerfiles (also the exec form and its `sh -c` command line), `Justfile`, Husky hooks, Nx
  `project.json` targets and `deno.json` tasks, read word by word as the shell splits them, also
  inside `if`, `while` and `{ … }` blocks. In YAML files only command keys (`run`, `script`,
  `command`, …) and `env` values change. Install commands and `.github/dependabot.yml` get the new
  package names; pinned versions and commands it cannot read safely are reported.
