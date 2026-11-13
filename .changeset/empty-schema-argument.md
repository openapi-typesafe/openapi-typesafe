---
"openapi-typesafe": patch
---

An empty schema argument, such as `openapi-typesafe "$SPEC"` with `SPEC` unset, now fails with
`CLI_LOCATION_INVALID` and exit code `2`. It used to read stdin, so a URL on stdin that does not
parse failed with the wrong code and the printed lines named a blank source. A `SCHEMA_SOURCE_INVALID`
error for a URL that does not parse also no longer gets the advice for a YAML string on stdin.
