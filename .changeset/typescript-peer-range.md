---
"openapi-typesafe": major
---

The optional `typescript` peer dependency needs TypeScript 5.4 or newer (`>=5.4.0`, was `^5.x` in
openapi-typescript 7.13 and `>=5.0.0` in the release candidates): the range now says the TypeScript
versions that openapi-typesafe supports and tests (ADR-006). On TypeScript 5.0 to 5.3, npm stops
with a peer conflict (`ERESOLVE`) and pnpm warns; upgrade TypeScript to 5.4 or newer.
