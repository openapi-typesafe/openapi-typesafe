---
"openapi-typesafe": patch
---

A schema given as text that is only a location (a string, a `Buffer`, a stream, or stdin in the
CLI) now follows the same rule as the CLI's schema argument. A relative `file:` URL such as
`file:api.yaml` loads that file from `cwd` (the current directory in the CLI) instead of failing
with `SCHEMA_SOURCE_INVALID`. On stdin, a URL that does not parse (`http://[::1/x`) fails with
`CLI_LOCATION_INVALID` and exit code `2`, as the schema argument does. Text with whitespace is
always a document, so YAML whose first key looks like a URL (`http://host/a: b`) is parsed as
YAML instead of being loaded as a URL.
