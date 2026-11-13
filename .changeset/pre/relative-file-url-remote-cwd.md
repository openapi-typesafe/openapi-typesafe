---
"openapi-typesafe": patch
---

A relative `file:` URL given as text (`openapiTS("file:api.yaml", { cwd: "https://host/specs/" })`)
with a `cwd` that is an `http:` or `https:` URL now rejects with `SCHEMA_SOURCE_INVALID`. It used to
read `/api.yaml` from the file system root. A `localRefRoot` such as `"file:specs/"` with such a
`cwd` rejects with `OPTION_INVALID`, as a relative path does, instead of limiting `$ref`s to `/specs/`.
