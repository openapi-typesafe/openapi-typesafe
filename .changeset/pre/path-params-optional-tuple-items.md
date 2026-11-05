---
"openapi-typesafe": patch
---

`--path-params-as-types` with `--fix=prefix-items`: a template that also matches a path whose
response is an open `prefixItems` tuple, such as `[string?, ...string[]]`, under a `string[]`
response gave output that did not compile (TS2413). The overlap check took the optional element
for a `string`; it may be `undefined`, so the template now gets an object of its own.
