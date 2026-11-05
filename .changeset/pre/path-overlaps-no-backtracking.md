---
"openapi-typesafe": patch
---

`--path-params-as-types`: a template such as `` `/${string}/${number}` `` next to `/a/b/{n}` was
moved into a `paths` intersection, although that output compiles. The overlap check matched the
keys by trying every split of the text; TypeScript matches each text of the template at its first
occurrence and never checks `` `/a/b/${number}` `` against that template. The check now follows
TypeScript's matching only, so the output is the same as openapi-typescript 7.13 gives.
A template of only `${boolean}` placeholders, which is no index signature (TS1337), no longer
moves another template either.
