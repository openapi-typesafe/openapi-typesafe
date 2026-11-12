---
"openapi-typesafe-migrate": patch
---

Options passed to `openapiTS()` that take keys from another object (`{ ...base }`) are now checked
for legacy callbacks. When the file writes that object (`...{ transform }` or `const base = { … }`),
its `transform`, `postTransform` and `transformProperty` are listed as manual steps; a spread of an
object the tool cannot read (an import, a call) is listed too, so you can check it. Before, such
options were not reported at all.
