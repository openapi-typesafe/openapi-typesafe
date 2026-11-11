---
"openapi-typesafe-migrate": patch
---

A local package under an old name in a workspace root (`"openapi-fetch": "file:./vendor/…"`) no
longer keeps the imports of a workspace package that declares the npm package itself. The
nearest manifest that declares the name decides, as Node resolves it: that package's dependency
and its imports now both get the new name.
