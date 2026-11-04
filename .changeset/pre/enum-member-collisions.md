---
"openapi-typesafe": patch
---

`--enum` and `--make-paths-enum`: values whose member names come out the same after invalid
characters are replaced (`reactions-+1` and `reactions--1` are both `reactions_1`) gave a
"Duplicate identifier" error. A repeated name now gets a number (`reactions_1_2`); names that did
not collide stay the same.
