---
"openapi-typesafe": patch
---

A path key with a long run of `{` and no `}` no longer hangs the generator: the scan for `{name}`
templates was quadratic (36 seconds for a 320,000-character key with default options) and is now
linear.
