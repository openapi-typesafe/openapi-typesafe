---
"openapi-typesafe": patch
---

A YAML or JSON file that does not parse (a tab indent, a second YAML document, broken JSON) now
fails with `SCHEMA_PARSE_FAILED`, as text input does, instead of `SCHEMA_LOAD_FAILED`, and the
message names the file. The exit code stays `3`.
