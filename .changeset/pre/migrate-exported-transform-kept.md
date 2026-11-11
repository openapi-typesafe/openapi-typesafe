---
"openapi-typesafe-migrate": patch
---

An exported function that `transform` names is no longer rewritten: other modules may call it
and expect TypeScript nodes. It is kept and reported as a manual step, like options that other
code uses.
