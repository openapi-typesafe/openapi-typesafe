---
"openapi-typesafe": minor
---

The CLI no longer overwrites a file it should not. Both checks follow symlinks and hard links,
and the letter case of a case-insensitive file system, and run before anything is generated or
written, and fail with exit code `2`. openapi-typescript checked neither:

- An `--output`, or an `x-openapi-ts.output` in `redocly.yaml`, that names a schema the CLI
  reads fails with the new error code `CLI_OUTPUT_IS_INPUT`. With several APIs, no output may
  be the `root` of any API. openapi-typescript replaced the schema with the types.
- APIs in `redocly.yaml` whose outputs are the same file all fail with the new error code
  `CLI_OUTPUT_DUPLICATE`; the other APIs are still generated. openapi-typescript let the API
  that finished last win.
