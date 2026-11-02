---
"openapi-typesafe": patch
---

`--make-paths-enum` no longer writes an `ApiPaths` enum that does not compile. Names built from
the URL that collided (`GetUser` for both `/user` and `/user/{user_id}`) now name the path
parameters (`GetUserByUserId`), and a name that still repeats, such as a repeated `operationId`,
gets a number (`listItems2`). Names that did not collide are unchanged.
