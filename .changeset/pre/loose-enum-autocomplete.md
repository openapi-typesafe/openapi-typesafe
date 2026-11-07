---
"openapi-typesafe": minor
---

A `type: string` enum with `additionalProperties: true` is typed `("a" | "b") | (string & {})`, so
editors suggest the values while other strings are accepted (upstream PR [#2415](https://github.com/openapi-ts/openapi-typescript/pull/2415)). On by
default: openapi-typescript 7.13.0 typed such enums `"a" | "b"`.
