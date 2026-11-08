---
"openapi-typesafe": patch
---

The optional `typescript` peer dependency is `>=5.4.0` instead of `>=5.0.0`: the range now says
the TypeScript versions that openapi-typesafe supports and tests (ADR-006). On TypeScript 5.0 to
5.3, npm reports a peer conflict (`ERESOLVE`) and pnpm warns; upgrade TypeScript to 5.4 or newer.
