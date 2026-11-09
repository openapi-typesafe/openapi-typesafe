---
"openapi-typesafe": patch
---

An API in `redocly.yaml` without a `root`, or with a `root` that is no text, fails with
`CLI_CONFIG_INVALID` (exit code `2`) and the other APIs are still generated. openapi-typescript
looked for a schema named `undefined`. An `x-openapi-ts` setting of the wrong type, such as
`root-types: "true"`, fails that API with `CLI_CONFIG_INVALID` instead of being ignored, and an
unknown `fix` name of an API names that API.
