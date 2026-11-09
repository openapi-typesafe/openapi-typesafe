---
"openapi-typesafe": patch
---

CLI fixes:

- `--check` with several APIs in `redocly.yaml` checks every API; it stopped at the first one that
  was up to date. A failing `--check` names the stale file.
- A kebab-case boolean flag before the schema path no longer takes the path as its value (upstream
  [#2523](https://github.com/openapi-ts/openapi-typescript/issues/2523), [#1651](https://github.com/openapi-ts/openapi-typescript/issues/1651), [#2764](https://github.com/openapi-ts/openapi-typescript/issues/2764), [#2694](https://github.com/openapi-ts/openapi-typescript/issues/2694)).
- A `#`, `?` or `%` in a CLI or `redocly.yaml` path is part of the file name, and `C:\` is a path.
- An API in `redocly.yaml` without a `root`, or with a `root` that is no text, fails with
  `CLI_CONFIG_INVALID` (exit code `2`) and the other APIs are still generated; openapi-typescript
  looked for a schema named `undefined`.
- Without `--output`, warnings go to stderr instead of being dropped, and debug lines
  (`DEBUG=openapi-ts:*`) go to stderr instead of stdout, so they no longer end up in types piped to
  a file.
- The `-it` error names `--immutable`, `--help` lists `--generate-path-params`, and untimed `DEBUG`
  lines have a space after the group.
