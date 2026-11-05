---
"openapi-typesafe": patch
---

`--path-params-as-types` is fast on large documents again. The overlap check compared every pair of
paths, which took over four minutes for Microsoft Graph beta (about 10 000 paths); it now compares
a template only with the paths that start with its first text, and takes seconds.
