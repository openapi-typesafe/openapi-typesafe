---
"openapi-typesafe-migrate": patch
---

A `transform` that returns an array of a one-member union (`createArrayTypeNode(
createUnionTypeNode([DATE_OR_NULL]))`, where `DATE_OR_NULL` is `Date | null`) is rewritten to
`"(Date | null)[]"`. Before, the parentheses were lost and the type text was `"Date | null[]"`, a
different type that still compiled.
