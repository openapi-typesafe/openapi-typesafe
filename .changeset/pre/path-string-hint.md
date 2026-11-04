---
"openapi-typesafe": patch
---

`openapiTS("./openapi.yaml")` now fails with `SCHEMA_SOURCE_INVALID` and says to pass
`pathToFileURL(path)`. A string source is document text, so a file path was parsed as YAML and
failed with the unclear "Unsupported schema format, expected `openapi: 3.x`".
