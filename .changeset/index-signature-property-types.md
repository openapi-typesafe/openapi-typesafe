---
"openapi-typesafe": patch
---

An index signature from `additionalProperties` or `patternProperties` also takes the types of the
properties next to it that it does not admit (`{ total: number } & { [key: string]: string |
number }`). TypeScript checks the signature against the declared keys too, so the old type took no
value with those properties.
