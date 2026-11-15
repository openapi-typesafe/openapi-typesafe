---
"openapi-typesafe-migrate": patch
---

A generator call that spreads its arguments (`openapiTS(...args)`) now gets the step to check its
options by hand, as a call whose options come from a function or a parameter does, instead of
being read as a call with no options.
