---
"openapi-typesafe": minor
---

The CLI no longer overwrites the schema when the output is the schema file. An `--output`, or
an `x-openapi-ts.output` in `redocly.yaml`, that names a schema the CLI reads (also through a
symlink or a hard link, or in another letter case on a case-insensitive file system) now fails
with exit code `2` and the new error code `CLI_OUTPUT_IS_INPUT`, before anything is generated
or written. With several APIs, no output may be the `root` of any API. openapi-typescript
replaced the schema with the types without a word.
