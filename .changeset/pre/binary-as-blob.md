---
"openapi-typesafe": minor
---

New `--binary-as-blob` option: raw binary strings (`format: binary`, or a non-text
`contentMediaType`) are typed `Blob` instead of `string`. Names follow upstream PR [#2878](https://github.com/openapi-ts/openapi-typescript/pull/2878) by
[joaodibba](https://github.com/joaodibba);
closes upstream [#1214](https://github.com/openapi-ts/openapi-typescript/issues/1214).
