---
"openapi-typesafe": patch
---

CLI flags are read by their names:

- A removed flag fails with `CLI_FLAG_REMOVED` written with a value too (`--redoc=redocly.yaml`),
  in camelCase (`--immutableTypes`) and with `--no-` (`--no-immutable-types`).
- The boolean alias `-t` (`--export-type`) takes `=true` and `=false` as the flag does; another
  value fails with `CLI_FLAG_INVALID`.
- A boolean flag takes no value, or `=true` or `=false`. Another value (`--enum=1`,
  `--no-enum=true`) fails with `CLI_FLAG_INVALID` (exit code `2`) instead of turning the flag off.
- A flag given more than once takes the last value; `--output` and `--redocly` no longer fail with
  a list.
- The notice that a root-types flag has no effect without `--root-types` follows the parsed flags:
  `--rootTypes` and `--root-types=true` count, `--root-types=false` does not.
