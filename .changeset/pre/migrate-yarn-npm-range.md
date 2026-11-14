---
"openapi-typesafe-migrate": patch
---

A renamed dependency whose spec is Yarn's `npm:` protocol with a bare range
(`"openapi-fetch": "npm:^0.13.0"`) gets the new version after the same protocol
(`"openapi-typesafe-fetch": "npm:^1.0.0"`). Before, it kept the old range, which no version of
the new package matches, and the report asked to fix it by hand.
