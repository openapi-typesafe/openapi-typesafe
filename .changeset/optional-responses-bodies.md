---
"openapi-typesafe-fetch": patch
"openapi-typesafe-helpers": patch
---

An operation whose `responses` may be `undefined` or is optional (`responses?: …`), as hand-written
types may have, keeps the bodies of its responses: `data` was `undefined`. `ResponseObjectMap` of
it is the map without `undefined`.
