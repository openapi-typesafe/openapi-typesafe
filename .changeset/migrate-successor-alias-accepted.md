---
"openapi-typesafe-migrate": patch
---

Once `openapi-fetch` is aliased to `openapi-typesafe-fetch` in the overrides (as the docs ask for
swr-openapi), the report no longer says to update that override or to add the alias again, so a
second run is clean. The alias counts in the `package.json` itself and in a workspace above it.
