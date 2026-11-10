---
"openapi-typesafe": patch
---

The new fix `default-input-locations` finds parameters and request bodies by the document's
structure for `--default-non-nullable` (on by default). Without it, as in openapi-typescript, a
defaulted property stays optional wherever its location holds the word `parameters` or
`requestBody`, such as a response of `/system-parameters` or a property named `hyperparameters`.
It changes nothing with `--default-non-nullable=false`, so naming it then prints the warning
`FIX_NEEDS_OPTION`, as other fixes that need a flag do (`--fix all` does not).
