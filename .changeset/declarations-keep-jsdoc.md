---
"openapi-typesafe": patch
"openapi-typesafe-helpers": patch
"openapi-typesafe-react-query": patch
---

The published type declarations keep their JSDoc comments. Editors now show the descriptions of
options and helpers, and strike through the exports that are deprecated in 1.x and removed in 2.0
(`stringToAST`, `walk`, `tsEnum`, `QUESTION_TOKEN` and the others listed in the Node API docs,
and `GetValueWithDefault`, `FindRequiredKeys` and `HasRequiredKeys` in the helpers). Before, the
build removed every comment, so the `@deprecated` tags never reached users.
