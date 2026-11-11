---
"openapi-typesafe": patch
---

`--fix exploded-query-objects`: an exploded object with `additionalProperties` next to other query
parameters no longer makes the whole `query` type unusable. Its index signature also takes the
value types of the other query keys (`{ page?: number } & Partial<{ [key: string]: string | number
| undefined }>`), since TypeScript checks it against `page` too. A `$ref` to such an object is
written out in place when other query keys are next to it.
