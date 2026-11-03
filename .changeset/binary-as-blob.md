---
"openapi-typesafe": minor
---

New option `--binary-as-blob` (`binaryAsBlob` in the Node API): raw binary strings become `Blob`
instead of `string`, so file uploads and downloads type check without a `transform` callback.
Raw binary is `format: binary` (OpenAPI 3.0), or a `contentMediaType` that is not text and has no
`contentEncoding` (3.1, also without `type`). `format: byte`, encoded strings and text media types
(`text/*`, JSON, XML, YAML) stay `string`. Off by default, so the output does not change. The
names follow openapi-typescript PR #2878 by @joaodibba; closes openapi-typescript#1214.
