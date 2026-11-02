---
"openapi-typesafe": patch
---

A `transform`, `postTransform` or `transformProperty` callback that returns a value that is not a
TypeScript node (a plain object, or text from `postTransform`) now fails with
`CALLBACK_RESULT_UNREADABLE` and names the callback and the schema path, instead of
`Debug Failure. Unhandled SyntaxKind` or a `TypeError`. `transform` returning text still keeps the
default type, as in openapi-typescript.
