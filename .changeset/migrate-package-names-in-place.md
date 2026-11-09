---
"openapi-typesafe-migrate": patch
---

`openapi-typesafe-migrate` renames the packages in more places, and changes nothing else there:

- package.json, `package.yaml`, `pnpm-workspace.yaml`, `.yarnrc.yml`, `deno.json`, `deno.jsonc`
  and `import_map.json` are edited in place. Only the renamed names and the new versions change;
  comments, formatting, key order, number literals, duplicate keys and a byte order mark stay.
- A new version keeps the style of the old range: `~0.13.0` and `0.13` give `~1.0.0`, an exact
  version stays exact, and `>=0.13 <0.18` or `^0.13 || ^0.17` (with or without quotes) take the
  style of their first part.
- It also renames the keys of `peerDependenciesMeta` and `dependenciesMeta`, the names in
  `bundleDependencies`, bun's catalogs in package.json, Yarn's catalogs in `.yarnrc.yml`, the
  `imports` and `scopes` of Deno import maps, `npm:` aliases
  (`"my-fetch": "npm:openapi-fetch@^0.13"`) and `npm:` specifiers in sources.
- A package listed under both its old and its new name is left and reported, instead of losing
  one of the entries.
- Files are read before any is written. A file that is not UTF-8, or that cannot be read, is
  skipped and listed; a failed write stops the run with exit code `1` and names what was written.
- `--log` naming a folder and `--root` naming a file or a missing path fail with a clear message.
- Git never fetches while it lists the files, so a planted partial clone cannot run a command.
