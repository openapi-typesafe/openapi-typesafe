---
"openapi-typesafe-migrate": patch
---

`openapiTS(spec, undefined)` and `openapiTS(spec, void 0)` are read as a call without options.
Before, the report asked to check the options by hand.
