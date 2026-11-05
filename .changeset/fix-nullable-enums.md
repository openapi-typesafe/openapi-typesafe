---
"openapi-typesafe": patch
---

New opt-in fix `nullable-enums` (`--enum --fix nullable-enums`): an enum that lists `null` becomes a
TypeScript enum of its other values, typed `E | null` where the schema allows `null`, instead of
staying a union (openapi-typescript #1872).
