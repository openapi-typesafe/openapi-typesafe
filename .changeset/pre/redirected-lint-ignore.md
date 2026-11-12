---
"openapi-typesafe": patch
---

The lint ignore file applies again to a remote document that redirects. `.redocly.lint-ignore.yaml`
lists its problems by the URL you asked for, as `redocly lint --generate-ignore-file` writes it, and
the ignored problems came back and failed the run with `SCHEMA_INVALID` when `/dup` redirected to
`/deep/dup.yaml`. Relative `$ref`s still resolve from the URL the document was redirected to.
