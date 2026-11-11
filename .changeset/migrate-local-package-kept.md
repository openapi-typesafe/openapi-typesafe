---
"openapi-typesafe-migrate": patch
---

A dependency under an old name on a local package (`workspace:*`, `link:`, `file:`, `portal:`),
such as a fork named `openapi-fetch` in the workspace, is no longer renamed: the new name pointed
at a package the workspace does not have, and the install failed. The dependency and the imports
of it keep their name, and the report lists it as a manual step.
